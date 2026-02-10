// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "lib/openzeppelin-contracts/lib/forge-std/src/Script.sol";
import "../contracts/MarketFactory.sol";

/**
 * @title Deploy MarketFactory
 * @notice Deploys the MarketFactory contract for creating prediction markets
 *
 * Usage:
 *   forge script script/DeployMarketFactory.s.sol:DeployMarketFactoryScript \
 *     --rpc-url https://testnet-rpc.monad.xyz \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --legacy \
 *     -vvvv
 */
contract DeployMarketFactoryScript is Script {
    // Monad Testnet USDC
    address constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying MarketFactory...");
        console.log("Deployer:", deployer);
        console.log("USDC:", USDC);

        vm.startBroadcast(deployerPrivateKey);

        MarketFactory factory = new MarketFactory(USDC);

        vm.stopBroadcast();

        console.log("\n========================================");
        console.log("MarketFactory deployed to:", address(factory));
        console.log("========================================");
        console.log("\nUpdate these files with the factory address:");
        console.log("1. supabase/functions/x402-deploy-market/index.ts");
        console.log("2. packages/rbs-pm-sdk/src/constants.ts");
    }
}
