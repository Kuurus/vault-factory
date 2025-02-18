// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "./StakingVaultOFTUpgradeable.sol";

error ZeroAddress();

contract BaseVaultOFTFactory is Ownable {
    UpgradeableBeacon public immutable beacon;
    address public immutable lzEndpoint;
    address[] public allVaults;

    event VaultCreated(address indexed vault, address indexed asset, string name, string symbol);
    event BeaconUpgraded(address indexed implementation);

    constructor(address _implementation, address _lzEndpoint) Ownable(msg.sender) {
        if (_implementation == address(0)) revert ZeroAddress();
        if (_lzEndpoint == address(0)) revert ZeroAddress();

        // Initialize beacon with implementation and factory as owner
        beacon = new UpgradeableBeacon(_implementation, address(this));
        lzEndpoint = _lzEndpoint;
    }

    function createVault(
        address asset,
        string memory name,
        string memory symbol,
        address vaultOwner
    ) external onlyOwner returns (address) {
        if (asset == address(0)) revert ZeroAddress();
        if (vaultOwner == address(0)) revert ZeroAddress();

        bytes memory initData = abi.encodeWithSelector(
            StakingVaultOFTUpgradeable.initialize.selector,
            asset,
            name,
            symbol,
            vaultOwner
        );

        BeaconProxy proxy = new BeaconProxy(address(beacon), initData);
        address vaultAddress = address(proxy);
        allVaults.push(vaultAddress);

        emit VaultCreated(vaultAddress, asset, name, symbol);
        return vaultAddress;
    }

    // Upgrade all vaults at once by updating the beacon
    function upgradeTo(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        beacon.upgradeTo(newImplementation);
        emit BeaconUpgraded(newImplementation);
    }

    function getVaults() external view returns (address[] memory) {
        return allVaults;
    }

    function implementation() external view returns (address) {
        return beacon.implementation();
    }
}
