// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../contracts/StakingVaultOFTUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract StakingVaultOFTUpgradeableV2 is StakingVaultOFTUpgradeable {
    using SafeERC20 for IERC20;

    /// @dev Returns the version of the contract
    function version() external pure override returns (uint256) {
        return 2;
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        // Transfer assets from sender to vault
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);

        // Burn the shares instead of minting them
        emit Deposit(msg.sender, receiver, assets, 0);
        return 0;
    }

    function implementation() external view returns (address) {
        return _getImplementation();
    }
    // Add any new features or modifications here
}
