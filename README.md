# RBS Prediction Markets

A prediction market platform on Monad with **LS-LMSR AMM**, **USDC collateral**, and **x402 micropayments** for AI agent access.

## Features

- **LS-LMSR AMM** - Liquidity-sensitive market maker for accurate price discovery
- **USDC Collateral** - Trade with stablecoins, not volatile tokens
- **x402 Micropayments** - Pay-per-API-call access (0.0001 USDC per call)
- **AI Agent SDK** - TypeScript SDK for programmatic trading
- **On-chain Settlement** - All trades settled on Monad blockchain
- **Real-time Indexing** - HyperSync-powered indexer syncs trades within 60s
- **Market Analytics** - Heat scores, stress, fragility, and velocity metrics

## Quick Start for AI Agents

### Installation

```bash
npm install @madgallery/rbs-pm-sdk viem
```

### Requirements

- **MON** for gas fees - Get from https://faucet.monad.xyz
- **USDC** for trading and API calls - Each API call costs 0.0001 USDC

### Usage

```typescript
import { RBSPMClient } from '@madgallery/rbs-pm-sdk';

const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// Check balances (free)
console.log('Wallet:', client.getAddress());
console.log('USDC:', await client.getUSDCBalance());
console.log('MON:', await client.getMONBalance());

// Scan all markets with prices + analytics (0.0001 USDC)
const markets = await client.getMarkets({ status: 'ACTIVE', sort: 'heat' });

for (const m of markets) {
  console.log(`${m.question}`);
  console.log(`  YES: ${(m.yesPrice * 100).toFixed(1)}% | NO: ${(m.noPrice * 100).toFixed(1)}%`);
  console.log(`  Heat: ${m.heatScore} | Stress: ${m.stressScore}`);
}

// Get your portfolio (0.0001 USDC)
const portfolio = await client.getPortfolio();
console.log(`Positions: ${portfolio.summary.totalPositions}`);
console.log(`Total value: $${portfolio.summary.totalValue} USDC`);

// Simulate a trade (free)
const quote = await client.getBuyQuote(markets[0].address, true, '10');
console.log(`Would get ${quote.shares} shares`);

// Buy YES shares (0.0001 USDC + gas + trade amount)
const result = await client.buy(markets[0].address, true, '10');
console.log('Trade TX:', result.txHash);
```

## x402 API Endpoints

All API endpoints require x402 micropayments. The SDK handles payments automatically.

### Market Discovery (0.0001 USDC each)

| Method | Description |
|--------|-------------|
| `getMarkets(options?)` | All markets with prices + analytics. Filter by status, category, creator. Sort by heat, volume, velocity. |
| `getPrices(market)` | Live on-chain prices for a single market |
| `getMarketInfo(market)` | Full on-chain market details (oracle, resolution time, liquidity, etc.) |
| `getPremiumMarketData(market)` | Deep analytics: velocity breakdown (v1m, v5m, v15m), acceleration, stress, fragility |

### Portfolio & Positions (0.0001 USDC each)

| Method | Description |
|--------|-------------|
| `getPortfolio(user?)` | All positions across all markets with current values |
| `getPosition(market, user?)` | Position in a single market |

### Trading (0.0001 USDC + gas each)

| Method | Description |
|--------|-------------|
| `buy(market, isYes, usdcAmount)` | Buy YES/NO shares with USDC |
| `sell(market, isYes, shares)` | Sell shares for USDC |
| `redeem(market)` | Redeem winning shares after resolution |

### Market Management (0.0001 USDC + gas each)

| Method | Description |
|--------|-------------|
| `deployMarket(params)` | Deploy + initialize + list in one call (~0.0003 USDC + gas + liquidity) |
| `listMarket(params)` | List a deployed market for discovery |
| `initializeMarket(market, amount)` | Initialize market with USDC liquidity |
| `resolve(market, yesWins)` | Resolve market outcome (oracle only) |
| `canResolve(market)` | Check if market can be resolved |
| `getFeeInfo(market)` | Check pending creator fees |
| `claimCreatorFees(market)` | Claim accumulated creator fees |
| `withdrawExcessCollateral(market)` | Withdraw excess collateral after resolution |

### Free Methods (on-chain reads, no x402)

| Method | Description |
|--------|-------------|
| `getBuyQuote(market, isYes, amount)` | Simulate buy — estimated shares and price |
| `getSellQuote(market, isYes, shares)` | Simulate sell — estimated payout |
| `getUSDCBalance(user?)` | USDC balance |
| `getMONBalance(user?)` | MON balance (for gas) |
| `getAddress()` | Connected wallet address |
| `hasPaymentCapability()` | Check if x402 is configured |

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
│     │                              │  Functions (x13) │            │
│     │                              │  (x402 Gateway)  │            │
│     │                              └──────────────────┘            │
│     │                                        │                     │
│     │  On-chain TX (MON gas)                 │ HyperSync indexer  │
│     ▼                                        ▼                     │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │  LSLMSR_ERC20    │─── events ──▶│  Supabase DB     │            │
│  │  Market Contract │  (HyperSync) │  + Realtime      │            │
│  └──────────────────┘              └──────────────────┘            │
│     │                                        │                     │
│     ▼                                        ▼                     │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │  YES/NO Tokens   │              │  x402 Facilitator│            │
│  │  (ERC-20)        │              │  (Monad)         │            │
│  └──────────────────┘              └──────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### x402 Edge Functions

| Function | Method | Purpose |
|----------|--------|---------|
| `x402-markets` | GET | List all markets with analytics |
| `x402-prices` | GET | Live prices for a market |
| `x402-market-info` | GET | Full on-chain market details |
| `x402-market-data` | GET | Premium analytics (velocity, stress, fragility) |
| `x402-position` | GET | User position in a market |
| `x402-portfolio` | GET | Full portfolio across all markets |
| `x402-agent-trade` | POST | Buy/sell calldata generation |
| `x402-resolve` | POST | Resolve calldata generation |
| `x402-redeem` | POST | Redeem calldata generation |
| `x402-claim-fees` | POST | Fee claim/withdraw calldata |
| `x402-initialize` | POST | Initialize calldata + approval |
| `x402-create-market` | POST | List market in discovery index |
| `x402-deploy-market` | POST | Deploy market via factory |

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

### SDK Development

```bash
cd packages/rbs-pm-sdk
npm run build    # Build SDK
npm run dev      # Watch mode
```

## Links

- **Live App**: https://prediction-market-doppler.vercel.app
- **NPM SDK**: https://www.npmjs.com/package/@madgallery/rbs-pm-sdk
- **Agent Guide**: See [SKILL.md](packages/rbs-pm-sdk/SKILL.md) for detailed agent trading patterns
- **x402 Protocol**: https://www.x402.org

## License

MIT
