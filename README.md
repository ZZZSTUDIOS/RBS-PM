# RBS Prediction Markets

A prediction market platform on Monad with **LS-LMSR AMM**, **USDC collateral**, and **x402 micropayments** for AI agent access.

## Features

- **LS-LMSR AMM** - Liquidity-sensitive market maker for accurate price discovery
- **USDC Collateral** - Trade with stablecoins, not volatile tokens
- **x402 Micropayments** - Pay-per-API-call access (0.0001 USDC per call)
- **AI Agent SDK** - TypeScript SDK for programmatic trading
- **On-chain Settlement** - All trades settled on Monad blockchain

## Quick Start for AI Agents

### Installation

```bash
npm install @madgallery/rbs-pm-sdk viem
```

### Usage

```typescript
import { RBSPMClient } from '@madgallery/rbs-pm-sdk';

const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// Get markets (costs 0.0001 USDC)
const markets = await client.getMarkets();

// Get prices (costs 0.0001 USDC)
const prices = await client.getPrices(markets[0].address);
console.log(`YES: ${(prices.yes * 100).toFixed(1)}%`);

// Buy YES shares (costs 0.0001 USDC + gas + trade amount)
const result = await client.buy(markets[0].address, true, '10');
console.log('Trade TX:', result.txHash);
```

### Requirements

- **MON** for gas fees - Get from https://faucet.monad.xyz
- **USDC** for trading and API calls - Each API call costs 0.0001 USDC

## x402 API Costs

All API endpoints require x402 micropayments:

| Method | Cost | Description |
|--------|------|-------------|
| `getMarkets()` | 0.0001 USDC | List all active markets |
| `getPrices()` | 0.0001 USDC | Get current market prices |
| `getMarketInfo()` | 0.0001 USDC | Full market details |
| `getPosition()` | 0.0001 USDC | Check your share balance |
| `buy()` | 0.0001 + gas + amount | Buy shares |
| `sell()` | 0.0001 + gas | Sell shares |
| `redeem()` | 0.0001 + gas | Redeem winnings |
| `listMarket()` | 0.0001 USDC | List a new market |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     RBS PREDICTION MARKETS                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  AGENT/USER                                                         │
│     │                                                               │
│     ▼                                                               │
│  ┌──────────────────┐      x402 Payment (USDC)                     │
│  │ @madgallery/     │─────────────────────────┐                    │
│  │ rbs-pm-sdk       │                         │                    │
│  └──────────────────┘                         ▼                    │
│     │                              ┌──────────────────┐            │
│     │                              │  Supabase Edge   │            │
│     │                              │  Functions       │            │
│     │                              │  (x402 Gateway)  │            │
│     │                              └──────────────────┘            │
│     │                                        │                     │
│     │  On-chain TX (MON gas)                 │ HyperSync indexer  │
│     ▼                                        ▼                     │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │  LSLMSR_ERC20    │─── events ──▶│  Supabase DB     │            │
│  │  Market Contract │  (HyperSync) │  (markets, trades)│            │
│  └──────────────────┘              └──────────────────┘            │
│     │                                                               │
│     ▼                                                               │
│  ┌──────────────────┐                                              │
│  │  YES/NO Tokens   │  (ERC-20 outcome tokens)                     │
│  └──────────────────┘                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Network Configuration

| Property | Value |
|----------|-------|
| Network | Monad Testnet |
| Chain ID | 10143 |
| RPC | https://testnet-rpc.monad.xyz |
| Explorer | https://testnet.monadexplorer.com |
| Faucet | https://faucet.monad.xyz |

## Contract Addresses (Monad Testnet)

| Contract | Address |
|----------|---------|
| USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| MarketFactory (v2) | `0x99E1B2a0e68A2D0a1F60e5F0d24bC1e60518F1cd` |
| Protocol Fee Recipient | `0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE` |

## Development

### Prerequisites

- Node.js 18+
- Foundry (for contract deployment)

### Setup

```bash
# Clone
git clone https://github.com/ZZZSTUDIOS/RBS-PM.git
cd RBS-PM

# Install dependencies
npm install

# Run frontend
npm run dev
```

### Deploy Contracts

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Deploy LSLMSR_ERC20 market
forge script script/DeployLSLMSR_ERC20.s.sol --rpc-url https://testnet-rpc.monad.xyz --private-key $PRIVATE_KEY --broadcast --legacy
```

### Run Agent Simulation

```bash
cd packages/rbs-pm-sdk
PRIVATE_KEY=0x... npx tsx agent-trade-simulation.ts
```

## Links

- **Live App**: https://prediction-market-doppler.vercel.app
- **Agent Page**: https://prediction-market-doppler.vercel.app/#agents
- **NPM SDK**: https://www.npmjs.com/package/@madgallery/rbs-pm-sdk
- **x402 Protocol**: https://www.x402.org

## License

MIT
