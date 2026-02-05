// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./PredictionMarket.sol";

/**
 * @title PredictionMarketFactory
 * @notice Factory for creating prediction markets with Doppler-launched outcome tokens
 * @dev Integrates with Doppler's Airlock contract for token creation
 */
contract PredictionMarketFactory is Ownable {
    
    // ============ State Variables ============
    
    address public dopplerAirlock;      // Doppler's Airlock contract
    address public defaultCollateral;    // Default settlement currency (e.g., WMON)
    
    // Track all markets created
    address[] public markets;
    mapping(address => bool) public isMarket;
    
    // Market metadata
    struct MarketInfo {
        address market;
        address yesToken;
        address noToken;
        string question;
        uint256 resolutionTime;
        address creator;
        uint256 createdAt;
    }
    
    mapping(address => MarketInfo) public marketInfo;
    
    // ============ Events ============
    
    event MarketCreated(
        address indexed market,
        address yesToken,
        address noToken,
        string question,
        uint256 resolutionTime,
        address indexed creator
    );
    
    event DopplerAirlockUpdated(address indexed newAirlock);

    // ============ Constructor ============

    constructor(address _dopplerAirlock, address _defaultCollateral) Ownable(msg.sender) {
        dopplerAirlock = _dopplerAirlock;
        defaultCollateral = _defaultCollateral;
    }

    // ============ Market Creation ============

    /**
     * @notice Create a new prediction market
     * @dev This creates a market wrapper - tokens should be launched separately via Doppler SDK
     * @param yesToken Address of the pre-launched YES token
     * @param noToken Address of the pre-launched NO token
     * @param question The prediction question
     * @param resolutionTime When the market can be resolved
     * @param oracle Address that can resolve the market
     */
    function createMarket(
        address yesToken,
        address noToken,
        string memory question,
        uint256 resolutionTime,
        address oracle
    ) external returns (address market) {
        require(yesToken != address(0), "Invalid YES token");
        require(noToken != address(0), "Invalid NO token");
        require(resolutionTime > block.timestamp, "Resolution time must be in future");
        
        // Deploy the prediction market contract
        market = address(new DopplerPredictionMarket(
            yesToken,
            noToken,
            defaultCollateral,
            question,
            resolutionTime,
            oracle
        ));
        
        // Track the market
        markets.push(market);
        isMarket[market] = true;
        
        marketInfo[market] = MarketInfo({
            market: market,
            yesToken: yesToken,
            noToken: noToken,
            question: question,
            resolutionTime: resolutionTime,
            creator: msg.sender,
            createdAt: block.timestamp
        });
        
        emit MarketCreated(market, yesToken, noToken, question, resolutionTime, msg.sender);
    }

    // ============ View Functions ============

    function getMarketsCount() external view returns (uint256) {
        return markets.length;
    }

    function getMarkets(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 total = markets.length;
        if (offset >= total) return new address[](0);
        
        uint256 end = offset + limit;
        if (end > total) end = total;
        
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = markets[i];
        }
        return result;
    }

    // ============ Admin Functions ============

    function setDopplerAirlock(address _airlock) external onlyOwner {
        dopplerAirlock = _airlock;
        emit DopplerAirlockUpdated(_airlock);
    }

    function setDefaultCollateral(address _collateral) external onlyOwner {
        defaultCollateral = _collateral;
    }
}
