// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "lib/openzeppelin-contracts/lib/forge-std/src/Script.sol";
import "../contracts/LSLMSR_ERC20.sol";

/**
 * @title Deploy Test Market with 2.5 USDC liquidity
 * @notice Deploys a prediction market for SDK testing
 *
 * Usage:
 *   forge script script/DeployTestMarket.s.sol:DeployTestMarketScript \
 *     --rpc-url https://testnet-rpc.monad.xyz \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --legacy \
 *     -vvvv
 */
contract DeployTestMarketScript is Script {
    // Monad Testnet USDC
    address constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    uint8 constant USDC_DECIMALS = 6;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Test market parameters
        string memory question = "Will Claude Opus 4.5 be the best AI model on Feb 15, 2026?";
        uint256 resolutionTime = block.timestamp + 5 days; // 5 days from now
        address oracle = deployer;

        // LS-LMSR parameters (smaller for test)
        uint256 alpha = 0.03e18;        // 3%
        uint256 minLiquidity = 10e18;   // Lower min for testing
        uint256 initialYesShares = 50e18;
        uint256 initialNoShares = 50e18;

        string memory yesName = "Claude Best YES";
        string memory yesSymbol = "YES-CLAUDE";
        string memory noName = "Claude Best NO";
        string memory noSymbol = "NO-CLAUDE";

        console.log("Deploying Test Market...");
        console.log("Deployer:", deployer);
        console.log("Question:", question);
        console.log("Resolution:", resolutionTime);

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
        console.log("Market deployed to:", address(market));
        console.log("YES Token:", address(market.yesToken()));
        console.log("NO Token:", address(market.noToken()));
        console.log("Resolution Time:", resolutionTime);
        console.log("========================================");
        console.log("\nTo initialize with 2.5 USDC:");
        console.log("1. Approve USDC:");
        console.log("   cast send 0x534b2f3A21130d7a60830c2Df862319e593943A3 'approve(address,uint256)'", address(market), "2500000 --rpc-url https://testnet-rpc.monad.xyz --private-key $PRIVATE_KEY --legacy");
        console.log("\n2. Initialize:");
        console.log("   cast send", address(market), "'initialize(uint256)' 2500000 --rpc-url https://testnet-rpc.monad.xyz --private-key $PRIVATE_KEY --legacy");
    }
}
