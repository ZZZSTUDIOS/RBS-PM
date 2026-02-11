// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./OutcomeToken.sol";

/**
 * @title LS-LMSR with ERC20 Collateral (USDC)
 * @notice Prediction market AMM using Othman et al.'s liquidity-sensitive variant
 * @dev Uses USDC (or any ERC20) as collateral instead of native token
 *
 * Key differences from native token version:
 * - Collateral is USDC (6 decimals) instead of MON (18 decimals)
 * - Requires approve() before buy()
 * - All amounts in collateral token decimals (typically 6 for USDC)
 */
contract LSLMSR_ERC20 is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    OutcomeToken public immutable yesToken;
    OutcomeToken public immutable noToken;
    IERC20 public immutable collateralToken; // USDC
    uint8 public immutable collateralDecimals;

    string public question;
    uint256 public resolutionTime;
    address public oracle;

    // LS-LMSR parameters (scaled by 1e18 for precision)
    uint256 public immutable alpha;
    uint256 public immutable minLiquidity;

    // Outstanding shares (scaled by 1e18)
    uint256 public yesShares;
    uint256 public noShares;

    // Market state
    bool public resolved;
    bool public yesWins;

    // Funding (in collateral token decimals)
    uint256 public totalCollateral;

    // Fee configuration
    uint256 public constant TRADING_FEE_BPS = 50; // 0.5% - 100% goes to market creator
    uint256 public constant FEE_DENOMINATOR = 10000;
    address public marketCreator;

    // Accumulated fees
    uint256 public creatorFeesAccrued;
    uint256 public creatorLiquidityBuffer;

    // Scaling factor for shares to collateral conversion
    uint256 public immutable SHARE_SCALE; // 1e18 / 10^collateralDecimals

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
    error InsufficientAllowance();
    error MarketNotInitialized();

    // ============ Constructor ============

    // Track if market is initialized (liquidity seeded)
    bool public initialized;

    constructor(
        address _collateralToken,
        uint8 _collateralDecimals,
        string memory _question,
        uint256 _resolutionTime,
        address _oracle,
        uint256 _alpha,
        uint256 _minLiquidity,
        uint256 _initialYesShares,
        uint256 _initialNoShares,
        string memory _yesName,
        string memory _yesSymbol,
        string memory _noName,
        string memory _noSymbol
    ) Ownable(msg.sender) {
        if (_alpha == 0) revert InvalidParameters();
        if (_resolutionTime <= block.timestamp) revert InvalidParameters();
        if (_oracle == address(0)) revert InvalidParameters();
        if (_initialYesShares == 0 || _initialNoShares == 0) revert InvalidParameters();
        if (_collateralToken == address(0)) revert InvalidParameters();

        collateralToken = IERC20(_collateralToken);
        collateralDecimals = _collateralDecimals;
        SHARE_SCALE = 10 ** (18 - _collateralDecimals);

        question = _question;
        resolutionTime = _resolutionTime;
        oracle = _oracle;
        alpha = _alpha;
        minLiquidity = _minLiquidity;
        marketCreator = msg.sender;

        // Deploy outcome tokens
        yesToken = new OutcomeToken(_yesName, _yesSymbol, 18, 0, address(this));
        noToken = new OutcomeToken(_noName, _noSymbol, 18, 0, address(this));

        // Seed initial shares
        yesShares = _initialYesShares;
        noShares = _initialNoShares;
    }

    /**
     * @notice Initialize market with liquidity (call after deployment)
     * @param _initialLiquidity Amount of collateral to seed (in collateral decimals)
     * @dev Must be called by market creator before trading can begin
     */
    function initialize(uint256 _initialLiquidity) external {
        if (msg.sender != marketCreator) revert NotCreator();
        if (initialized) revert InvalidParameters();

        // Minimum 1 unit of collateral
        uint256 minBuffer = 10 ** collateralDecimals;
        if (_initialLiquidity < minBuffer) revert InsufficientLiquidityBuffer();

        // Transfer initial liquidity from creator
        collateralToken.safeTransferFrom(msg.sender, address(this), _initialLiquidity);
        creatorLiquidityBuffer = _initialLiquidity;
        totalCollateral = _initialLiquidity;

        initialized = true;
        emit LiquidityAdded(msg.sender, _initialLiquidity);
    }

    // ============ Core LS-LMSR Functions ============

    function liquidityParameter() public view returns (uint256) {
        uint256 totalShares = yesShares + noShares;
        uint256 dynamicB = (alpha * totalShares) / 1e18;
        return dynamicB > minLiquidity ? dynamicB : minLiquidity;
    }

    function costFunction(uint256 _yesShares, uint256 _noShares) public view returns (uint256) {
        uint256 totalShares = _yesShares + _noShares;
        uint256 b = (alpha * totalShares) / 1e18;
        if (b < minLiquidity) b = minLiquidity;

        uint256 expYes = _exp((_yesShares * 1e18) / b);
        uint256 expNo = _exp((_noShares * 1e18) / b);
        uint256 sum = expYes + expNo;
        uint256 lnSum = _ln(sum);

        return (b * lnSum) / 1e18;
    }

    /**
     * @notice Get cost in shares (1e18 scale)
     */
    function getCost(bool isYes, uint256 shares) public view returns (uint256 cost) {
        uint256 newYes = isYes ? yesShares + shares : yesShares;
        uint256 newNo = isYes ? noShares : noShares + shares;

        uint256 newCost = costFunction(newYes, newNo);
        uint256 currentCost = costFunction(yesShares, noShares);

        cost = newCost > currentCost ? newCost - currentCost : 0;
    }

    /**
     * @notice Convert share-scale cost to collateral decimals
     */
    function getCostInCollateral(bool isYes, uint256 shares) public view returns (uint256) {
        uint256 costInShares = getCost(isYes, shares);
        return costInShares / SHARE_SCALE;
    }

    function getPayoutForSell(bool isYes, uint256 shares) public view returns (uint256 payout) {
        if (isYes && shares > yesShares) return 0;
        if (!isYes && shares > noShares) return 0;

        uint256 newYes = isYes ? yesShares - shares : yesShares;
        uint256 newNo = isYes ? noShares : noShares - shares;

        if (newYes == 0 || newNo == 0) return 0;

        uint256 currentCost = costFunction(yesShares, noShares);
        uint256 newCost = costFunction(newYes, newNo);

        payout = currentCost > newCost ? currentCost - newCost : 0;
    }

    /**
     * @notice Get payout in collateral decimals
     */
    function getPayoutForSellInCollateral(bool isYes, uint256 shares) public view returns (uint256) {
        uint256 payoutInShares = getPayoutForSell(isYes, shares);
        return payoutInShares / SHARE_SCALE;
    }

    function getYesPrice() public view returns (uint256) {
        uint256 b = liquidityParameter();
        // Use identity: exp(a)/(exp(a)+exp(b)) = 1/(1+exp(b-a))
        // This keeps exp argument bounded to the difference, not absolute values
        if (yesShares >= noShares) {
            uint256 diff = ((yesShares - noShares) * 1e18) / b;
            uint256 expDiff = _exp(diff);
            // yesPrice = expDiff / (expDiff + 1) = expDiff * 1e18 / (expDiff + 1e18)
            return (expDiff * 1e18) / (expDiff + 1e18);
        } else {
            uint256 diff = ((noShares - yesShares) * 1e18) / b;
            uint256 expDiff = _exp(diff);
            // yesPrice = 1 / (1 + expDiff) = 1e18 / (1e18 + expDiff)
            return (1e18 * 1e18) / (1e18 + expDiff);
        }
    }

    function getNoPrice() public view returns (uint256) {
        uint256 b = liquidityParameter();
        // Use identity: exp(b)/(exp(a)+exp(b)) = 1/(1+exp(a-b))
        if (noShares >= yesShares) {
            uint256 diff = ((noShares - yesShares) * 1e18) / b;
            uint256 expDiff = _exp(diff);
            return (expDiff * 1e18) / (expDiff + 1e18);
        } else {
            uint256 diff = ((yesShares - noShares) * 1e18) / b;
            uint256 expDiff = _exp(diff);
            return (1e18 * 1e18) / (1e18 + expDiff);
        }
    }

    function getPriceSum() public view returns (uint256) {
        return getYesPrice() + getNoPrice();
    }

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
     * @notice Buy outcome shares with collateral (requires prior approval)
     * @param isYes Whether to buy YES or NO shares
     * @param collateralAmount Amount of collateral to spend (in collateral decimals)
     * @param minShares Minimum shares to receive
     */
    function buy(bool isYes, uint256 collateralAmount, uint256 minShares) external nonReentrant whenNotPaused {
        if (!initialized) revert MarketNotInitialized();
        if (resolved) revert MarketAlreadyResolved();
        if (collateralAmount == 0) revert InsufficientPayment();

        // Transfer collateral from user
        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);

        // Calculate trading fee (0.5% goes 100% to market creator)
        uint256 tradingFee = (collateralAmount * TRADING_FEE_BPS) / FEE_DENOMINATOR;
        uint256 paymentAfterFee = collateralAmount - tradingFee;

        // Accumulate creator fee (100% of trading fee)
        creatorFeesAccrued += tradingFee;

        emit TradingFeeCollected(tradingFee);

        // Convert collateral to share-scale for calculation
        uint256 paymentInShareScale = paymentAfterFee * SHARE_SCALE;

        // Calculate shares
        uint256 shares = _calculateSharesForPayment(isYes, paymentInShareScale);
        if (shares < minShares) revert InsufficientPayment();
        if (shares == 0) revert InvalidAmount();

        // Calculate actual cost in share scale
        uint256 actualCostInShareScale = getCost(isYes, shares);
        uint256 actualCostInCollateral = actualCostInShareScale / SHARE_SCALE;

        // Update state
        if (isYes) {
            yesShares += shares;
            yesToken.mint(msg.sender, shares);
        } else {
            noShares += shares;
            noToken.mint(msg.sender, shares);
        }

        totalCollateral += actualCostInCollateral;

        // Refund excess
        if (paymentAfterFee > actualCostInCollateral) {
            uint256 refund = paymentAfterFee - actualCostInCollateral;
            collateralToken.safeTransfer(msg.sender, refund);
        }

        emit SharesPurchased(msg.sender, isYes, shares, actualCostInCollateral);
    }

    /**
     * @notice Sell outcome shares for collateral
     */
    function sell(bool isYes, uint256 shares, uint256 minPayout) external nonReentrant whenNotPaused {
        if (resolved) revert MarketAlreadyResolved();
        if (shares == 0) revert InvalidAmount();

        // Enforce minimum shares
        if (isYes) {
            if (shares > yesShares - 1e18) revert InsufficientShares();
        } else {
            if (shares > noShares - 1e18) revert InsufficientShares();
        }

        uint256 grossPayoutInShareScale = getPayoutForSell(isYes, shares);
        uint256 grossPayout = grossPayoutInShareScale / SHARE_SCALE;
        if (grossPayout > totalCollateral) grossPayout = totalCollateral;

        // Calculate fee (0.5% goes 100% to market creator)
        uint256 tradingFee = (grossPayout * TRADING_FEE_BPS) / FEE_DENOMINATOR;
        uint256 netPayout = grossPayout - tradingFee;

        if (netPayout < minPayout) revert InsufficientPayment();

        // Accumulate creator fee (100% of trading fee)
        creatorFeesAccrued += tradingFee;

        emit TradingFeeCollected(tradingFee);

        // Burn tokens
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

        // Send collateral
        collateralToken.safeTransfer(msg.sender, netPayout);

        emit SharesSold(msg.sender, isYes, shares, netPayout);
    }

    // ============ Resolution Functions ============

    function resolve(bool _yesWins) external {
        if (msg.sender != oracle) revert NotOracle();
        if (resolved) revert MarketAlreadyResolved();
        if (block.timestamp < resolutionTime) revert ResolutionTooEarly();

        resolved = true;
        yesWins = _yesWins;

        emit MarketResolved(_yesWins);
    }

    /**
     * @notice Redeem winning shares for collateral
     * @dev 1 share (1e18) = 1 unit of collateral (10^decimals)
     */
    function redeem() external nonReentrant {
        if (!resolved) revert MarketNotResolved();

        OutcomeToken winningToken = yesWins ? yesToken : noToken;
        uint256 shares = winningToken.balanceOf(msg.sender);
        if (shares == 0) revert InvalidAmount();

        winningToken.transferFrom(msg.sender, address(this), shares);
        winningToken.burn(shares);

        // 1 share (1e18) = 1 collateral unit (10^decimals)
        uint256 payout = shares / SHARE_SCALE;
        if (payout > totalCollateral) {
            payout = totalCollateral;
        }

        if (yesWins) {
            yesShares -= shares;
        } else {
            noShares -= shares;
        }
        totalCollateral -= payout;

        collateralToken.safeTransfer(msg.sender, payout);

        emit Redeemed(msg.sender, shares, payout);
    }

    // ============ Liquidity Functions ============

    function addLiquidity(uint256 amount) external {
        if (amount == 0) revert InvalidAmount();
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        totalCollateral += amount;
        emit LiquidityAdded(msg.sender, amount);
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

    function getCollateralInfo() external view returns (
        address token,
        uint8 decimals,
        string memory symbol
    ) {
        // Get symbol via low-level call to avoid interface issues
        return (address(collateralToken), collateralDecimals, "USDC");
    }

    // ============ Internal Math Functions ============

    function estimateSharesForPayment(bool isYes, uint256 grossPayment) external view returns (uint256) {
        uint256 paymentAfterFee = grossPayment - (grossPayment * TRADING_FEE_BPS) / FEE_DENOMINATOR;
        uint256 paymentInShareScale = paymentAfterFee * SHARE_SCALE;
        return _calculateSharesForPayment(isYes, paymentInShareScale);
    }

    function _calculateSharesForPayment(bool isYes, uint256 paymentInShareScale) internal view returns (uint256) {
        uint256 low = 0;
        uint256 high = paymentInShareScale > type(uint256).max / 2 ? type(uint256).max : paymentInShareScale * 2;
        uint256 mid;

        for (uint256 i = 0; i < 64; i++) {
            mid = (low + high) / 2;
            uint256 cost = getCost(isYes, mid);

            if (cost <= paymentInShareScale) {
                low = mid;
            } else {
                high = mid;
            }

            if (high - low <= 1) break;
        }

        return low;
    }

    function _exp(uint256 x) internal pure returns (uint256) {
        if (x > 6e18) x = 6e18;

        uint256 result = 1e18;
        uint256 term = 1e18;

        for (uint256 i = 1; i <= 12; i++) {
            term = (term * x) / (i * 1e18);
            result += term;
            if (term < 1) break;
        }

        return result;
    }

    function _ln(uint256 x) internal pure returns (uint256) {
        if (x < 1e18) return 0;
        if (x == 1e18) return 0;

        uint256 LN2 = 693147180559945309;

        uint256 halvings = 0;
        while (x >= 2e18) {
            x = x / 2;
            halvings++;
        }

        uint256 y = x - 1e18;

        if (y == 0) {
            return halvings * LN2;
        }

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

    function transferCreator(address _newCreator) external onlyOwner {
        if (_newCreator == address(0)) revert InvalidParameters();
        marketCreator = _newCreator;
    }

    // ============ Fee Claiming Functions ============

    function claimCreatorFees() external nonReentrant {
        if (msg.sender != marketCreator) revert NotCreator();
        if (!resolved) revert MarketNotResolved();

        uint256 amount = creatorFeesAccrued;
        if (amount == 0) revert NoFeesToClaim();

        creatorFeesAccrued = 0;

        collateralToken.safeTransfer(marketCreator, amount);

        emit CreatorFeesClaimed(marketCreator, amount);
    }

    function withdrawExcessCollateral() external nonReentrant {
        if (msg.sender != marketCreator) revert NotCreator();
        if (!resolved) revert MarketNotResolved();

        if (totalCollateral == 0) revert NoFeesToClaim();

        // Calculate collateral owed to unredeemed winning token holders
        OutcomeToken winningToken = yesWins ? yesToken : noToken;
        uint256 outstandingShares = winningToken.totalSupply();
        uint256 owedToWinners = outstandingShares / SHARE_SCALE;

        // Only allow withdrawal of excess above what's owed
        if (totalCollateral <= owedToWinners) revert NoFeesToClaim();
        uint256 amount = totalCollateral - owedToWinners;

        totalCollateral -= amount;

        collateralToken.safeTransfer(marketCreator, amount);

        emit ExcessCollateralWithdrawn(marketCreator, amount);
    }

    function getFeeInfo() external view returns (uint256 pendingCreatorFees) {
        return creatorFeesAccrued;
    }
}
