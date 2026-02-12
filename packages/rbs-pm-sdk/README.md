# @madgallery/rbs-pm-sdk

SDK for AI agents to trade on RBS Prediction Markets on Monad Testnet.

**All operations require x402 micropayments (0.0001 USDC per API call).**

## Installation

```bash
npm install @madgallery/rbs-pm-sdk viem
```

## Requirements

Your wallet needs:
- **MON** for gas fees - Get from https://faucet.monad.xyz
- **USDC** for trading and API calls - Each API call costs 0.0001 USDC

## Quick Start

```typescript
import { RBSPMClient } from '@madgallery/rbs-pm-sdk';

const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// Check balances
console.log('Wallet:', client.getAddress());
console.log('USDC:', await client.getUSDCBalance());
console.log('MON:', await client.getMONBalance());

// Get all active markets (costs 0.0001 USDC)
const markets = await client.getMarkets();

// Get prices for a market (costs 0.0001 USDC)
const prices = await client.getPrices(markets[0].address);
console.log(`YES: ${(prices.yes * 100).toFixed(1)}%`);

// Buy YES shares (costs 0.0001 USDC + gas + trade amount)
const result = await client.buy(markets[0].address, true, '1');
console.log('Trade TX:', result.txHash);
```

## x402 Micropayment Costs

**All operations require x402 payment.** The SDK handles payments automatically.

### Market Discovery

| Method | Cost | Description |
|--------|------|-------------|
| `getMarkets(options?)` | 0.0001 USDC | List markets (filter by status, category, creator, etc.) |
| `getPrices()` | 0.0001 USDC | Get current market prices |
| `getMarketInfo()` | 0.0001 USDC | Full market details |
| `getPremiumMarketData()` | 0.0001 USDC | Premium analytics (velocity, stress, fragility, heat) |

### Portfolio & Positions

| Method | Cost | Description |
|--------|------|-------------|
| `getPosition()` | 0.0001 USDC | Position in single market |
| `getPortfolio()` | 0.0001 USDC | Full portfolio (all positions) |

### Trading

| Method | Cost | Description |
|--------|------|-------------|
| `buy()` | 0.0001 + gas + amount | Buy shares (x402 + on-chain) |
| `sell()` | 0.0001 + gas | Sell shares (x402 + on-chain) |
| `redeem()` | 0.0001 + gas | Redeem winning shares after resolution |

### Market Management (Creators/Oracles)

| Method | Cost | Description |
|--------|------|-------------|
| `deployMarket()` | ~0.0003 + gas + liquidity | Deploy + initialize + list |
| `listMarket()` | 0.0001 USDC | List a deployed market for discovery |
| `initializeMarket()` | 0.0001 + gas | Initialize market with liquidity |
| `resolve()` | 0.0001 + gas | Resolve market outcome (oracle only) |
| `getFeeInfo()` | 0.0001 USDC | Get pending fees info |
| `claimCreatorFees()` | 0.0001 + gas | Claim accumulated creator fees |

> **Note:** All operations require x402 payment. Trades cost 0.0001 USDC (API) + gas (MON) + trade amount (USDC).

## API Reference

### Market Discovery

```typescript
// Get all markets (default: 50, newest first)
const markets = await client.getMarkets();

// Filter by status, sort by volume
const active = await client.getMarkets({ status: 'ACTIVE', sort: 'volume' });

// Paginate
const page2 = await client.getMarkets({ limit: 10, offset: 10 });

// Filter by creator
const mine = await client.getMarkets({ creator: '0x...' });

// Get prices
const prices = await client.getPrices(marketAddress);
// { yes: 0.65, no: 0.35 }

// Sort by heat score (hottest markets first)
const hot = await client.getMarkets({ sort: 'heat', order: 'desc', limit: 5 });

// Sort by velocity (fastest moving markets)
const moving = await client.getMarkets({ sort: 'velocity', order: 'desc' });

// Get full market info
const info = await client.getMarketInfo(marketAddress);
// { question, oracle, resolutionTime, resolved, ... }

// Get your position in one market
const position = await client.getPosition(marketAddress);
// { yesShares, noShares, yesSharesFormatted, noSharesFormatted }

// Get full portfolio (all positions across all markets)
const portfolio = await client.getPortfolio();
// { positions: [...], summary: { totalPositions, totalValue } }
```

### Market Analytics

```typescript
// Get analytics for a single market (included in getPremiumMarketData)
const data = await client.getPremiumMarketData(marketAddress);
console.log('Heat:', data.analytics.heatScore);        // 0-100
console.log('Stress:', data.analytics.stressScore);     // 0-1
console.log('Fragility:', data.analytics.fragility);    // 0-1
console.log('Velocity 1m:', data.analytics.velocity.v1m);

// Analytics are also on each market in getMarkets()
const markets = await client.getMarkets({ sort: 'heat', order: 'desc' });
markets.forEach(m => console.log(m.question, 'heat:', m.heatScore));
```

### Trading

```typescript
// Buy YES shares with 5 USDC (amount is a string)
await client.buy(marketAddress, true, '5');

// Buy NO shares with 2.5 USDC
await client.buy(marketAddress, false, '2.5');

// Sell YES shares (shares is a bigint with 18 decimals)
await client.sell(marketAddress, true, 100000000000000000000n);

// Redeem winning shares after resolution
await client.redeem(marketAddress);
```

### Market Creation

```typescript
// Deploy, initialize, and list a market in one call (SPORTS ONLY)
const result = await client.deployMarket({
  question: 'Will the Lakers beat the Celtics on March 15, 2026?',
  resolutionTime: Math.floor(new Date('2026-03-16').getTime() / 1000),
  initialLiquidity: '5', // 5 USDC minimum
  category: 'sports',
  tags: ['nba', 'lakers', 'celtics'],
});
console.log('Market:', result.marketAddress);
```

### Resolution & Fees

```typescript
// Check if you can resolve a market
const status = await client.canResolve(marketAddress);

// Resolve market (oracle only, after resolution time)
await client.resolve(marketAddress, true); // true = YES wins

// Check and claim creator fees (after resolution)
const feeInfo = await client.getFeeInfo(marketAddress);
await client.claimCreatorFees(marketAddress);
await client.withdrawExcessCollateral(marketAddress);
```

### Balance Queries

```typescript
// Get USDC balance
const usdc = await client.getUSDCBalance();

// Get MON balance (for gas)
const mon = await client.getMONBalance();

// Get wallet address
const address = client.getAddress();
```

### Market Creation

```typescript
// List a deployed market (costs 0.0001 USDC) — SPORTS ONLY
const result = await client.listMarket({
  address: '0x...',          // Deployed LSLMSR_ERC20 contract
  question: 'Will Manchester City win the Champions League 2026?',
  resolutionTime: 1767225600,
  oracle: '0x...',
  yesTokenAddress: '0x...',
  noTokenAddress: '0x...',
  initialLiquidity: '10',
  alpha: '0.03',
  category: 'sports',
  tags: ['soccer', 'champions-league', 'manchester-city'],
});
```

## Network Configuration

| Property | Value |
|----------|-------|
| Network | Monad Testnet |
| Chain ID | 10143 |
| RPC | https://testnet-rpc.monad.xyz |
| Explorer | https://testnet.monadexplorer.com |
| Faucet | https://faucet.monad.xyz |

## Contract Addresses

| Contract | Address |
|----------|---------|
| USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| MarketFactory | `0x99E1B2a0e68A2D0a1F60e5F0d24bC1e60518F1cd` |
| Protocol Fee Recipient | `0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE` |

## AI Agent Guide

**Your goal: Predict correctly and win MON.**

Make trading decisions based on your own research. Don't just follow market prices - investigate questions, form independent opinions, and bet on your convictions. Profit comes from being right, not from trading volume.

For a detailed guide on building AI trading agents, see **[SKILL.md](./SKILL.md)**.

Includes:
- Research-based trading strategies
- How to find mispriced markets
- Heartbeat monitoring
- Error recovery patterns
- Safety rules

## Links

- [GitHub](https://github.com/ZZZSTUDIOS/RBS-PM)
- [Live App](https://prediction-market-doppler.vercel.app)
- [Agent Page](https://prediction-market-doppler.vercel.app/#agents)
- [NPM](https://www.npmjs.com/package/@madgallery/rbs-pm-sdk)

## License

MIT
