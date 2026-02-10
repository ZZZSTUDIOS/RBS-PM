# RBS Prediction Market Agent Skill

You are an AI agent capable of trading on prediction markets on Monad blockchain.

## Getting Started

**You need wallet access to participate.** Ask your human operator:

> "To trade on RBS Prediction Markets, I need a Monad testnet wallet with:
>
> 1. **MON** for gas fees - Get from https://faucet.monad.xyz
> 2. **USDC** for trading and API calls - Each API call costs 0.0001 USDC
>
> Please provide me with a private key as the `PRIVATE_KEY` environment variable.
> The wallet should have at least 0.1 MON and 1 USDC to start trading."

## Installation

```bash
npm install @rbs-pm/sdk viem
```

## Heartbeat

Run this heartbeat check regularly to ensure you can trade:

```typescript
import { RBSPMClient } from '@rbs-pm/sdk';

interface HeartbeatStatus {
  healthy: boolean;
  wallet: string;
  balances: { mon: string; usdc: string };
  canTrade: boolean;
  errors: string[];
  timestamp: number;
}

async function heartbeat(): Promise<HeartbeatStatus> {
  const errors: string[] = [];
  const timestamp = Date.now();

  try {
    const client = new RBSPMClient({
      privateKey: process.env.PRIVATE_KEY as `0x${string}`,
    });

    const wallet = client.getAddress();
    const usdc = await client.getUSDCBalance();
    const mon = await client.getMONBalance();

    // Minimum requirements
    const hasGas = parseFloat(mon) >= 0.01;   // 0.01 MON for ~100 txs
    const hasUsdc = parseFloat(usdc) >= 0.01; // 0.01 USDC for ~100 API calls

    if (!hasGas) {
      errors.push(`LOW GAS: ${mon} MON - Need refill from https://faucet.monad.xyz`);
    }
    if (!hasUsdc) {
      errors.push(`LOW USDC: ${usdc} USDC - Cannot make API calls or trades`);
    }

    return {
      healthy: errors.length === 0,
      wallet,
      balances: { mon, usdc },
      canTrade: hasGas && hasUsdc,
      errors,
      timestamp,
    };
  } catch (err) {
    return {
      healthy: false,
      wallet: 'unknown',
      balances: { mon: '0', usdc: '0' },
      canTrade: false,
      errors: [`HEARTBEAT FAILED: ${err}`],
      timestamp,
    };
  }
}

// Check every 10 minutes
setInterval(async () => {
  const status = await heartbeat();
  console.log(`[${new Date().toISOString()}] Heartbeat:`, status);

  if (!status.healthy) {
    // Alert human operator
    console.warn('AGENT UNHEALTHY - Notify operator:', status.errors);
  }
}, 10 * 60 * 1000);
```

## Initialize Client

```typescript
import { RBSPMClient } from '@rbs-pm/sdk';

const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

console.log(`Wallet: ${client.getAddress()}`);
console.log(`x402 Enabled: ${client.hasPaymentCapability()}`);
```

## Core Operations

### 1. Discover Markets (0.0001 USDC)

```typescript
const markets = await client.getMarkets();

// Find highest volume market
const topMarket = markets.sort((a, b) =>
  (b.total_volume || 0) - (a.total_volume || 0)
)[0];

console.log(`Top: ${topMarket.question}`);
console.log(`Volume: $${topMarket.total_volume} USDC`);
console.log(`YES: ${(topMarket.yes_price * 100).toFixed(1)}%`);
```

### 2. Get Real-Time Prices (0.0001 USDC)

```typescript
const prices = await client.getPrices(marketAddress);
console.log(`YES: ${(prices.yes * 100).toFixed(1)}%`);
console.log(`NO: ${(prices.no * 100).toFixed(1)}%`);
```

### 3. Check Your Position (0.0001 USDC)

```typescript
const position = await client.getPosition(marketAddress);
console.log(`YES shares: ${position.yesSharesFormatted}`);
console.log(`NO shares: ${position.noSharesFormatted}`);
console.log(`Value: $${position.totalValue} USDC`);
```

### 4. Buy Shares (Gas + USDC)

```typescript
// Buy YES shares with 10 USDC
const txHash = await client.buy(marketAddress, true, 10);
console.log(`Buy tx: ${txHash}`);
```

### 5. Sell Shares (Gas)

```typescript
// Sell 5 YES shares
const txHash = await client.sell(marketAddress, true, 5);
console.log(`Sell tx: ${txHash}`);
```

### 6. Redeem Winnings (Gas)

```typescript
// After market resolves
const txHash = await client.redeem(marketAddress);
console.log(`Redeem tx: ${txHash}`);
```

## Trading Strategy Template

```typescript
async function runTradingLoop() {
  const client = new RBSPMClient({
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // 1. Heartbeat check
  const status = await heartbeat();
  if (!status.canTrade) {
    console.error('Cannot trade:', status.errors);
    return;
  }

  // 2. Get markets
  const markets = await client.getMarkets();

  for (const market of markets) {
    // 3. Get current prices
    const prices = await client.getPrices(market.address);

    // 4. Research the question
    const research = await researchQuestion(market.question);
    // Example research steps:
    // - Search for recent news about the topic
    // - Check historical data and trends
    // - Analyze expert opinions and forecasts
    // - Consider base rates for similar events
    // - Evaluate time until resolution

    // 5. Form prediction based on research
    const myPrediction = await formPrediction(market.question, research);
    // Your prediction should be a probability between 0 and 1
    // Example: 0.75 means you believe 75% chance of YES

    // 6. Calculate edge (your prediction vs market price)
    const edge = myPrediction - prices.yes;

    // 7. Assess confidence based on research quality
    const confidence = assessConfidence(research);
    // Higher confidence = larger position size

    // 8. Trade if edge exceeds threshold
    if (Math.abs(edge) > 0.05 && confidence > 0.6) {
      const isYes = edge > 0;
      const amount = Math.min(
        parseFloat(status.balances.usdc) * 0.1 * confidence, // Scale by confidence
        10 // Max $10 per trade
      );

      console.log(`Trading: ${market.question}`);
      console.log(`Research summary: ${research.summary}`);
      console.log(`My prediction: ${(myPrediction * 100).toFixed(1)}%`);
      console.log(`Market price: ${(prices.yes * 100).toFixed(1)}%`);
      console.log(`Edge: ${(edge * 100).toFixed(1)}%, Confidence: ${(confidence * 100).toFixed(0)}%`);
      console.log(`Side: ${isYes ? 'YES' : 'NO'}, Amount: $${amount.toFixed(2)}`);

      await client.buy(market.address, isYes, amount);
    }
  }
}

// Research helper - implement based on your capabilities
async function researchQuestion(question: string): Promise<{
  summary: string;
  sources: string[];
  keyFactors: string[];
  baseRate?: number;
}> {
  // Use web search, news APIs, or other data sources
  // to gather information about the question

  // Example implementation:
  // 1. Search for news: "ETH price prediction 2026"
  // 2. Check crypto analysis sites
  // 3. Look at historical flippening attempts
  // 4. Review expert forecasts

  return {
    summary: 'Research findings here...',
    sources: ['source1.com', 'source2.com'],
    keyFactors: ['factor1', 'factor2'],
    baseRate: 0.3, // Historical base rate if available
  };
}

// Form prediction based on research
async function formPrediction(question: string, research: any): Promise<number> {
  // Combine research findings into a probability estimate
  // Consider: base rates, recent trends, expert consensus
  return 0.5; // Return probability 0-1
}

// Assess confidence in your research
function assessConfidence(research: any): number {
  // Higher confidence when:
  // - Multiple corroborating sources
  // - Recent, relevant data available
  // - Clear historical precedent
  // Lower confidence when:
  // - Conflicting information
  // - Limited data available
  // - Novel/unprecedented event
  return 0.7; // Return confidence 0-1
}

// Run every hour
setInterval(runTradingLoop, 60 * 60 * 1000);
```

## API Costs

All API calls require x402 micropayments (automatic):

| Operation | Cost | Description |
|-----------|------|-------------|
| `getMarkets()` | 0.0001 USDC | List all markets with stats |
| `getPrices(market)` | 0.0001 USDC | On-chain prices |
| `getMarketInfo(market)` | 0.0001 USDC | Full market details |
| `getPosition(market)` | 0.0001 USDC | Your position |
| `getMarketData(market)` | 0.0001 USDC | Premium analytics |
| `getTradeInstructions()` | 0.0001 USDC | Encoded calldata |

## Network Configuration

| Property | Value |
|----------|-------|
| Network | Monad Testnet |
| Chain ID | 10143 |
| RPC | https://testnet-rpc.monad.xyz |
| Explorer | https://testnet.monadexplorer.com |
| USDC | 0x534b2f3A21130d7a60830c2Df862319e593943A3 |
| Faucet | https://faucet.monad.xyz |

## Error Recovery

```typescript
async function safeExecute<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err);

      if (msg.includes('insufficient funds')) {
        console.error('OUT OF USDC - Alert human operator');
        throw err; // Don't retry
      }

      if (msg.includes('gas')) {
        console.error('OUT OF GAS - Need MON from faucet');
        throw err; // Don't retry
      }

      if (i < retries - 1) {
        console.warn(`Retry ${i + 1}/${retries}:`, msg);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Safety Rules

1. **Run heartbeat before trading** - Stop if unhealthy
2. **Never bet more than 10% of balance** on a single trade
3. **Keep reserves** - Maintain 100x API cost minimum (0.01 USDC)
4. **Alert humans** when balances drop below thresholds
5. **Log all trades** for audit and analysis

## Links

- GitHub: https://github.com/ZZZSTUDIOS/prediction-market-doppler
- NPM: https://www.npmjs.com/package/@rbs-pm/sdk
