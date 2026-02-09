# Doppler Prediction Market on Monad

A prediction market implementation using [Doppler](https://doppler.lol) for token launches on [Monad](https://monad.xyz), featuring a brutalist admin UI with real wallet connection and Doppler SDK integration.

## Features

- **Real Wallet Connection** via wagmi/viem
- **Doppler SDK Integration** for token creation and trading
- **Brutalist Admin UI** for managing prediction markets
- **Full Market Lifecycle** - create, trade, resolve, redeem

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PREDICTION MARKET FLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. CREATE MARKET                                                   │
│     ┌──────────┐        ┌──────────┐        ┌──────────────┐       │
│     │ Doppler  │───────▶│ YES/NO   │───────▶│  Prediction  │       │
│     │   SDK    │        │  Tokens  │        │   Market     │       │
│     └──────────┘        └──────────┘        └──────────────┘       │
│                                                                     │
│  2. TRADING                                                         │
│     ┌──────────┐        ┌──────────┐        ┌──────────────┐       │
│     │  Trader  │───────▶│ Bonding  │───────▶│  YES or NO   │       │
│     │   WMON   │        │  Curves  │        │   Tokens     │       │
│     └──────────┘        └──────────┘        └──────────────┘       │
│                                                                     │
│  3. RESOLUTION                                                      │
│     ┌──────────┐        ┌──────────┐        ┌──────────────┐       │
│     │  Oracle  │───────▶│ Resolve  │───────▶│   Winners    │       │
│     │          │        │  Market  │        │   Redeem     │       │
│     └──────────┘        └──────────┘        └──────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## How It Works

### Outcome Tokens
- Each market has two tokens: **YES** and **NO**
- Tokens are launched via Doppler's multicurve bonding curves
- Prices reflect market consensus on outcome probability

### Price Discovery
```
If traders believe YES is likely:
  → Buy YES tokens → YES price ↑ → Implied probability ↑

If traders believe NO is likely:
  → Buy NO tokens → NO price ↑ → Implied probability ↑
```

### Resolution
- Oracle resolves market to: `YES`, `NO`, or `INVALID`
- Winning token holders redeem for collateral (WMON)
- Losing tokens become worthless

## Quick Start

### Prerequisites

- Node.js 18+
- Foundry (for contract deployment)
- WMON on Monad Testnet

### Installation

```bash
# Clone
git clone <repo>
cd prediction-market-doppler

# Install dependencies
npm install

# Install Foundry (for contracts)
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 1. Deploy Contracts

```bash
# Set environment
export PRIVATE_KEY="your-private-key"
export RPC_URL="https://testnet-rpc.monad.xyz"

# Deploy factory
forge create contracts/PredictionMarketFactory.sol:PredictionMarketFactory \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --constructor-args \
    0x0000000000000000000000000000000000000000 \  # Doppler Airlock (get from docs)
    0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701   # WMON
```

### 2. Create Outcome Tokens (via Doppler)

```typescript
import { DopplerSDK } from '@whetstone-research/doppler-sdk';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';

const WMON = '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701';

// Initialize SDK (see src/sdk.ts for chain config)
const sdk = new DopplerSDK({
  publicClient,
  walletClient,
  chainId: 10143, // Monad testnet
});

// Create YES token
const yesParams = sdk
  .buildMulticurveAuction()
  .tokenConfig({
    name: 'ETH10K-YES',
    symbol: 'YES-ETH10K',
    tokenURI: 'https://api.example.com/yes.json',
  })
  .saleConfig({
    initialSupply: parseEther('1000000000'),
    numTokensToSell: parseEther('900000000'),
    numeraire: WMON,
  })
  .withCurves({
    numerairePrice: 1,
    curves: [
      { marketCap: { start: 1_000, end: 10_000 }, numPositions: 5, shares: parseEther('0.3') },
      { marketCap: { start: 10_000, end: 100_000 }, numPositions: 10, shares: parseEther('0.5') },
      { marketCap: { start: 100_000, end: 'max' }, numPositions: 5, shares: parseEther('0.2') },
    ],
  })
  .withGovernance({ type: 'noOp' })
  .withMigration({ type: 'noOp' })
  .withUserAddress(account.address)
  .build();

const yesResult = await sdk.factory.createMulticurve(yesParams);
console.log('YES Token:', yesResult.tokenAddress);

// Repeat for NO token...
```

### 3. Create Prediction Market

```typescript
import { DopplerPredictionMarketSDK } from './src/sdk';

const pmSdk = new DopplerPredictionMarketSDK();
pmSdk.setWallet(process.env.PRIVATE_KEY);

const { marketAddress } = await pmSdk.createMarket(
  yesTokenAddress,
  noTokenAddress,
  'Will ETH hit $10,000 by end of 2026?',
  new Date('2026-12-31'),
  oracleAddress
);
```

### 4. Trade & Resolve

```typescript
// Trading happens on Doppler's bonding curves
// Use Doppler SDK's Quoter + Universal Router for swaps

// After event occurs, oracle resolves:
await pmSdk.resolveMarket(marketAddress, Outcome.YES);

// Winners redeem:
const balance = await pmSdk.getTokenBalance(yesToken, userAddress);
await pmSdk.redeem(marketAddress, balance);
```

## Contract Structure

### PredictionMarket.sol

Main market contract that:
- Holds YES/NO token references
- Manages collateral
- Handles resolution
- Processes redemptions

### PredictionMarketFactory.sol

Factory that:
- Deploys new prediction markets
- Tracks all markets
- Stores market metadata

## Configuration

### Bonding Curve Strategy

For prediction markets, we recommend:

```typescript
curves: [
  // Early discovery phase - cheap tokens
  { marketCap: { start: 1_000, end: 10_000 }, numPositions: 5, shares: parseEther('0.3') },
  
  // Main trading range
  { marketCap: { start: 10_000, end: 100_000 }, numPositions: 10, shares: parseEther('0.5') },
  
  // High conviction / late stage
  { marketCap: { start: 100_000, end: 'max' }, numPositions: 5, shares: parseEther('0.2') },
]
```

This creates:
- Low entry prices for early participants
- Smooth price discovery as interest grows
- Natural price ceiling as market cap increases

## Important Links

- [Doppler Docs](https://docs.doppler.lol)
- [Monad Docs](https://docs.monad.xyz)
- [Monad Testnet Explorer](https://testnet.monadexplorer.com)

## Contract Addresses

| Contract | Address | Network |
|----------|---------|---------|
| PredictionMarketFactory | `TBD` | Monad Testnet |
| WMON | `0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701` | Monad Testnet |
| Doppler Airlock | Check [Doppler Docs](https://docs.doppler.lol/resources/contract-addresses) | Monad Testnet |

## Development

```bash
# Run example script
npx ts-node scripts/create-market.ts

# Build
npm run build

# Test contracts (requires Foundry)
forge test
```

## License

MIT
# Trigger redeploy

# Prediction Market

