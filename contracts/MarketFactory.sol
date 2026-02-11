// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./LSLMSR_ERC20.sol";

/**
 * @title MarketFactory
 * @notice Factory contract for deploying LS-LMSR prediction markets
 * @dev Users call createMarket() which deploys a new LSLMSR_ERC20 contract
 */
contract MarketFactory {
    // Events
    event MarketCreated(
        address indexed market,
        address indexed creator,
        string question,
        uint256 resolutionTime,
        address oracle
    );

    // Deployed markets
    address[] public markets;
    mapping(address => bool) public isMarket;
    mapping(address => address[]) public creatorMarkets;

    // Default parameters (can be overridden)
    uint256 public defaultAlpha = 0.03e18;        // 3%
    uint256 public defaultMinLiquidity = 10e18;   // Minimum liquidity parameter
    uint256 public defaultInitialShares = 50e18; // Initial YES/NO shares

    // USDC address on Monad Testnet
    address public immutable USDC;
    uint8 public constant USDC_DECIMALS = 6;

    constructor(address _usdc) {
        USDC = _usdc;
    }

    /**
     * @notice Create a new prediction market
     * @param question The market question
     * @param resolutionTime Unix timestamp when market can be resolved
     * @param oracle Address authorized to resolve the market (usually msg.sender)
     * @param yesSymbol Symbol for YES token (e.g., "YES-BTC100K")
     * @param noSymbol Symbol for NO token (e.g., "NO-BTC100K")
     * @return market The deployed market address
     */
    function createMarket(
        string calldata question,
        uint256 resolutionTime,
        address oracle,
        string calldata yesSymbol,
        string calldata noSymbol
    ) external returns (address market) {
        require(resolutionTime > block.timestamp, "Resolution time must be in future");
        require(bytes(question).length > 0, "Question cannot be empty");
        require(oracle != address(0), "Oracle cannot be zero address");

        // Generate token names from symbols
        string memory yesName = string(abi.encodePacked("Yes - ", question));
        string memory noName = string(abi.encodePacked("No - ", question));

        // Truncate names if too long
        if (bytes(yesName).length > 50) {
            yesName = string(abi.encodePacked(yesSymbol, " Token"));
        }
        if (bytes(noName).length > 50) {
            noName = string(abi.encodePacked(noSymbol, " Token"));
        }

        // Deploy new market (factory is initial owner)
        LSLMSR_ERC20 newMarket = new LSLMSR_ERC20(
            USDC,
            USDC_DECIMALS,
            question,
            resolutionTime,
            oracle,
            defaultAlpha,
            defaultMinLiquidity,
            defaultInitialShares,
            defaultInitialShares,
            yesName,
            yesSymbol,
            noName,
            noSymbol
        );

        // Transfer creator role and ownership to the actual caller
        newMarket.transferCreator(msg.sender);
        newMarket.transferOwnership(msg.sender);

        market = address(newMarket);

        // Track the market
        markets.push(market);
        isMarket[market] = true;
        creatorMarkets[msg.sender].push(market);

        emit MarketCreated(market, msg.sender, question, resolutionTime, oracle);
    }

    /**
     * @notice Create market with custom parameters
     */
    function createMarketAdvanced(
        string calldata question,
        uint256 resolutionTime,
        address oracle,
        string calldata yesSymbol,
        string calldata noSymbol,
        uint256 alpha,
        uint256 minLiquidity,
        uint256 initialShares
    ) external returns (address market) {
        require(resolutionTime > block.timestamp, "Resolution time must be in future");
        require(bytes(question).length > 0, "Question cannot be empty");
        require(oracle != address(0), "Oracle cannot be zero address");
        require(alpha > 0 && alpha <= 1e18, "Invalid alpha");
        require(minLiquidity > 0, "Invalid minLiquidity");
        require(initialShares > 0, "Invalid initialShares");

        string memory yesName = string(abi.encodePacked(yesSymbol, " Token"));
        string memory noName = string(abi.encodePacked(noSymbol, " Token"));

        LSLMSR_ERC20 newMarket = new LSLMSR_ERC20(
            USDC,
            USDC_DECIMALS,
            question,
            resolutionTime,
            oracle,
            alpha,
            minLiquidity,
            initialShares,
            initialShares,
            yesName,
            yesSymbol,
            noName,
            noSymbol
        );

        // Transfer creator role and ownership to the actual caller
        newMarket.transferCreator(msg.sender);
        newMarket.transferOwnership(msg.sender);

        market = address(newMarket);
        markets.push(market);
        isMarket[market] = true;
        creatorMarkets[msg.sender].push(market);

        emit MarketCreated(market, msg.sender, question, resolutionTime, oracle);
    }

    // View functions
    function getMarketsCount() external view returns (uint256) {
        return markets.length;
    }

    function getMarkets(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 total = markets.length;
        if (offset >= total) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = markets[i];
        }
        return result;
    }

    function getCreatorMarkets(address creator) external view returns (address[] memory) {
        return creatorMarkets[creator];
    }
}
