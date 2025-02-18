# Cross-Chain Staking Vault

A decentralized cross-chain staking vault system built with LayerZero protocol integration.

## Overview

This project implements a cross-chain staking vault system that allows users to stake tokens across different blockchain networks using LayerZero's omnichain interoperability protocol.

## Project Structure

```
├── contracts/
│   ├── mocks/
│   │   ├── StakingVaultOFTUpgradeableV2.sol
│   │   └── EndpointV2Mock.sol
│   ├── test/
│   │   └── BaseVaultLZ.test.ts
│   └── tasks/
│       ├── index.ts
│       └── accounts.ts
│
└── front/
    // Next.js application files
```

## Features

- Cross-chain token staking capabilities
- Upgradeable smart contracts
- LayerZero protocol integration
- Comprehensive test suite
- Hardhat tasks for deployment and management
- Web interface for interacting with the protocol
- Severless API for managing the vaults

## Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Hardhat

## Installation

1. Clone the repository:

```bash
git clone https://github.com/Kuurus/vault-factory
cd vault-factory
```

2. Install dependencies:

For smart contracts:
```bash
cd contracts
yarn install
```
or 
```bash
cd contracts
npm install
```

For front-end:
```bash
cd front
yarn install
```
or
```bash
cd front
npm install
```

## Testing

### Smart Contracts
Run the test suite:

```bash
cd contracts
yarn test
```
or
```bash
cd contracts
npx hardhat test
```

### Front-end
Run the development server:

```bash
cd front
yarn dev
```
or
```bash
cd front
npm run dev
```

## Development

The project consists of two main parts:

1. Smart Contracts (`/contracts`): Contains all the blockchain-related code, tests, and deployment scripts
2. Front-end (`/front`): Web interface for interacting with the smart contracts
