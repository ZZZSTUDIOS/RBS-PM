// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./OutcomeToken.sol";

/**
 * @title LS-LMSR (Liquidity-Sensitive Logarithmic Market Scoring Rule)
 * @notice Prediction market AMM using Othman et al.'s liquidity-sensitive variant
 * @dev Key improvement: b(q) = α × (qYes + qNo) instead of fixed b
 *
 * Benefits over standard LMSR:
 * - Liquidity grows with trading volume
 * - Bounded, arbitrarily small worst-case loss
 * - Can run at profit (prices sum to > 1)
 * - Path independent
 *
 * Reference: "A Practical Liquidity-Sensitive Automated Market Maker" (Othman et al., 2013)
 */
contract LSLMSR is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    OutcomeToken public immutable yesToken;
    OutcomeToken public immutable noToken;

    string public question;
    uint256 public resolutionTime;
    address public oracle;

    // LS-LMSR parameters
    // α (alpha) controls the spread/commission - higher = more spread, more profit potential
    // Recommended: 0.01-0.05 (1-5% max spread for binary market)
    // Max spread = 1 + α × n × ln(n) where n = 2 for binary
    uint256 public immutable alpha; // Scaled by 1e18

    // Minimum b to prevent division issues at market start
    uint256 public immutable minLiquidity; // Scaled by 1e18

    // Outstanding shares for each outcome
    uint256 public yesShares;
    uint256 public noShares;

    // Market state
    bool public resolved;
    bool public yesWins;

    // Funding
    uint256 public totalCollateral;

    // Fee configuration
    uint256 public constant TRADING_FEE_BPS = 50; // 0.5% - 100% goes to market creator
    uint256 public constant FEE_DENOMINATOR = 10000;
    address public immutable marketCreator;

    // Accumulated fees
    uint256 public creatorFeesAccrued;

    // Liquidity buffer deposited by creator at market creation
    // Helps ensure solvency for 1 MON per winning share redemptions
    uint256 public creatorLiquidityBuffer;

    // ============ Events ============

    event SharesPurchased(address indexed buyer, bool isYes, uint256 shares, uint256 cost);
    event SharesSold(address indexed seller, bool isYes, uint256 shares, uint256 payout);
    event MarketResolved(bool yesWins);
    event Redeemed(address indexed user, uint256 shares, uint256 payout);
    event LiquidityAdded(address indexed provider, uint256 amount);
    event OracleChanged(address indexed oldOracle, address indexed newOracle);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);
    event TradingFeeCollected(uint256 totalFee);
    event ExcessCollateralWithdrawn(address indexed creator, uint256 amount);

    // ============ Errors ============

    error MarketAlreadyResolved();
    error MarketNotResolved();
    error NotOracle();
    error ResolutionTooEarly();
    error InsufficientPayment();
    error InvalidAmount();
    error TransferFailed();
    error InvalidParameters();
    error InsufficientShares();
    error NotCreator();
    error NoFeesToClaim();
    error InsufficientLiquidityBuffer();
    error RedemptionsNotComplete();

    // ============ Constructor ============

    constructor(
        string memory _question,
        uint256 _resolutionTime,
        address _oracle,
        uint256 _alpha, // e.g., 0.03e18 for 3% max spread
        uint256 _minLiquidity, // e.g., 10e18 minimum effective b
        uint256 _initialYesShares, // Initial seeding for liquidity sensitivity
        uint256 _initialNoShares,
        string memory _yesName,
        string memory _yesSymbol,
        string memory _noName,
        string memory _noSymbol
    ) payable Ownable(msg.sender) {
        if (_alpha == 0) revert InvalidParameters();
        if (_resolutionTime <= block.timestamp) revert InvalidParameters();
        if (_oracle == address(0)) revert InvalidParameters();
        if (_initialYesShares == 0 || _initialNoShares == 0) revert InvalidParameters();
        // Require liquidity buffer from creator (minimum 1 MON)
        // Recommended: 2-5% of expected total trading volume
        // Example: If expecting 1000 MON in trades, deposit 20-50 MON buffer
        if (msg.value < 1 ether) revert InsufficientLiquidityBuffer();

        question = _question;
        resolutionTime = _resolutionTime;
        oracle = _oracle;
        alpha = _alpha;
        minLiquidity = _minLiquidity;
        marketCreator = msg.sender; // Market creator is the deployer

        // Track creator's liquidity buffer and add to collateral
        creatorLiquidityBuffer = msg.value;
        totalCollateral = msg.value;

        // Deploy outcome tokens (this contract is the owner/minter)
        yesToken = new OutcomeToken(_yesName, _yesSymbol, 18, 0, address(this));
        noToken = new OutcomeToken(_noName, _noSymbol, 18, 0, address(this));

        // Seed initial shares (held by contract, not minted to anyone)
        // This bootstraps the liquidity-sensitive mechanism
        yesShares = _initialYesShares;
        noShares = _initialNoShares;
    }

    // ============ Core LS-LMSR Functions ============

    /**
     * @notice Calculate the dynamic liquidity parameter b(q)
     * @dev b(q) = α × (qYes + qNo), with minimum floor
     */
    function liquidityParameter() public view returns (uint256) {
        uint256 totalShares = yesShares + noShares;
        uint256 dynamicB = (alpha * totalShares) / 1e18;

        // Ensure minimum liquidity to prevent extreme price sensitivity
        return dynamicB > minLiquidity ? dynamicB : minLiquidity;
    }

    /**
     * @notice Calculate the cost function C(q) = b(q) × ln(e^(qYes/b) + e^(qNo/b))
     * @dev Uses the current dynamic b value
     */
    function costFunction(uint256 _yesShares, uint256 _noShares) public view returns (uint256) {
        uint256 totalShares = _yesShares + _noShares;
        uint256 b = (alpha * totalShares) / 1e18;
        if (b < minLiquidity) b = minLiquidity;

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
        // LS-LMSR: Can only sell shares that exist in the market
        if (isYes && shares > yesShares) return 0;
        if (!isYes && shares > noShares) return 0;

        uint256 newYes = isYes ? yesShares - shares : yesShares;
        uint256 newNo = isYes ? noShares : noShares - shares;

        // Ensure we don't go below minimum shares
        if (newYes == 0 || newNo == 0) return 0;

        uint256 currentCost = costFunction(yesShares, noShares);
        uint256 newCost = costFunction(newYes, newNo);

        payout = currentCost > newCost ? currentCost - newCost : 0;
    }

    /**
     * @notice Get current price for YES outcome
     * @dev In LS-LMSR, prices can sum to > 1 (that's the spread/profit margin)
     */
    function getYesPrice() public view returns (uint256) {
        uint256 b = liquidityParameter();
        uint256 expYes = _exp((yesShares * 1e18) / b);
        uint256 expNo = _exp((noShares * 1e18) / b);
        return (expYes * 1e18) / (expYes + expNo);
    }

    /**
     * @notice Get current price for NO outcome
     */
    function getNoPrice() public view returns (uint256) {
        uint256 b = liquidityParameter();
        uint256 expYes = _exp((yesShares * 1e18) / b);
        uint256 expNo = _exp((noShares * 1e18) / b);
        return (expNo * 1e18) / (expYes + expNo);
    }

    /**
     * @notice Get the sum of prices (will be >= 1, difference is the spread)
     * @dev Sum approaches 1 + α×n×ln(n) when shares are equal
     */
    function getPriceSum() public view returns (uint256) {
        return getYesPrice() + getNoPrice();
    }

    /**
     * @notice Get normalized probability (prices divided by sum)
     */
    function getYesProbability() public view returns (uint256) {
        uint256 yesPrice = getYesPrice();
        uint256 priceSum = getPriceSum();
        return (yesPrice * 1e18) / priceSum;
    }

    function getNoProbability() public view returns (uint256) {
        return 1e18 - getYesProbability();
    }

    // ============ Trading Functions ============

    /**
     * @notice Buy outcome shares with MON
     * @param isYes Whether to buy YES or NO shares
     * @param minShares Minimum shares to receive (slippage protection)
     * @dev 1% fee is collected on the payment: 50% to protocol, 50% to market creator
     */
    function buy(bool isYes, uint256 minShares) external payable nonReentrant whenNotPaused {
        if (resolved) revert MarketAlreadyResolved();
        if (msg.value == 0) revert InsufficientPayment();

        // Calculate trading fee (0.5% of payment - 100% to creator)
        uint256 tradingFee = (msg.value * TRADING_FEE_BPS) / FEE_DENOMINATOR;
        uint256 paymentAfterFee = msg.value - tradingFee;

        // Accumulate creator fee (100% of trading fee, claimable after resolution)
        creatorFeesAccrued += tradingFee;

        emit TradingFeeCollected(tradingFee);

        // Binary search to find how many shares we can buy with payment after fee
        uint256 shares = _calculateSharesForPayment(isYes, paymentAfterFee);
        if (shares < minShares) revert InsufficientPayment();
        if (shares == 0) revert InvalidAmount();

        // Calculate actual cost
        uint256 actualCost = getCost(isYes, shares);

        // Update state
        if (isYes) {
            yesShares += shares;
            yesToken.mint(msg.sender, shares);
        } else {
            noShares += shares;
            noToken.mint(msg.sender, shares);
        }

        totalCollateral += actualCost;

        // Refund excess payment (from payment after fee)
        if (paymentAfterFee > actualCost) {
            uint256 refund = paymentAfterFee - actualCost;
            (bool refunded, ) = msg.sender.call{value: refund}("");
            if (!refunded) revert TransferFailed();
        }

        emit SharesPurchased(msg.sender, isYes, shares, actualCost);
    }

    /**
     * @notice Sell outcome shares for MON
     * @param isYes Whether selling YES or NO shares
     * @param shares Number of shares to sell
     * @param minPayout Minimum MON to receive (slippage protection)
     * @dev 1% fee is collected on the payout: 50% to protocol, 50% to market creator
     */
    function sell(bool isYes, uint256 shares, uint256 minPayout) external nonReentrant whenNotPaused {
        if (resolved) revert MarketAlreadyResolved();
        if (shares == 0) revert InvalidAmount();

        // LS-LMSR: Enforce forward-only movement - can't reduce shares below minimum
        if (isYes) {
            if (shares > yesShares - 1e18) revert InsufficientShares(); // Keep at least 1 share
        } else {
            if (shares > noShares - 1e18) revert InsufficientShares();
        }

        uint256 grossPayout = getPayoutForSell(isYes, shares);
        if (grossPayout > totalCollateral) grossPayout = totalCollateral;

        // Calculate trading fee (0.5% of payout - 100% to creator)
        uint256 tradingFee = (grossPayout * TRADING_FEE_BPS) / FEE_DENOMINATOR;
        uint256 netPayout = grossPayout - tradingFee;

        if (netPayout < minPayout) revert InsufficientPayment();

        // Accumulate creator fee (100% of trading fee, claimable after resolution)
        creatorFeesAccrued += tradingFee;

        emit TradingFeeCollected(tradingFee);

        // Transfer and burn tokens
        if (isYes) {
            yesToken.transferFrom(msg.sender, address(this), shares);
            yesToken.burn(shares);
            yesShares -= shares;
        } else {
            noToken.transferFrom(msg.sender, address(this), shares);
            noToken.burn(shares);
            noShares -= shares;
        }

        totalCollateral -= grossPayout;

        // Send MON (net payout after fee)
        (bool success, ) = msg.sender.call{value: netPayout}("");
        if (!success) revert TransferFailed();

        emit SharesSold(msg.sender, isYes, shares, netPayout);
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
     * @dev Winning shares are worth 1 MON each (1e18 wei per 1e18 shares)
     */
    function redeem() external nonReentrant {
        if (!resolved) revert MarketNotResolved();

        OutcomeToken winningToken = yesWins ? yesToken : noToken;
        uint256 shares = winningToken.balanceOf(msg.sender);
        if (shares == 0) revert InvalidAmount();

        // Transfer and burn tokens
        winningToken.transferFrom(msg.sender, address(this), shares);
        winningToken.burn(shares);

        // Payout is 1 MON per share (shares are scaled by 1e18)
        // Cap at available collateral to prevent insolvency
        uint256 payout = shares;
        if (payout > totalCollateral) {
            payout = totalCollateral;
        }

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
        uint256 _yesProbability,
        uint256 _noProbability,
        uint256 _yesShares,
        uint256 _noShares,
        uint256 _totalCollateral,
        uint256 _liquidityParam,
        uint256 _priceSum,
        bool _resolved,
        bool _yesWins
    ) {
        return (
            question,
            resolutionTime,
            oracle,
            getYesPrice(),
            getNoPrice(),
            getYesProbability(),
            getNoProbability(),
            yesShares,
            noShares,
            totalCollateral,
            liquidityParameter(),
            getPriceSum(),
            resolved,
            yesWins
        );
    }

    // ============ Internal Math Functions ============

    /**
     * @notice Estimate shares that can be bought with a given payment (before fee)
     * @param isYes Whether buying YES or NO shares
     * @param grossPayment The total payment amount (fee will be deducted internally)
     * @return shares The estimated number of shares
     */
    function estimateSharesForPayment(bool isYes, uint256 grossPayment) external view returns (uint256) {
        uint256 paymentAfterFee = grossPayment - (grossPayment * TRADING_FEE_BPS) / FEE_DENOMINATOR;
        return _calculateSharesForPayment(isYes, paymentAfterFee);
    }

    /**
     * @notice Calculate shares that can be bought with a given payment
     */
    function _calculateSharesForPayment(bool isYes, uint256 payment) internal view returns (uint256) {
        // Binary search for the number of shares
        uint256 low = 0;
        uint256 high = payment > type(uint256).max / 2 ? type(uint256).max : payment * 2;
        uint256 mid;

        for (uint256 i = 0; i < 64; i++) {
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
        if (_oracle == address(0)) revert InvalidParameters();
        address oldOracle = oracle;
        oracle = _oracle;
        emit OracleChanged(oldOracle, _oracle);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Fee Claiming Functions ============

    /**
     * @notice Market creator can claim accumulated fees only after market is resolved
     */
    function claimCreatorFees() external nonReentrant {
        if (msg.sender != marketCreator) revert NotCreator();
        if (!resolved && block.timestamp < resolutionTime) revert MarketNotResolved();

        uint256 amount = creatorFeesAccrued;
        if (amount == 0) revert NoFeesToClaim();

        creatorFeesAccrued = 0;

        (bool success, ) = marketCreator.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit CreatorFeesClaimed(marketCreator, amount);
    }

    /**
     * @notice Creator can withdraw excess collateral after resolution
     * @dev Call after all winners have redeemed to recover remaining funds
     */
    function withdrawExcessCollateral() external nonReentrant {
        if (msg.sender != marketCreator) revert NotCreator();
        if (!resolved) revert MarketNotResolved();

        // Allow withdrawal of any remaining collateral after resolution
        if (totalCollateral == 0) revert NoFeesToClaim();

        uint256 amount = totalCollateral;
        totalCollateral = 0;

        (bool success, ) = marketCreator.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit ExcessCollateralWithdrawn(marketCreator, amount);
    }

    /**
     * @notice View pending creator fees
     */
    function getFeeInfo() external view returns (uint256 pendingCreatorFees) {
        return creatorFeesAccrued;
    }
}
