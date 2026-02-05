// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DopplerPredictionMarket
 * @notice A simple prediction market that uses Doppler-launched tokens as outcome shares
 * @dev This contract acts as a wrapper around two Doppler tokens (YES/NO outcomes)
 *      and handles resolution + redemption logic
 */
contract DopplerPredictionMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    IERC20 public immutable yesToken;      // Doppler-launched YES outcome token
    IERC20 public immutable noToken;       // Doppler-launched NO outcome token  
    IERC20 public immutable collateral;    // Settlement currency (e.g., WMON, WETH)
    
    string public question;                // The prediction question
    uint256 public resolutionTime;         // When the market can be resolved
    
    enum Outcome { UNRESOLVED, YES, NO, INVALID }
    Outcome public outcome;
    
    bool public resolved;
    uint256 public collateralPerWinningToken;  // Redemption rate (scaled by 1e18)
    
    address public oracle;                 // Address authorized to resolve the market
    
    // ============ Events ============
    
    event MarketResolved(Outcome outcome, uint256 redemptionRate);
    event TokensRedeemed(address indexed user, uint256 winningTokens, uint256 collateralReceived);
    event OracleUpdated(address indexed newOracle);
    event CollateralDeposited(address indexed depositor, uint256 amount);

    // ============ Errors ============
    
    error MarketNotResolved();
    error MarketAlreadyResolved();
    error NotOracle();
    error ResolutionTooEarly();
    error InvalidOutcome();
    error NoWinningTokens();
    error InsufficientCollateral();

    // ============ Constructor ============

    /**
     * @param _yesToken Address of the Doppler YES token
     * @param _noToken Address of the Doppler NO token
     * @param _collateral Settlement currency address
     * @param _question The prediction market question
     * @param _resolutionTime Unix timestamp when resolution is allowed
     * @param _oracle Address authorized to resolve
     */
    constructor(
        address _yesToken,
        address _noToken,
        address _collateral,
        string memory _question,
        uint256 _resolutionTime,
        address _oracle
    ) Ownable(msg.sender) {
        yesToken = IERC20(_yesToken);
        noToken = IERC20(_noToken);
        collateral = IERC20(_collateral);
        question = _question;
        resolutionTime = _resolutionTime;
        oracle = _oracle;
        outcome = Outcome.UNRESOLVED;
    }

    // ============ Oracle Functions ============

    /**
     * @notice Resolve the market with the final outcome
     * @param _outcome The winning outcome (YES, NO, or INVALID)
     */
    function resolve(Outcome _outcome) external {
        if (msg.sender != oracle) revert NotOracle();
        if (resolved) revert MarketAlreadyResolved();
        if (block.timestamp < resolutionTime) revert ResolutionTooEarly();
        if (_outcome == Outcome.UNRESOLVED) revert InvalidOutcome();
        
        resolved = true;
        outcome = _outcome;
        
        // Calculate redemption rate based on collateral in contract
        uint256 totalCollateral = collateral.balanceOf(address(this));
        uint256 winningSupply;
        
        if (_outcome == Outcome.YES) {
            winningSupply = yesToken.totalSupply();
        } else if (_outcome == Outcome.NO) {
            winningSupply = noToken.totalSupply();
        } else {
            // INVALID: Split collateral between both token holders proportionally
            winningSupply = yesToken.totalSupply() + noToken.totalSupply();
        }
        
        if (winningSupply > 0) {
            collateralPerWinningToken = (totalCollateral * 1e18) / winningSupply;
        }
        
        emit MarketResolved(_outcome, collateralPerWinningToken);
    }

    // ============ User Functions ============

    /**
     * @notice Redeem winning tokens for collateral after resolution
     * @param amount Amount of winning tokens to redeem
     */
    function redeem(uint256 amount) external nonReentrant {
        if (!resolved) revert MarketNotResolved();
        if (amount == 0) revert NoWinningTokens();
        
        IERC20 winningToken;
        
        if (outcome == Outcome.YES) {
            winningToken = yesToken;
        } else if (outcome == Outcome.NO) {
            winningToken = noToken;
        } else if (outcome == Outcome.INVALID) {
            // For INVALID, allow redemption of either token
            // Check which token user wants to redeem
            uint256 yesBalance = yesToken.balanceOf(msg.sender);
            uint256 noBalance = noToken.balanceOf(msg.sender);
            
            if (yesBalance >= amount) {
                winningToken = yesToken;
            } else if (noBalance >= amount) {
                winningToken = noToken;
            } else {
                revert NoWinningTokens();
            }
        } else {
            revert InvalidOutcome();
        }
        
        // Transfer tokens from user (burns them effectively by holding in contract)
        winningToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Calculate and transfer collateral
        uint256 collateralAmount = (amount * collateralPerWinningToken) / 1e18;
        if (collateralAmount == 0) revert InsufficientCollateral();
        
        collateral.safeTransfer(msg.sender, collateralAmount);
        
        emit TokensRedeemed(msg.sender, amount, collateralAmount);
    }

    /**
     * @notice Deposit collateral to back the market
     * @param amount Amount of collateral to deposit
     */
    function depositCollateral(uint256 amount) external {
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralDeposited(msg.sender, amount);
    }

    // ============ View Functions ============

    /**
     * @notice Get the current redemption value for a given amount of winning tokens
     */
    function getRedemptionValue(uint256 tokenAmount) external view returns (uint256) {
        if (!resolved) return 0;
        return (tokenAmount * collateralPerWinningToken) / 1e18;
    }

    /**
     * @notice Check if an address holds any winning tokens
     */
    function hasWinningTokens(address user) external view returns (bool, uint256) {
        if (!resolved) return (false, 0);
        
        if (outcome == Outcome.YES) {
            uint256 balance = yesToken.balanceOf(user);
            return (balance > 0, balance);
        } else if (outcome == Outcome.NO) {
            uint256 balance = noToken.balanceOf(user);
            return (balance > 0, balance);
        } else if (outcome == Outcome.INVALID) {
            uint256 totalBalance = yesToken.balanceOf(user) + noToken.balanceOf(user);
            return (totalBalance > 0, totalBalance);
        }
        
        return (false, 0);
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    /**
     * @notice Emergency withdraw (only before resolution)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (resolved) revert MarketAlreadyResolved();
        IERC20(token).safeTransfer(owner(), amount);
    }
}
