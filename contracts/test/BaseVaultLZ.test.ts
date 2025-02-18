import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import type {
  MockERC20,
  StakingVaultOFTUpgradeable,
  WithdrawalHandler,
  EndpointV2Mock,
  BaseVaultOFTFactory,
} from '../typechain-types';

// Add SendParam type
type SendParamStruct = {
  dstEid: number;
  to: string;
  amountLD: bigint;
  minAmountLD: bigint;
  extraOptions: string;
  composeMsg: string;
  oftCmd: string;
};

describe('VALEETFVault', function () {
  let underlyingToken: MockERC20;
  let ETFVault: StakingVaultOFTUpgradeable;
  let ETFVaultDst: StakingVaultOFTUpgradeable;
  let mockCollateral: MockERC20;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let rebaseManager: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let externalUser: HardhatEthersSigner;
  let blacklistManager: HardhatEthersSigner;
  let endpointV2MockSrc: EndpointV2Mock;
  let endpointV2MockDst: EndpointV2Mock;
  let withdrawalHandler: WithdrawalHandler;
  let factory: BaseVaultOFTFactory;

  const CHAIN_ID_SRC = 1;
  const CHAIN_ID_DST = 2;
  const initialMint = ethers.parseUnits('1000000', 18);
  const stakeAmount = ethers.parseUnits('10000', 18);
  const rebaseAmount = ethers.parseUnits('1000', 18);

  beforeEach(async function () {
    [
      owner,
      user1,
      user2,
      rebaseManager,
      minter,
      externalUser,
      blacklistManager,
    ] = await ethers.getSigners();

    // Deploy mock LayerZero endpoints for both chains
    const EndpointV2Mock = await ethers.getContractFactory('EndpointV2Mock');
    endpointV2MockSrc = await EndpointV2Mock.deploy(CHAIN_ID_SRC);
    endpointV2MockDst = await EndpointV2Mock.deploy(CHAIN_ID_DST);

    // Deploy MockERC20 instead of VALE
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    underlyingToken = await MockERC20Factory.deploy('Mock VALE', 'VALE');

    // Deploy implementation
    const ETFVaultFactory = await ethers.getContractFactory('StakingVaultOFTUpgradeable');
    const implementation = await ETFVaultFactory.deploy(await endpointV2MockSrc.getAddress());
    await implementation.waitForDeployment();

    // Deploy factory
    const StakingVaultFactoryFactory = await ethers.getContractFactory('BaseVaultOFTFactory');
    factory = await StakingVaultFactoryFactory.deploy(
      await implementation.getAddress(),
      await endpointV2MockSrc.getAddress()
    );
    await factory.waitForDeployment();

    // Create vault through factory
    const tx = await factory.createVault(
      await underlyingToken.getAddress(),
      'Staked ETF VALE',
      'sVALE',
      await owner.getAddress()
    );
    const receipt = await tx.wait();
    const event = receipt?.logs.find(
      log => log.topics[0] === factory.interface.getEvent('VaultCreated').topicHash
    );
    const vaultAddress = event?.args?.vault;

    ETFVault = ETFVaultFactory.attach(vaultAddress) as StakingVaultOFTUpgradeable;

    // Deploy destination chain vault similarly
    const implementationDst = await ETFVaultFactory.deploy(await endpointV2MockDst.getAddress());
    const factoryDst = await StakingVaultFactoryFactory.deploy(
      await implementationDst.getAddress(),
      await endpointV2MockDst.getAddress()
    );

    const txDst = await factoryDst.createVault(
      await underlyingToken.getAddress(),
      'Staked ETF VALE',
      'sVALE',
      await owner.getAddress()
    );
    const receiptDst = await txDst.wait();
    const eventDst = receiptDst?.logs.find(
      log => log.topics[0] === factoryDst.interface.getEvent('VaultCreated').topicHash
    );
    const vaultAddressDst = eventDst?.args?.vault;

    ETFVaultDst = ETFVaultFactory.attach(vaultAddressDst) as StakingVaultOFTUpgradeable;

    await endpointV2MockSrc.setDestLzEndpoint(
      await ETFVaultDst.getAddress(),
      await endpointV2MockDst.getAddress()
    );
    await endpointV2MockDst.setDestLzEndpoint(
      await ETFVault.getAddress(),
      await endpointV2MockSrc.getAddress()
    );

    // Set up peers between vaults
    await ETFVault.setPeer(
      CHAIN_ID_DST,
      ethers.zeroPadValue(await ETFVaultDst.getAddress(), 32)
    );
    await ETFVaultDst.setPeer(
      CHAIN_ID_SRC,
      ethers.zeroPadValue(await ETFVault.getAddress(), 32)
    );

    mockCollateral = await MockERC20Factory.deploy('Mock Collateral', 'MCOL');

  
    // Set up roles for both vaults
    for (const vault of [ETFVault, ETFVaultDst]) {
      await vault.setRebaseManager(await rebaseManager.getAddress());
      await vault.grantRole(
        await vault.BLACKLIST_MANAGER_ROLE(),
        await blacklistManager.getAddress()
      );
    }

    // Mint initial tokens for users - simplified without permit
    for (const user of [user1, user2, rebaseManager]) {
      await underlyingToken.mint(await user.getAddress(), initialMint);
      await underlyingToken.connect(user).approve(await ETFVault.getAddress(), initialMint);
    }

    const WithdrawalHandlerFactory =
      await ethers.getContractFactory('WithdrawalHandler');
    withdrawalHandler = await WithdrawalHandlerFactory.deploy(
      await underlyingToken.getAddress(),
      24 * 60 * 60 // 1 day
    );
    await withdrawalHandler.waitForDeployment();

    // Grant ETF_VAULT_ROLE to ETFVault
    const ETF_VAULT_ROLE = await withdrawalHandler.ETF_VAULT_ROLE();
    await withdrawalHandler.grantRole(
      ETF_VAULT_ROLE,
      await ETFVault.getAddress()
    );

    // Set WithdrawalHandler in ETFVault
    await ETFVault.setWithdrawalHandler(
      await withdrawalHandler.getAddress()
    );
  });

  // Add helper function to get Options
  async function getOptions(executorLzReceiveOptionMaxGas: number) {
    const { Options } = await import('@layerzerolabs/lz-v2-utilities');
    return Options.newOptions()
      .addExecutorLzReceiveOption(BigInt(executorLzReceiveOptionMaxGas), 0)
      .toHex();
  }

  it('should allow ETF VALE and minting shares', async function () {
    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    const shares = await ETFVault.balanceOf(await user1.getAddress());
    expect(shares).to.equal(stakeAmount);

    const assets = await ETFVault.totalAssets();
    expect(assets).to.equal(stakeAmount);

    // Test ERC20 sVALE properties
    expect(await ETFVault.name()).to.equal('Staked ETF VALE');
    expect(await ETFVault.symbol()).to.equal('sVALE');
    expect(await ETFVault.decimals()).to.equal(18);
  });

  it('should mint correct amount of sVALE when depositing VALE', async function () {
    const initialBalance = await ETFVault.balanceOf(
      await user1.getAddress()
    );
    expect(initialBalance).to.equal(0);

    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    const newBalance = await ETFVault.balanceOf(await user1.getAddress());
    expect(newBalance).to.equal(stakeAmount);

    // Test that the total supply of sVALE has increased
    expect(await ETFVault.totalSupply()).to.equal(stakeAmount);
  });

  it('should allow transfer of sVALE tokens', async function () {
    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    const transferAmount = ethers.parseUnits('5000', 18);
    await ETFVault.connect(user1).transfer(
      await user2.getAddress(),
      transferAmount
    );

    expect(await ETFVault.balanceOf(await user1.getAddress())).to.equal(
      stakeAmount - transferAmount
    );
    expect(await ETFVault.balanceOf(await user2.getAddress())).to.equal(
      transferAmount
    );
  });

  it('should reflect rebase in withdrawals', async function () {
    // Stake VALE
    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    // Get initial assets
    const assets = await ETFVault.convertToAssets(stakeAmount);

    // Perform rebase
    await ETFVault.connect(rebaseManager).rebase(rebaseAmount);

    // Check if new convertToAssets is greater than before
    const newAssets = await ETFVault.convertToAssets(stakeAmount);
    expect(newAssets).to.be.greaterThan(assets);

    // Get balances before withdrawal
    const balanceVALEBefore = await underlyingToken.balanceOf(user1.address);
    const balanceSVALEBefore = await ETFVault.balanceOf(user1.address);
    // Preview withdrawal amount before creating demand
    const previewAssets = await ETFVault.previewRedeem(assets);
    const userAssets = await ETFVault.previewRedeem(balanceSVALEBefore);

    expect(previewAssets).to.be.lte(userAssets);

    // Create withdrawal demand with slippage check
    await ETFVault.connect(user1).withdrawWithSlippageCheck(
      userAssets,
      withdrawalHandler.target,
      user1.address,
      stakeAmount + (stakeAmount * 2n) / 100n // 2% slippage
    );

    // Get withdrawal request ID
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;

    // Fast forward time
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    // Claim withdrawal
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    // Get balances after withdrawal
    const balanceVALEAfter = await underlyingToken.balanceOf(user1.address);
    const balanceSVALEAfter = await ETFVault.balanceOf(user1.address);

    // Check balances
    expect(balanceSVALEBefore).to.be.greaterThan(balanceSVALEAfter);
    expect(balanceSVALEAfter).to.equal(0);
    expect(balanceVALEAfter).to.equal(balanceVALEBefore + newAssets);
  });

  it('should not reflect rebase in withdrawals if made after withdrawal demand', async function () {
    // Stake VALE
    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    // Get initial assets
    const assets = await ETFVault.convertToAssets(stakeAmount);

    // Get balances before withdrawal
    const balanceVALEBefore = await underlyingToken.balanceOf(user1.address);
    const balanceSVALEBefore = await ETFVault.balanceOf(user1.address);

    // Create withdrawal demand with slippage check
    await ETFVault.connect(user1).withdrawWithSlippageCheck(
      stakeAmount,
      withdrawalHandler.target,
      user1.address,
      stakeAmount + (stakeAmount * 2n) / 100n // 2% slippage
    );

    // Get withdrawal request ID
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;

    // Check sVALE balance is correct before rebase
    expect(await ETFVault.balanceOf(user1.address)).to.equal(0);

    // Perform rebase
    await ETFVault.connect(rebaseManager).rebase(rebaseAmount);

    // Fast forward time
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    // Claim withdrawal
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    // Get balances after withdrawal
    const balanceVALEAfter = await underlyingToken.balanceOf(user1.address);
    const balanceSVALEAfter = await ETFVault.balanceOf(user1.address);

    // Check balances
    expect(balanceSVALEBefore).to.be.greaterThan(balanceSVALEAfter);
    expect(balanceSVALEAfter).to.equal(0);
    expect(balanceVALEAfter).to.equal(balanceVALEBefore + assets);
    // Check VALE balance on ETF vault
    const vaultVALEBalance = await underlyingToken.balanceOf(
      await ETFVault.getAddress()
    );
    expect(vaultVALEBalance).to.equal(rebaseAmount);
  });

  it('should enforce withdraw period', async function () {
    // Stake VALE
    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    // Create withdrawal demand with slippage check
    await ETFVault.connect(user1).withdrawWithSlippageCheck(
      stakeAmount,
      withdrawalHandler.target,
      user1.address,
      stakeAmount + (stakeAmount * 2n) / 100n // 2% slippage
    );

    // Get withdrawal request ID
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;

    // Try to claim immediately (should fail)
    await expect(
      withdrawalHandler.connect(user1).claimWithdrawal(requestId)
    ).to.be.revertedWithCustomError(
      withdrawalHandler,
      'WithdrawPeriodNotElapsed'
    );

    // Fast forward time
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    // Claim should now succeed
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    expect(await underlyingToken.balanceOf(user1.address)).to.equal(initialMint);
  });

  it('should not allow external user to claim withdrawal', async function () {
    // Stake VALE
    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    // Create withdrawal demand with slippage check
    await ETFVault.connect(user1).withdrawWithSlippageCheck(
      stakeAmount,
      withdrawalHandler.target,
      user1.address,
      stakeAmount + (stakeAmount * 2n) / 100n // 2% slippage
    );

    // Get withdrawal request ID
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;

    // Fast forward time
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    // External user tries to claim (should fail)
    await expect(
      withdrawalHandler.connect(externalUser).claimWithdrawal(requestId)
    ).to.be.revertedWithCustomError(withdrawalHandler, 'Unauthorized');
  });

  it('should not allow blacklisted user to withdraw', async function () {
    // Stake VALE
    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    // Blacklist user1
    await ETFVault.connect(blacklistManager).blacklistAccount(
      user1.address
    );

    // Withdraw should fail for blacklisted user
    await expect(
      ETFVault.connect(user1).withdrawWithSlippageCheck(
        stakeAmount,
        withdrawalHandler.target,
        user1.address,
        stakeAmount + (stakeAmount * 2n) / 100n // 2% slippage
      )
    ).to.be.revertedWithCustomError(ETFVault, 'BlacklistedAddress');
  });

  it('should not allow transfer to blacklisted address', async function () {
    // Stake VALE with user1
    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    // Blacklist user2
    await ETFVault.connect(blacklistManager).blacklistAccount(
      await user2.getAddress()
    );

    // Try to transfer from user1 to blacklisted user2 (should fail)
    await expect(
      ETFVault.connect(user1).transfer(
        await user2.getAddress(),
        stakeAmount
      )
    ).to.be.revertedWithCustomError(ETFVault, 'BlacklistedAddress');
  });

  it('should allow transfer after unblacklisting', async function () {
    // Stake VALE with user1
    await ETFVault.connect(user1).deposit(
      stakeAmount,
      await user1.getAddress()
    );

    // Blacklist user2
    await ETFVault.connect(blacklistManager).blacklistAccount(
      await user2.getAddress()
    );
    // Transfer should revert
    await expect(
      ETFVault.connect(user1).transfer(
        await user2.getAddress(),
        stakeAmount
      )
    ).to.be.revertedWithCustomError(ETFVault, 'BlacklistedAddress');

    // Unblacklist user2
    await ETFVault.connect(blacklistManager).unblacklistAccount(
      await user2.getAddress()
    );

    // Transfer should now succeed
    await expect(
      ETFVault.connect(user1).transfer(
        await user2.getAddress(),
        stakeAmount
      )
    ).to.not.be.reverted;

    // Check balances
    expect(await ETFVault.balanceOf(await user2.getAddress())).to.equal(
      stakeAmount
    );
    expect(await ETFVault.balanceOf(await user1.getAddress())).to.equal(0);
  });

  it('should allow admin to rescue tokens', async function () {
    const TestTokenFactory = await ethers.getContractFactory('MockERC20'); // Using VALE as a test token
    const testToken = await TestTokenFactory.deploy('TestToken', 'TEST');

    const rescueAmount = ethers.parseUnits('1000', 18);

    // Transfer some test tokens to the ETFVault
    await testToken.mint(await ETFVault.getAddress(), rescueAmount);

    const initialBalance = await testToken.balanceOf(await owner.getAddress());

    // Rescue tokens
    await expect(
      ETFVault.connect(owner).rescueToken(
        await testToken.getAddress(),
        await owner.getAddress(),
        rescueAmount
      )
    ).to.not.be.reverted;

    // Check balances
    expect(await testToken.balanceOf(await owner.getAddress())).to.equal(
      initialBalance + rescueAmount
    );
    expect(await testToken.balanceOf(await ETFVault.getAddress())).to.equal(
      0
    );
  });

  it('should not allow rescuing vault token or underlying asset', async function () {
    // Attempt to rescue vault token (should fail)
    await expect(
      ETFVault.connect(owner).rescueToken(
        await ETFVault.getAddress(),
        await owner.getAddress(),
        stakeAmount
      )
    ).to.be.revertedWithCustomError(ETFVault, 'CannotRescueVaultToken');

    // Attempt to rescue underlying asset (should fail)
    await expect(
      ETFVault.connect(owner).rescueToken(
        await underlyingToken.getAddress(),
        await owner.getAddress(),
        stakeAmount
      )
    ).to.be.revertedWithCustomError(
      ETFVault,
      'CannotRescueUnderlyingAsset'
    );
  });
  it('should allow depositWithPermit', async function () {
    const amount = ethers.parseUnits('1000', 18);
    const deadline = Math.floor(Date.now() / 1000) + 3600 * 100; // 100 hour from now
    const nonce = 2;

    const domain = {
      name: await underlyingToken.name(),
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await underlyingToken.getAddress(),
    };

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const values = {
      owner: user1.address,
      spender: await ETFVault.getAddress(),
      value: amount,
      nonce: nonce,
      deadline: deadline,
    };

    const signature = await user1.signTypedData(domain, types, values);
    const { v, r, s } = ethers.Signature.from(signature);

    const initialBalance = await ETFVault.balanceOf(user1.address);
    await expect(
      ETFVault.connect(user1).depositWithPermit(
        amount,
        user1.address,
        deadline,
        v,
        r,
        s
      )
    )
      .to.emit(ETFVault, 'Deposit')
      .withArgs(user1.address, user1.address, amount, amount);

    const finalBalance = await ETFVault.balanceOf(user1.address);
    expect(finalBalance).to.equal(initialBalance + amount);
  });

  it('should allow rebaseWithPermit', async function () {
    const amount = ethers.parseUnits('1000', 18);
    const deadline = Math.floor(Date.now() / 1000) + 3600 * 100; // 100 hour from now
    const nonce = 1;

    const domain = {
      name: await underlyingToken.name(),
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await underlyingToken.getAddress(),
    };

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const values = {
      owner: rebaseManager.address,
      spender: await ETFVault.getAddress(),
      value: amount,
      nonce: nonce,
      deadline: deadline,
    };

    const signature = await rebaseManager.signTypedData(domain, types, values);
    const { v, r, s } = ethers.Signature.from(signature);

    const initialTotalSupply = await ETFVault.totalSupply();
    await expect(
      ETFVault.connect(rebaseManager).rebaseWithPermit(
        amount,
        deadline,
        v,
        r,
        s
      )
    )
      .to.emit(ETFVault, 'Rebase')
      .withArgs(initialTotalSupply + amount);

    // Shouldn't change the total supply
    const finalTotalSupply = await ETFVault.totalSupply();
    expect(finalTotalSupply).to.equal(initialTotalSupply);
  });
  it('should allow depositWithSlippageCheck', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    const minSharesOut = ethers.parseUnits('990', 18); // Allowing for 1% slippage

    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );

    const initialBalance = await ETFVault.balanceOf(user1.address);

    await expect(
      ETFVault.connect(user1).depositWithSlippageCheck(
        depositAmount,
        user1.address,
        minSharesOut
      )
    )
      .to.emit(ETFVault, 'Deposit')
      .withArgs(
        user1.address,
        user1.address,
        depositAmount,
        await ETFVault.previewDeposit(depositAmount)
      );

    const finalBalance = await ETFVault.balanceOf(user1.address);
    expect(finalBalance).to.be.gte(initialBalance + minSharesOut);
  });

  it('should revert depositWithSlippageCheck if slippage is exceeded', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    const minSharesOut = ethers.parseUnits('1001', 18); // Unrealistic expectation

    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );

    await expect(
      ETFVault.connect(user1).depositWithSlippageCheck(
        depositAmount,
        user1.address,
        minSharesOut
      )
    ).to.be.revertedWithCustomError(ETFVault, 'SlippageExceeded');
  });
  it('should allow withdrawWithSlippageCheck', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    const withdrawAmount = ethers.parseUnits('500', 18);

    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Set withdraw period to 1 for testing
    await withdrawalHandler.setWithdrawPeriod(1);

    // Create withdrawal demand with slippage check
    await ETFVault.connect(user1).withdrawWithSlippageCheck(
      withdrawAmount,
      withdrawalHandler.target,
      user1.address,
      withdrawAmount + (withdrawAmount * 2n) / 100n //2% slippage
    );

    // Get withdrawal request ID
    const initialBalance = await underlyingToken.balanceOf(user1.address);
    await expect(
      ETFVault.connect(user1).withdrawWithSlippageCheck(
        withdrawAmount,
        user1.address,
        user1.address,
        withdrawAmount + (withdrawAmount * 2n) / 100n //2% slippage
      )
    ).to.be.revertedWithCustomError(ETFVault, 'Unauthorized');
    await ETFVault.connect(user1).withdraw(
      withdrawAmount,
      withdrawalHandler.target,
      user1.address
    );

    // Fast forward time to allow withdrawal
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    // Get request ID and claim from withdrawal handler
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);
    const finalBalance = await underlyingToken.balanceOf(user1.address);
    expect(finalBalance).to.equal(initialBalance + withdrawAmount);
  });

  it('should revert withdrawWithSlippageCheck if slippage is exceeded', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    const withdrawAmount = ethers.parseUnits('500', 18);
    const maxSharesBurned = ethers.parseUnits('490', 18); // Unrealistic expectation

    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Set withdraw period to 1 for testing
    await withdrawalHandler.setWithdrawPeriod(1);

    // Create withdrawal demand
    await ETFVault.connect(user1).withdraw(
      withdrawAmount,
      withdrawalHandler.target,
      user1.address
    );

    await expect(
      ETFVault.connect(user1).withdrawWithSlippageCheck(
        withdrawAmount,
        user1.address,
        user1.address,
        maxSharesBurned
      )
    ).to.be.revertedWithCustomError(ETFVault, 'SlippageExceeded');
  });

  it('should allow claim', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    const redeemShares = ethers.parseUnits('500', 18);
    const minAssetsOut = ethers.parseUnits('490', 18); // Allowing for 2% slippage

    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Set withdraw period to 1 for testing
    await withdrawalHandler.setWithdrawPeriod(1);

    await ETFVault.connect(user1).withdraw(
      redeemShares,
      withdrawalHandler.target,
      user1.address
    );

    const initialBalance = await underlyingToken.balanceOf(user1.address);

    // Get the latest request ID
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;

    // Fast forward time to allow withdrawal
    await ethers.provider.send('evm_increaseTime', [2]); // Move past withdraw period
    await ethers.provider.send('evm_mine', []);

    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    const finalBalance = await underlyingToken.balanceOf(user1.address);
    expect(finalBalance).to.be.gte(initialBalance + minAssetsOut);
  });

  it('should revert redeemWithSlippageCheck if slippage is exceeded', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    const redeemShares = ethers.parseUnits('500', 18);
    const minAssetsOut = ethers.parseUnits('510', 18); // Unrealistic expectation

    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Set withdraw period to 1 for testing
    await withdrawalHandler.setWithdrawPeriod(1);
    // Create withdrawal demand
    await ETFVault.connect(user1).withdraw(
      redeemShares,
      withdrawalHandler.target,
      user1.address
    );

    await expect(
      ETFVault.connect(user1).redeemWithSlippageCheck(
        redeemShares,
        user1.address,
        user1.address,
        minAssetsOut
      )
    ).to.be.revertedWithCustomError(ETFVault, 'SlippageExceeded');
  });
  it('should successfully redeemWithSlippageCheck when slippage is within limits', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    const redeemShares = ethers.parseUnits('500', 18);
    const minAssetsOut = ethers.parseUnits('490', 18); // Slightly lower than expected to account for potential slippage

    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Set withdraw period to 1 for testing
    await withdrawalHandler.setWithdrawPeriod(1);

    // Create withdrawal demand
    await ETFVault.connect(user1).withdraw(
      redeemShares,
      withdrawalHandler.target,
      user1.address
    );

    const initialBalance = await underlyingToken.balanceOf(user1.address);

    // Get the latest request ID and claim withdrawal
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    const finalBalance = await underlyingToken.balanceOf(user1.address);
    expect(finalBalance).to.be.gte(initialBalance + minAssetsOut);
  });

  it('should revert redeemWithSlippageCheck if withdrawal period has not passed', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    const redeemShares = ethers.parseUnits('500', 18);
    const minAssetsOut = ethers.parseUnits('490', 18);

    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    await withdrawalHandler.setWithdrawPeriod(10);
    // Create withdrawal demand
    await ETFVault.connect(user1).withdraw(
      redeemShares,
      withdrawalHandler.target,
      user1.address
    );
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;
    await expect(
      withdrawalHandler.connect(user1).claimWithdrawal(requestId)
    ).to.be.revertedWithCustomError(
      withdrawalHandler,
      'WithdrawPeriodNotElapsed'
    );
  });

  it('should revert redeemWithSlippageCheck if user has no withdrawal demand', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    const redeemShares = ethers.parseUnits('500', 18);
    const minAssetsOut = ethers.parseUnits('490', 18);

    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Set withdraw period to 1 for testing
    await withdrawalHandler.setWithdrawPeriod(1);

    // Do not create a withdrawal demand

    await expect(
      withdrawalHandler.connect(user1).claimWithdrawal(0)
    ).to.be.revertedWithCustomError(withdrawalHandler, 'Unauthorized');
  });
  it('should allow mintWithSlippageCheck', async function () {
    const mintShares = ethers.parseUnits('1000', 18);
    const maxAssets = ethers.parseUnits('1010', 18); // Allowing for 1% slippage

    
    await underlyingToken.mint(user1.address, maxAssets);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      maxAssets
    );

    const initialBalance = await ETFVault.balanceOf(user1.address);

    await expect(
      ETFVault.connect(user1).mintWithSlippageCheck(
        mintShares,
        user1.address,
        maxAssets
      )
    )
      .to.emit(ETFVault, 'Deposit')
      .withArgs(
        user1.address,
        user1.address,
        await ETFVault.previewMint(mintShares),
        mintShares
      );

    const finalBalance = await ETFVault.balanceOf(user1.address);
    expect(finalBalance).to.equal(initialBalance + mintShares);
  });

  it('should revert mintWithSlippageCheck if slippage is exceeded', async function () {
    const mintShares = ethers.parseUnits('1000', 18);
    const maxAssets = ethers.parseUnits('990', 18); // Unrealistic expectation (too low)

    
    await underlyingToken.mint(user1.address, ethers.parseUnits('1100', 18)); // Mint more than maxAssets
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      ethers.parseUnits('1100', 18)
    );

    await expect(
      ETFVault.connect(user1).mintWithSlippageCheck(
        mintShares,
        user1.address,
        maxAssets
      )
    ).to.be.revertedWithCustomError(ETFVault, 'SlippageExceeded');
  });
  it('should correctly track balances and shares across chains', async function () {
    // User1 stakes on source chain
    const user1StakeAmount = ethers.parseUnits('5000', 18);
    const transferAmount = ethers.parseUnits('2000', 18);
    
    await underlyingToken.mint(user1.address, user1StakeAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      user1StakeAmount
    );
    await ETFVault.connect(user1).deposit(
      user1StakeAmount,
      await user1.getAddress()
    );

    // Verify initial balances on source chain
    expect(await ETFVault.balanceOf(await user1.getAddress())).to.equal(
      user1StakeAmount
    );
    expect(await ETFVault.totalSupply()).to.equal(user1StakeAmount);

    // Send shares cross-chain
    const executorLzReceiveOptionMaxGas = 65000;
    const options = await getOptions(executorLzReceiveOptionMaxGas);

    const sendParams: SendParamStruct = {
      dstEid: CHAIN_ID_DST,
      to: ethers.zeroPadValue(await user1.getAddress(), 32),
      amountLD: transferAmount,
      minAmountLD: transferAmount,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x',
    };

    const [nativeFee] = await ETFVault.quoteSend(sendParams, false);
    
    // Approve ETFVault to spend tokens
    await ETFVault.connect(user1).approve(
      await ETFVault.getAddress(),
      transferAmount
    );

    // Send tokens cross-chain
    await ETFVault.connect(user1).send(
      sendParams,
      [nativeFee, 0],
      await user1.getAddress(),
      { value: nativeFee }
    );

    // Verify balances after cross-chain transfer
    expect(await ETFVault.balanceOf(await user1.getAddress())).to.equal(
      user1StakeAmount - transferAmount
    );
    
   
    expect(await ETFVaultDst.balanceOf(await user1.getAddress())).to.equal(
      transferAmount
    );
  });

  it('should maintain correct share ratios when source chain rebases', async function () {
    // Initial stakes
    const user1StakeAmount = ethers.parseUnits('5000', 18);

    
    await underlyingToken.mint(user1.address, user1StakeAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      user1StakeAmount
    );
    await ETFVault.connect(user1).deposit(
      user1StakeAmount,
      await user1.getAddress()
    );

    

    // Record user2's initial shares
    const user2SharesBefore = await ETFVault.convertToShares(
      await ETFVault.balanceOf(user2.address)
    );

    // Send shares cross-chain before rebase
    const transferAmount = ethers.parseUnits('2500', 18);
    const executorLzReceiveOptionMaxGas = 65000;
    const options = await getOptions(executorLzReceiveOptionMaxGas);
    const sendParams = [
      CHAIN_ID_DST,
      ethers.zeroPadValue(await user1.getAddress(), 32),
      transferAmount,
      transferAmount,
      options,
      '0x',
      '0x',
    ];

    const [nativeFee] = await ETFVault.quoteSend(sendParams, false);
    await ETFVault.connect(user1).approve(
      await ETFVault.getAddress(),
      transferAmount
    );

    await ETFVault.connect(user1).send(
      sendParams,
      [nativeFee, 0],
      await user1.getAddress(),
      { value: nativeFee }
    );

    // Perform rebase only on source chain
    await ETFVault.connect(rebaseManager).rebase(rebaseAmount);

    // Verify user2's shares remain unchanged after rebase
    const user2SharesAfter = await ETFVault.convertToShares(
      await ETFVault.balanceOf(user2.address)
    );
    expect(user2SharesAfter).to.equal(user2SharesBefore);

    // Verify source chain total assets increased by rebase amount
    const srcAssetsBefore = user1StakeAmount;
    const srcAssetsAfter = await ETFVault.totalAssets();
    expect(srcAssetsAfter).to.equal(srcAssetsBefore + rebaseAmount);

    // Verify destination chain total supply unchanged
    //const dstTotalSupply = await ETFVaultDst.totalSupply();
    //expect(dstTotalSupply).to.equal(transferAmount);
  });

  it('should handle withdrawals through WithdrawalHandler', async function () {
    // User deposits
    const depositAmount = ethers.parseUnits('1000', 18);
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);
    // Create withdrawal demand
    await ETFVault.connect(user1).withdraw(
      depositAmount,
      withdrawalHandler.target,
      user1.address
    );

    // Check withdrawal request in handler
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;
    const request = await withdrawalHandler.getWithdrawalRequest(
      user1.address,
      requestId
    );
    expect(request.amount).to.equal(depositAmount);
    expect(request.claimed).to.be.false;

    // Fast forward time
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    // Claim withdrawal
    const initialBalance = await underlyingToken.balanceOf(user1.address);
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    // Verify balances
    const finalBalance = await underlyingToken.balanceOf(user1.address);
    expect(finalBalance - initialBalance).to.equal(depositAmount);

    // Verify request is marked as claimed
    const requestAfter = await withdrawalHandler.getWithdrawalRequest(
      user1.address,
      requestId
    );
    expect(requestAfter.claimed).to.be.true;
  });

  it('should revert withdrawal request if caller is not ETF vault', async function () {
    const amount = ethers.parseUnits('1000', 18);
    await expect(
      withdrawalHandler
        .connect(user1)
        .createWithdrawalRequest(user1.address, amount)
    ).to.be.revertedWithCustomError(
      withdrawalHandler,
      'AccessControlUnauthorizedAccount'
    );
  });

  it('should create withdrawal request with correct parameters', async function () {
    const amount = ethers.parseUnits('1000', 18);
    
    await underlyingToken.mint(user1.address, amount);
    await underlyingToken.connect(user1).approve(await ETFVault.getAddress(), amount);
    await ETFVault.connect(user1).deposit(amount, user1.address);
    await ETFVault.connect(user1).withdraw(
      amount,
      withdrawalHandler.target,
      user1.address
    );

    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;
    const request = await withdrawalHandler.getWithdrawalRequest(
      user1.address,
      requestId
    );

    expect(request.amount).to.equal(amount);
    expect(request.claimed).to.be.false;
  });
  it('should not give yield if withdrawal demand is made before rebase', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Create withdrawal demand for all shares
    await ETFVault.connect(user1).withdraw(
      depositAmount,
      withdrawalHandler.target,
      user1.address
    );

    // Simulate a rebase/yield distribution
    const yieldAmount = ethers.parseUnits('100', 18);
    await underlyingToken.mint(await ETFVault.getAddress(), yieldAmount);

    // Fast forward time
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    // Claim withdrawal
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;
    const initialBalance = await underlyingToken.balanceOf(user1.address);
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    // Verify user only gets original amount without yield
    const finalBalance = await underlyingToken.balanceOf(user1.address);
    expect(finalBalance - initialBalance).to.equal(depositAmount);

    // Try to withdraw more than deposited - should fail
    await expect(
      ETFVault.connect(user1).withdraw(
        depositAmount,
        withdrawalHandler.target,
        user1.address
      )
    ).to.be.revertedWithCustomError(ETFVault, 'ERC4626ExceededMaxWithdraw');
  });
  it('should revert when redeeming with slippage check fails', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Create withdrawal request
    await ETFVault.connect(user1).withdraw(
      depositAmount,
      withdrawalHandler.target,
      user1.address
    );
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;

    // Set minimum amount higher than actual withdrawal amount to trigger slippage check
    const minAmount = depositAmount + ethers.parseUnits('1', 18);
  });

  it('should successfully redeem when slippage check passes', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Create withdrawal request
    await ETFVault.connect(user1).withdraw(
      depositAmount,
      withdrawalHandler.target,
      user1.address
    );
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;

    // Set minimum amount lower than actual withdrawal amount
    const minAmount = depositAmount - ethers.parseUnits('1', 18);

    // Fast forward time past withdrawal period
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    const initialBalance = await underlyingToken.balanceOf(user1.address);
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    // Verify withdrawal was successful
    const finalBalance = await underlyingToken.balanceOf(user1.address);
    expect(finalBalance - initialBalance).to.equal(depositAmount);

    // Verify request is marked as claimed
    const request = await withdrawalHandler.getWithdrawalRequest(
      user1.address,
      requestId
    );
    expect(request.claimed).to.be.true;
  });

  it('should revert when redeeming more than available balance', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Try to withdraw more than deposited
    await expect(
      ETFVault.connect(user1).withdraw(
        depositAmount + ethers.parseUnits('1', 18),
        withdrawalHandler.target,
        user1.address
      )
    ).to.be.revertedWithCustomError(ETFVault, 'ERC4626ExceededMaxWithdraw');
  });

  it('should successfully redeem shares for assets', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    const initialBalance = await underlyingToken.balanceOf(user1.address);
    const initialShares = await ETFVault.balanceOf(user1.address);

    // Redeem half of shares
    const redeemShares = initialShares / 2n;
    const expectedAssets = await ETFVault.previewRedeem(redeemShares);

    await expect(
      ETFVault.connect(user1).withdraw(
        expectedAssets,
        withdrawalHandler.target,
        user1.address
      )
    )
      .to.emit(ETFVault, 'Withdraw')
      .withArgs(
        user1.address,
        withdrawalHandler.target,
        user1.address,
        expectedAssets,
        redeemShares
      );

    // Fast forward time past withdrawal period
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    // Claim withdrawal
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    // Verify balances
    const finalBalance = await underlyingToken.balanceOf(user1.address);
    const finalShares = await ETFVault.balanceOf(user1.address);

    expect(finalBalance - initialBalance).to.equal(expectedAssets);
    expect(initialShares - finalShares).to.equal(redeemShares);
  });

  it('should allow redeemWithSlippageCheck', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    const redeemShares = ethers.parseUnits('500', 18);
    const expectedAssets = await ETFVault.previewRedeem(redeemShares);
    const minAssets = expectedAssets - ethers.parseUnits('10', 18); // Allow for slippage

    const initialBalance = await underlyingToken.balanceOf(user1.address);
    const maxShareBurned = await ETFVault.balanceOf(user1.address);
    await expect(
      ETFVault.connect(user1).withdrawWithSlippageCheck(
        expectedAssets,
        withdrawalHandler.target,
        user1.address,
        expectedAssets
      )
    )
      .to.emit(ETFVault, 'Withdraw')
      .withArgs(
        user1.address,
        withdrawalHandler.target,
        user1.address,
        expectedAssets,
        redeemShares
      );

    // Fast forward time past withdrawal period
    await ethers.provider.send('evm_increaseTime', [24 * 60 * 60]);
    await ethers.provider.send('evm_mine', []);

    // Claim withdrawal
    const requestId =
      (await withdrawalHandler.getUserNextRequestId(user1.address)) - 1n;
    await withdrawalHandler.connect(user1).claimWithdrawal(requestId);

    const finalBalance = await underlyingToken.balanceOf(user1.address);
    expect(finalBalance - initialBalance).to.be.gte(minAssets);
  });

  it('should revert redeemWithSlippageCheck if slippage is exceeded', async function () {
    const depositAmount = ethers.parseUnits('1000', 18);
    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    const redeemShares = ethers.parseUnits('500', 18);
    const expectedAssets = await ETFVault.previewRedeem(redeemShares);

    await expect(
      ETFVault.connect(user1).withdrawWithSlippageCheck(
        expectedAssets,
        withdrawalHandler.target,
        user1.address,
        redeemShares - 1n
      )
    ).to.be.revertedWithCustomError(ETFVault, 'SlippageExceeded');
  });
  it('should not allow blacklisted accounts to withdraw', async function () {
    // Setup initial deposit
    const depositAmount = ethers.parseUnits('1000', 18);
    
    await underlyingToken.mint(user1.address, depositAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      depositAmount
    );
    await ETFVault.connect(user1).deposit(depositAmount, user1.address);

    // Blacklist user1
    await ETFVault.connect(blacklistManager).blacklistAccount(
      user1.address
    );

    // Try to withdraw - should fail
    const withdrawAmount = ethers.parseUnits('500', 18);
    await expect(
      ETFVault.connect(user1).withdraw(
        withdrawAmount,
        withdrawalHandler.target,
        user1.address
      )
    ).to.be.revertedWithCustomError(ETFVault, 'BlacklistedAddress');

    // Try withdrawWithSlippageCheck - should also fail
    await expect(
      ETFVault.connect(user1).withdrawWithSlippageCheck(
        withdrawAmount,
        withdrawalHandler.target,
        user1.address,
        withdrawAmount + (withdrawAmount * 2n) / 100n // 2% slippage
      )
    ).to.be.revertedWithCustomError(ETFVault, 'BlacklistedAddress');

    // Unblacklist user1
    await ETFVault.connect(blacklistManager).unblacklistAccount(
      user1.address
    );

    // Should now be able to withdraw
    await ETFVault.connect(user1).withdrawWithSlippageCheck(
      withdrawAmount,
      withdrawalHandler.target,
      user1.address,
      withdrawAmount + (withdrawAmount * 2n) / 100n // 2% slippage
    );
  });

  it('should not allow blacklisted accounts to transfer on destination chain', async function () {
    // Initial setup - transfer tokens to destination chain first
    const user1StakeAmount = ethers.parseUnits('5000', 18);
    const transferAmount = ethers.parseUnits('2500', 18);

    
    await underlyingToken.mint(user1.address, user1StakeAmount);
    await underlyingToken.connect(user1).approve(
      await ETFVault.getAddress(),
      user1StakeAmount
    );
    
    // Deposit tokens on source chain
    await ETFVault.connect(user1).deposit(
      user1StakeAmount,
      await user1.getAddress()
    );

    // Send tokens to destination chain
    const executorLzReceiveOptionMaxGas = 65000;
    const options = await getOptions(executorLzReceiveOptionMaxGas);
    
    const sendParams: SendParamStruct = {
      dstEid: CHAIN_ID_DST,
      to: ethers.zeroPadValue(await user1.getAddress(), 32),
      amountLD: transferAmount,
      minAmountLD: transferAmount,
      extraOptions: options,
      composeMsg: '0x',
      oftCmd: '0x',
    };

    const [nativeFee] = await ETFVault.quoteSend(sendParams, false);
    await ETFVault.connect(user1).approve(
      await ETFVault.getAddress(),
      transferAmount
    );

    await ETFVault.connect(user1).send(
      sendParams,
      [nativeFee, 0],
      await user1.getAddress(),
      { value: nativeFee }
    );


    // Now verify and test blacklist
    expect(await ETFVaultDst.balanceOf(user1.address)).to.equal(transferAmount);
    await ETFVaultDst.connect(blacklistManager).blacklistAccount(user1.address);
    await expect(
      ETFVaultDst.connect(user1).transfer(user2.address, transferAmount)
    ).to.be.revertedWithCustomError(ETFVaultDst, 'BlacklistedAddress');
  });

  it('should only allow owner to create vaults', async function () {
    await expect(
      factory.connect(user1).createVault(
        await underlyingToken.getAddress(),
        'Test Vault',
        'TEST',
        await user1.getAddress()
      )
    ).to.be.revertedWithCustomError(factory, 'OwnableUnauthorizedAccount');
  });

  it('should not allow creation with zero addresses', async function () {
    await expect(
      factory.createVault(
        ethers.ZeroAddress,
        'Test Vault',
        'TEST',
        await owner.getAddress()
      )
    ).to.be.revertedWithCustomError(factory, 'ZeroAddress');

    await expect(
      factory.createVault(
        await underlyingToken.getAddress(),
        'Test Vault',
        'TEST',
        ethers.ZeroAddress
      )
    ).to.be.revertedWithCustomError(factory, 'ZeroAddress');
  });

  it('should create vault with correct parameters', async function () {
    const StakingVaultOFTUpgradeableFactory = await ethers.getContractFactory('StakingVaultOFTUpgradeable');
    
    const tx = await factory.createVault(
      await underlyingToken.getAddress(),
      'Test Vault',
      'TEST',
      await owner.getAddress()
    );
    const receipt = await tx.wait();
    const event = receipt?.logs.find(
      log => log.topics[0] === factory.interface.getEvent('VaultCreated').topicHash
    );
    const vaultAddress = event?.args?.vault;

    const vault = StakingVaultOFTUpgradeableFactory.attach(vaultAddress) as StakingVaultOFTUpgradeable;
    expect(await vault.name()).to.equal('Test Vault');
    expect(await vault.symbol()).to.equal('TEST');
    expect(await vault.asset()).to.equal(await underlyingToken.getAddress());
    expect(await vault.owner()).to.equal(await owner.getAddress());
  });

  describe('Factory Upgrades', function () {
    let newImplementation: Contract;
    let vaults: StakingVaultOFTUpgradeableV2[] = [];
    const NUM_VAULTS = 3;

    beforeEach(async function () {
      // Deploy multiple vaults
      for (let i = 0; i < NUM_VAULTS; i++) {
        const tx = await factory.createVault(
          await underlyingToken.getAddress(),
          `Staked ETF VALE ${i}`,
          `sVALE${i}`,
          await owner.getAddress()
        );
        const receipt = await tx.wait();
        const event = receipt?.logs.find(
          log => log.topics[0] === factory.interface.getEvent('VaultCreated').topicHash
        );
        const vaultAddress = event?.args?.vault;
        
        const ETFVaultFactory = await ethers.getContractFactory('StakingVaultOFTUpgradeableV2');
        vaults.push(ETFVaultFactory.attach(vaultAddress) as StakingVaultOFTUpgradeableV2);
      }

      // Deploy new implementation
      const ETFVaultFactory = await ethers.getContractFactory('StakingVaultOFTUpgradeableV2');
      newImplementation = await ETFVaultFactory.deploy(await endpointV2MockSrc.getAddress());
    });

    it('should upgrade all vaults through beacon', async function () {
      const initialImpl = await factory.implementation();
      expect(await vaults[0].version()).to.equal(1);

      await factory.upgradeTo(await newImplementation.getAddress());
      
      const newImpl = await factory.implementation();
      expect(newImpl).to.equal(await newImplementation.getAddress());
      expect(newImpl).to.not.equal(initialImpl);

      // Verify V2 functionality
      for (const vault of vaults) {
        await underlyingToken.mint(user1.address, stakeAmount);
        await underlyingToken.connect(user1).approve(await vault.getAddress(), stakeAmount);
        await vault.connect(user1).deposit(stakeAmount, user1.address);
        
        // V2 specific behavior - deposit should return 0 shares
        expect(await vault.balanceOf(user1.address)).to.equal(0);
        
        // V2 specific function - version should return 2
        expect(await vault.version()).to.equal(2);
      }
    });
  });
});
