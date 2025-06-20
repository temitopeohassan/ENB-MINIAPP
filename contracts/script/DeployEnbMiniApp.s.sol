// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/EnbMiniApp.sol";

contract DeployEnbMiniApp is Script {
    function run() external {
        // Load environment variables
        address enbTokenAddress = vm.envAddress("ENB_TOKEN_ADDRESS");
        address authorizedAddress = vm.envAddress("AUTHORIZED_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Validation checks
        require(enbTokenAddress != address(0), "ENB_TOKEN_ADDRESS not set");
        require(authorizedAddress != address(0), "AUTHORIZED_ADDRESS not set");
        require(deployerPrivateKey != 0, "PRIVATE_KEY not set");
        
        // Get deployer address for verification
        address deployer = vm.addr(deployerPrivateKey);
        require(authorizedAddress != deployer, "Authorized address cannot be the deployer");
        
        console.log("=== ENB Mini App Deployment ===");
        console.log("Deployer:", deployer);
        console.log("ENB Token Address:", enbTokenAddress);
        console.log("Authorized Address:", authorizedAddress);
        console.log("Network:", block.chainid);
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the contract
        EnbMiniApp enbMiniApp = new EnbMiniApp(
            enbTokenAddress,
            authorizedAddress
        );
        
        // Stop broadcasting
        vm.stopBroadcast();
        
        // Log deployment information
        console.log("=== Deployment Successful ===");
        console.log("EnbMiniApp Contract Address:", address(enbMiniApp));
        
    }
}