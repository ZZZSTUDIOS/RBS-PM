// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OutcomeToken.sol";

/**
 * @title LMSR (Logarithmic Market Scoring Rule) AMM
 * @notice Prediction market AMM using Hanson's LMSR for pricing
 * @dev Uses native MON as collateral, mints/burns outcome tokens
 */
contract LMSR is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    OutcomeToken public immutable yesToken;
    OutcomeToken public immutable noToken;

    string public question;
    uint256 public resolutionTime;
    address public oracle;

    // LMSR liquidity parameter (higher = more liquidity, less price impact)
    uint256 public immutable b; // Scaled by 1e18

    // Outstanding shares for each outcome
    uint256 public yesShares;
    uint256 public noShares;

    // Market state
    bool public resolved;
    bool public yesWins;

    // Funding
    uint256 public totalCollateral;

    // ============ Events ============

    event SharesPurchased(address indexed buyer, bool isYes, uint256 shares, uint256 cost);
    event SharesSold(address indexed seller, bool isYes, uint256 shares, uint256 payout);
    event MarketResolved(bool yesWins);
    event Redeemed(address indexed user, uint256 shares, uint256 payout);
    event LiquidityAdded(address indexed provider, uint256 amount);

    // ============ Errors ============

    error MarketAlreadyResolved();
    error MarketNotResolved();
    error NotOracle();
    error ResolutionTooEarly();
    error InsufficientPayment();
    error InvalidAmount();
    error TransferFailed();

    // ============ Constructor ============

    constructor(
        string memory _question,
        uint256 _resolutionTime,
        address _oracle,
        uint256 _liquidityParam, // e.g., 100e18 for moderate liquidity
        string memory _yesName,
        string memory _yesSymbol,
        string memory _noName,
        string memory _noSymbol
    ) Ownable(msg.sender) {
        question = _question;
        resolutionTime = _resolutionTime;
        oracle = _oracle;
        b = _liquidityParam;

        // Deploy outcome tokens (this contract is the owner/minter)
        yesToken = new OutcomeToken(_yesName, _yesSymbol, 18, 0, address(this));
        noToken = new OutcomeToken(_noName, _noSymbol, 18, 0, address(this));
    }

    // ============ Core LMSR Functions ============

    /**
     * @notice Calculate the cost function C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
     * @dev Uses fixed-point math approximation for exp and ln
     */
    function costFunction(uint256 _yesShares, uint256 _noShares) public view returns (uint256) {
        // C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
        // We use a scaled approximation

        // Calculate e^(qYes/b) and e^(qNo/b)
        uint256 expYes = _exp((_yesShares * 1e18) / b);
        uint256 expNo = _exp((_noShares * 1e18) / b);

        // Sum and take ln
        uint256 sum = expYes + expNo;
        uint256 lnSum = _ln(sum);

        // Multiply by b
        return (b * lnSum) / 1e18;
    }

    /**
     * @notice Get the cost to buy a certain number of shares
     * @param isYes Whether buying YES or NO shares
     * @param shares Number of shares to buy (scaled by 1e18)
     * @return cost Amount of MON required
     */
    function getCost(bool isYes, uint256 shares) public view returns (uint256 cost) {
        uint256 newYes = isYes ? yesShares + shares : yesShares;
        uint256 newNo = isYes ? noShares : noShares + shares;

        uint256 newCost = costFunction(newYes, newNo);
        uint256 currentCost = costFunction(yesShares, noShares);

        cost = newCost > currentCost ? newCost - currentCost : 0;
    }

    /**
     * @notice Get the payout for selling shares
     * @param isYes Whether selling YES or NO shares
     * @param shares Number of shares to sell (scaled by 1e18)
     * @return payout Amount of MON received
     */
    function getPayoutForSell(bool isYes, uint256 shares) public view returns (uint256 payout) {
        if (isYes && shares > yesShares) return 0;
        if (!isYes && shares > noShares) return 0;

        uint256 newYes = isYes ? yesShares - shares : yesShares;
        uint256 newNo = isYes ? noShares : noShares - shares;

        uint256 currentCost = costFunction(yesShares, noShares);
        uint256 newCost = costFunction(newYes, newNo);

        payout = currentCost > newCost ? currentCost - newCost : 0;
    }

    /**
     * @notice Get current price for YES outcome (0 to 1e18)
     */
    function getYesPrice() public view returns (uint256) {
        // Price = derivative of cost function = e^(qYes/b) / (e^(qYes/b) + e^(qNo/b))
        uint256 expYes = _exp((yesShares * 1e18) / b);
        uint256 expNo = _exp((noShares * 1e18) / b);
        return (expYes * 1e18) / (expYes + expNo);
    }

    /**
     * @notice Get current price for NO outcome (0 to 1e18)
     */
    function getNoPrice() public view returns (uint256) {
        return 1e18 - getYesPrice();
    }

    // ============ Trading Functions ============

    /**
     * @notice Buy outcome shares with MON
     * @param isYes Whether to buy YES or NO shares
     * @param minShares Minimum shares to receive (slippage protection)
     */
    function buy(bool isYes, uint256 minShares) external payable nonReentrant {
        if (resolved) revert MarketAlreadyResolved();
        if (msg.value == 0) revert InsufficientPayment();

        // Binary search to find how many shares we can buy with msg.value
        uint256 shares = _calculateSharesForPayment(isYes, msg.value);
        if (shares < minShares) revert InsufficientPayment();

        // Update state
        if (isYes) {
            yesShares += shares;
            yesToken.mint(msg.sender, shares);
        } else {
            noShares += shares;
            noToken.mint(msg.sender, shares);
        }

        totalCollateral += msg.value;

        emit SharesPurchased(msg.sender, isYes, shares, msg.value);
    }

    /**
     * @notice Sell outcome shares for MON
     * @param isYes Whether selling YES or NO shares
     * @param shares Number of shares to sell
     * @param minPayout Minimum MON to receive (slippage protection)
     */
    function sell(bool isYes, uint256 shares, uint256 minPayout) external nonReentrant {
        if (resolved) revert MarketAlreadyResolved();
        if (shares == 0) revert InvalidAmount();

        uint256 payout = getPayoutForSell(isYes, shares);
        if (payout < minPayout) revert InsufficientPayment();
        if (payout > totalCollateral) payout = totalCollateral;

        // Burn tokens
        if (isYes) {
            yesToken.transferFrom(msg.sender, address(this), shares);
            yesShares -= shares;
        } else {
            noToken.transferFrom(msg.sender, address(this), shares);
            noShares -= shares;
        }

        totalCollateral -= payout;

        // Send MON
        (bool success, ) = msg.sender.call{value: payout}("");
        if (!success) revert TransferFailed();

        emit SharesSold(msg.sender, isYes, shares, payout);
    }

    // ============ Resolution Functions ============

    /**
     * @notice Resolve the market (oracle only)
     * @param _yesWins True if YES wins, false if NO wins
     */
    function resolve(bool _yesWins) external {
        if (msg.sender != oracle) revert NotOracle();
        if (resolved) revert MarketAlreadyResolved();
        if (block.timestamp < resolutionTime) revert ResolutionTooEarly();

        resolved = true;
        yesWins = _yesWins;

        emit MarketResolved(_yesWins);
    }

    /**
     * @notice Redeem winning shares for MON after resolution
     */
    function redeem() external nonReentrant {
        if (!resolved) revert MarketNotResolved();

        OutcomeToken winningToken = yesWins ? yesToken : noToken;
        uint256 shares = winningToken.balanceOf(msg.sender);
        if (shares == 0) revert InvalidAmount();

        // Transfer tokens to this contract (effectively burning)
        winningToken.transferFrom(msg.sender, address(this), shares);

        // Calculate payout: proportional share of total collateral
        uint256 totalWinningShares = yesWins ? yesShares : noShares;
        uint256 payout = (shares * totalCollateral) / totalWinningShares;

        if (yesWins) {
            yesShares -= shares;
        } else {
            noShares -= shares;
        }
        totalCollateral -= payout;

        // Send MON
        (bool success, ) = msg.sender.call{value: payout}("");
        if (!success) revert TransferFailed();

        emit Redeemed(msg.sender, shares, payout);
    }

    // ============ Liquidity Functions ============

    /**
     * @notice Add liquidity to the market (increases collateral pool)
     */
    function addLiquidity() external payable {
        if (msg.value == 0) revert InvalidAmount();
        totalCollateral += msg.value;
        emit LiquidityAdded(msg.sender, msg.value);
    }

    receive() external payable {
        totalCollateral += msg.value;
        emit LiquidityAdded(msg.sender, msg.value);
    }

    // ============ View Functions ============

    function getMarketInfo() external view returns (
        string memory _question,
        uint256 _resolutionTime,
        address _oracle,
        uint256 _yesPrice,
        uint256 _noPrice,
        uint256 _yesShares,
        uint256 _noShares,
        uint256 _totalCollateral,
        bool _resolved,
        bool _yesWins
    ) {
        return (
            question,
            resolutionTime,
            oracle,
            getYesPrice(),
            getNoPrice(),
            yesShares,
            noShares,
            totalCollateral,
            resolved,
            yesWins
        );
    }

    // ============ Internal Math Functions ============

    /**
     * @notice Calculate shares that can be bought with a given payment
     */
    function _calculateSharesForPayment(bool isYes, uint256 payment) internal view returns (uint256) {
        // Binary search for the number of shares
        uint256 low = 0;
        uint256 high = payment * 2; // Upper bound estimate
        uint256 mid;

        for (uint256 i = 0; i < 64; i++) { // 64 iterations for precision
            mid = (low + high) / 2;
            uint256 cost = getCost(isYes, mid);

            if (cost <= payment) {
                low = mid;
            } else {
                high = mid;
            }

            if (high - low <= 1) break;
        }

        return low;
    }

    /**
     * @notice Approximation of e^x where x is scaled by 1e18
     * @dev Uses Taylor series expansion, accurate for reasonable ranges
     */
    function _exp(uint256 x) internal pure returns (uint256) {
        // Cap x to prevent overflow (e^6 ≈ 403)
        if (x > 6e18) x = 6e18;

        // Taylor series: e^x = 1 + x + x^2/2! + x^3/3! + ...
        uint256 result = 1e18;
        uint256 term = 1e18;

        for (uint256 i = 1; i <= 12; i++) {
            term = (term * x) / (i * 1e18);
            result += term;
            if (term < 1) break;
        }

        return result;
    }

    /**
     * @notice Approximation of ln(x) where x is scaled by 1e18
     * @dev Uses iterative reduction and Taylor series
     */
    function _ln(uint256 x) internal pure returns (uint256) {
        if (x < 1e18) return 0;
        if (x == 1e18) return 0;

        // Constants
        uint256 LN2 = 693147180559945309; // ln(2) scaled by 1e18

        // Reduce x to range [1, 2) by dividing by 2 and tracking count
        uint256 halvings = 0;
        while (x >= 2e18) {
            x = x / 2;
            halvings++;
        }

        // Now 1e18 <= x < 2e18, so y = x - 1e18 is in [0, 1e18)
        // Taylor series for ln(1+y) converges for |y| < 1
        uint256 y = x - 1e18;

        if (y == 0) {
            return halvings * LN2;
        }

        // ln(1+y) = y - y^2/2 + y^3/3 - y^4/4 + ...
        uint256 result = 0;
        uint256 term = y;
        bool positive = true;

        for (uint256 i = 1; i <= 30; i++) {
            if (positive) {
                result += term / i;
            } else {
                if (term / i > result) break;
                result -= term / i;
            }
            term = (term * y) / 1e18;
            positive = !positive;
            if (term < 1e6) break;
        }

        return result + halvings * LN2;
    }

    // ============ Admin Functions ============

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }
}
