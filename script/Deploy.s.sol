// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "lib/openzeppelin-contracts/lib/forge-std/src/Script.sol";
import "../contracts/PredictionMarketFactory.sol";

contract DeployScript is Script {
    // Monad Testnet Addresses
    address constant DOPPLER_AIRLOCK = 0xDe3599a2eC440B296373a983C85C365DA55d9dFA;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        PredictionMarketFactory factory = new PredictionMarketFactory(
            DOPPLER_AIRLOCK
        );

        vm.stopBroadcast();

        console.log("PredictionMarketFactory deployed to:", address(factory));
        console.log("Doppler Airlock:", DOPPLER_AIRLOCK);
        console.log("Collateral: Native MON");
    }
}
