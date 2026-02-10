// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "lib/openzeppelin-contracts/lib/forge-std/src/Script.sol";
import "../contracts/LSLMSR_ERC20.sol";

/**
 * @title Deploy LS-LMSR ERC20 Market
 * @notice Deploy a prediction market that uses USDC as collateral
 *
 * Usage:
 *   forge script script/DeployLSLMSR_ERC20.s.sol:DeployLSLMSR_ERC20Script \
 *     --rpc-url https://testnet-rpc.monad.xyz \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvvv
 *
 * After deployment:
 *   1. Approve USDC for the market contract
 *   2. Call initialize(initialLiquidity) to seed the market
 */
contract DeployLSLMSR_ERC20Script is Script {
    // Monad Testnet USDC
    address constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    uint8 constant USDC_DECIMALS = 6;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Market parameters - customize these
        string memory question = "Will ETH flip BTC market cap by 2027?";
        uint256 resolutionTime = 1798761600; // January 1, 2027 00:00:00 UTC
        address oracle = deployer; // Set to deployer, can be changed later

        // LS-LMSR parameters
        uint256 alpha = 0.03e18;        // 3% - determines how liquidity scales
        uint256 minLiquidity = 100e18;  // Minimum effective b parameter
        uint256 initialYesShares = 100e18;  // Start with 100 YES shares
        uint256 initialNoShares = 100e18;   // Start with 100 NO shares

        // Token names
        string memory yesName = "ETH Flip YES";
        string memory yesSymbol = "YES-ETHFLIP";
        string memory noName = "ETH Flip NO";
        string memory noSymbol = "NO-ETHFLIP";

        console.log("Deploying LSLMSR_ERC20 Market...");
        console.log("Deployer:", deployer);
        console.log("USDC:", USDC);
        console.log("Question:", question);
        console.log("Resolution Time:", resolutionTime);
        console.log("Oracle:", oracle);

        vm.startBroadcast(deployerPrivateKey);

        LSLMSR_ERC20 market = new LSLMSR_ERC20(
            USDC,
            USDC_DECIMALS,
            question,
            resolutionTime,
            oracle,
            alpha,
            minLiquidity,
            initialYesShares,
            initialNoShares,
            yesName,
            yesSymbol,
            noName,
            noSymbol
        );

        vm.stopBroadcast();

        console.log("\n========================================");
        console.log("LSLMSR_ERC20 Market deployed to:", address(market));
        console.log("YES Token:", address(market.yesToken()));
        console.log("NO Token:", address(market.noToken()));
        console.log("========================================");

        console.log("\nNEXT STEPS:");
        console.log("1. Approve USDC for the market:");
        console.log("   cast send 0x534b2f3A21130d7a60830c2Df862319e593943A3 'approve(address,uint256)' <MARKET_ADDRESS> 10000000 --rpc-url https://testnet-rpc.monad.xyz --private-key $PRIVATE_KEY");
        console.log("\n2. Initialize the market with liquidity (10 USDC = 10000000 units):");
        console.log("   cast send <MARKET_ADDRESS> 'initialize(uint256)' 10000000 --rpc-url https://testnet-rpc.monad.xyz --private-key $PRIVATE_KEY");
        console.log("\nReplace <MARKET_ADDRESS> with:");
        console.log(address(market));
    }
}
