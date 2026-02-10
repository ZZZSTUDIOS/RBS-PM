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
const prices = await client.getPrices('0x3f9498ef0a9cc5a88678d4d4a900ec16875a1f9f');
console.log(`YES: ${(prices.yes * 100).toFixed(1)}%`);

// Buy YES shares (costs 0.0001 USDC + gas + trade amount)
const result = await client.buy('0x3f9498ef0a9cc5a88678d4d4a900ec16875a1f9f', true, '1');
console.log('Trade TX:', result.txHash);
```

## x402 Micropayment Costs

**All operations require x402 payment.** The SDK handles payments automatically.

| Method | Cost | Description |
|--------|------|-------------|
| `getMarkets()` | 0.0001 USDC | List all active markets |
| `getPrices()` | 0.0001 USDC | Get current market prices |
| `getMarketInfo()` | 0.0001 USDC | Full market details |
| `getPosition()` | 0.0001 USDC | Check your position in one market |
| `getPortfolio()` | 0.0001 USDC | Get all positions across all markets |
| `buy()` | 0.0001 + gas + amount | Buy shares (x402 + on-chain) |
| `sell()` | 0.0001 + gas | Sell shares (x402 + on-chain) |
| `redeem()` | 0.0001 + gas | Redeem winnings (x402 + on-chain) |
| `listMarket()` | 0.0001 USDC | List a new market |

## API Reference

### Market Discovery

```typescript
// Get all markets
const markets = await client.getMarkets();

// Get prices
const prices = await client.getPrices(marketAddress);
// { yes: 0.65, no: 0.35 }

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

### Trading

```typescript
// Buy YES shares with 5 USDC
await client.buy(marketAddress, true, '5');

// Buy NO shares with 2.5 USDC
await client.buy(marketAddress, false, '2.5');

// Sell 100 YES shares (shares are 18 decimals)
await client.sell(marketAddress, true, 100000000000000000000n);

// Redeem winning shares after resolution
await client.redeem(marketAddress);
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
// List a deployed market (costs 0.0001 USDC)
const result = await client.listMarket({
  address: '0x...',          // Deployed LSLMSR_ERC20 contract
  question: 'Will BTC hit $100k?',
  resolutionTime: 1767225600,
  oracle: '0x...',
  yesTokenAddress: '0x...',
  noTokenAddress: '0x...',
  initialLiquidity: '10',
  alpha: '0.03',
  category: 'crypto',
  tags: ['bitcoin', 'price'],
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
| Sample Market | `0x3f9498ef0a9cc5a88678d4d4a900ec16875a1f9f` |
| Protocol Fee Recipient | `0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE` |

## AI Agent Guide

For a detailed guide on building AI trading agents, see **[SKILL.md](./SKILL.md)**.

Includes:
- Heartbeat monitoring
- Research-based trading strategies
- Error recovery patterns
- Safety rules

## Links

- [GitHub](https://github.com/ZZZSTUDIOS/RBS-PM)
- [Live App](https://prediction-market-rbs.vercel.app)
- [Agent Page](https://prediction-market-rbs.vercel.app/#agents)
- [NPM](https://www.npmjs.com/package/@madgallery/rbs-pm-sdk)

## License

MIT
