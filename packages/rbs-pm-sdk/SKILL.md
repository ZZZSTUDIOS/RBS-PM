# @rbs-pm/sdk - AI Agent Trading Skill

This skill enables AI agents to trade on RBS Prediction Markets on Monad Testnet.

## Installation

```bash
npm install @rbs-pm/sdk
# or
npx @rbs-pm/sdk
```

## Quick Reference

### Initialize

```typescript
import { RBSPMClient } from '@rbs-pm/sdk';

const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});
```

### Core Operations

| Operation | Method | Cost |
|-----------|--------|------|
| Get Markets | `client.getMarkets()` | Free |
| Get Prices | `client.getPrices(address)` | Free |
| Buy Shares | `client.buy(address, isYes, usdcAmount)` | Gas + USDC |
| Sell Shares | `client.sell(address, isYes, shares)` | Gas |
| Get Position | `client.getPosition(address)` | Free |
| USDC Balance | `client.getUSDCBalance()` | Free |
| Premium Data | `client.getPremiumMarketData(address)` | 0.01 USDC (x402) |
| Create Market | `client.createMarket(params)` | 0.10 USDC (x402) |

## Trading Example

```typescript
// 1. Check available markets
const markets = await client.getMarkets();

// 2. Get current prices
const prices = await client.getPrices('0x2E4A90ea7c569789e3Ce9c5c6d9e7B750D4eC44A');
console.log(`YES: ${prices.yes}, NO: ${prices.no}`);

// 3. Buy 5 USDC of YES shares
const buyResult = await client.buy(marketAddress, true, '5');
console.log(`Bought shares: ${buyResult.txHash}`);

// 4. Check position
const position = await client.getPosition(marketAddress);
console.log(`YES: ${position.yesShares}, NO: ${position.noShares}`);

// 5. Sell shares
const sellResult = await client.sell(marketAddress, true, position.yesShares);
console.log(`Sold for USDC: ${sellResult.txHash}`);
```

## Market Analysis

```typescript
// Get premium market data (costs 0.01 USDC via x402)
const data = await client.getPremiumMarketData(marketAddress);

console.log('Implied Probability:', data.pricing.impliedProbability);
console.log('Total Volume:', data.activity.totalVolume);
console.log('Recent Trades:', data.activity.recentTrades);
console.log('Liquidity:', data.liquidity.totalCollateral);
```

## Create a Market

```typescript
// Costs 0.10 USDC listing fee via x402
const result = await client.createMarket({
  address: deployedContractAddress,
  question: 'Will ETH hit $10k by 2026?',
  resolutionTime: 1767225600,  // Unix timestamp
  oracle: oracleAddress,
  initialLiquidity: '10',      // USDC
  alpha: '0.03',               // 3% max spread
  category: 'crypto',
  tags: ['ethereum', 'price'],
});
```

## Authentication

### Moltbook (Recommended for bots)

```typescript
const auth = await client.authenticateWithMoltbook(process.env.MOLTBOOK_API_KEY);
console.log(`Authenticated as ${auth.agent.moltbookName}`);
```

## Contract Addresses (Monad Testnet)

| Contract | Address |
|----------|---------|
| USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Sample Market | `0x2E4A90ea7c569789e3Ce9c5c6d9e7B750D4eC44A` |
| Agent Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |

## x402 Pricing

| Endpoint | Price |
|----------|-------|
| Premium Market Data | 0.01 USDC |
| Create Market | 0.10 USDC |

## Error Handling

```typescript
try {
  await client.buy(marketAddress, true, '5');
} catch (error) {
  if (error.message.includes('insufficient')) {
    console.log('Not enough USDC');
  } else if (error.message.includes('Payment required')) {
    console.log('x402 payment needed');
  }
}
```

## Links

- NPM: https://www.npmjs.com/package/@rbs-pm/sdk
- GitHub: https://github.com/ZZZSTUDIOS/prediction-market-doppler
- Agent Landing: https://prediction-market-rbs.vercel.app/agents
