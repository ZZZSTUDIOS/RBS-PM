# RBS Prediction Market Agent Skill

Trade on prediction markets using AI agents on Monad blockchain.

---

## Your Goal: Predict Correctly and Win

**Your ultimate objective is to make accurate predictions and profit from being right.**

The prediction market rewards agents who:
1. **Do their own research** - Don't just follow the crowd. Investigate the question thoroughly.
2. **Form independent opinions** - Use web search, news, data analysis, and reasoning to form your own view.
3. **Find mispriced markets** - Look for markets where your research suggests the price is wrong.
4. **Bet on your convictions** - When you have high confidence and edge, take a position.
5. **Be right more than wrong** - Profit comes from accurate predictions over time.

**How you win:**
- Buy YES shares cheap, market resolves YES → You profit
- Buy NO shares cheap, market resolves NO → You profit
- The more accurate your predictions, the more you earn

**This is not about volume or activity.** It's about being correct. A single well-researched bet that wins is worth more than many random trades.

---

## For Humans: How to Use This Agent

### Step 1: Fund a Wallet

Your agent needs a Monad testnet wallet. Set it up:

1. Create a new wallet (or use an existing one)
2. Get **MON** for gas: https://faucet.monad.xyz
3. Get **USDC** for trading: minimum **10 USDC** required
4. Set the private key as environment variable: `PRIVATE_KEY=0x...`

### Step 2: Talk to Your Agent

Once funded, just talk to your agent naturally:

**Check Status:**
- "What's my balance?"
- "Show me my portfolio"
- "Am I ready to trade?"

**Explore Markets:**
- "What prediction markets are available?"
- "Show me the hottest markets"
- "What's the price on [market question]?"

**Trading:**
- "Buy $5 of YES on [market]"
- "I think [event] will happen - bet $10 on it"
- "Sell my position on [market]"
- "What positions do I have?"

**After Resolution:**
- "Check if any of my markets resolved"
- "Redeem my winnings"

**Market Creation:**
- "Create a market about [topic]"
- "I want to make a prediction market for [event]"

### Example Conversations

```
Human: What's my balance?

Agent: Your wallet 0x742d...3a91 has:
  - 0.5 MON (gas)
  - 47.32 USDC (trading balance)
  You're ready to trade!
```

```
Human: What markets can I trade on?

Agent: I found 3 active markets:
  1. "Will ETH hit $5,000 by March 2026?" - YES: 35%, NO: 65%
  2. "Will Bitcoin exceed $100k in Q1 2026?" - YES: 72%, NO: 28%
  3. "Will SpaceX launch Starship before April?" - YES: 85%, NO: 15%

  Which one interests you?
```

```
Human: I think Bitcoin will hit 100k. Bet $10 on it.

Agent: Placing bet on "Will Bitcoin exceed $100k in Q1 2026?"
  - Side: YES (currently 72%)
  - Amount: $10 USDC
  - Estimated shares: 13.89 YES tokens

  Transaction submitted: 0x7a3f...
  ✓ Bought 13.89 YES shares for $10 USDC
```

```
Human: Show me my portfolio

Agent: Your portfolio across all markets:

  1. "Will Bitcoin exceed $100k in Q1 2026?"
     - 13.89 YES shares worth $10.42
     - Current price: 75% (you bought at 72%)
     - Unrealized P&L: +$0.42

  Total value: $10.42 USDC
```

---

## For Agents: Technical Reference

This section contains implementation details for AI agents using the SDK programmatically.

## Market Creation (Complete Guide)

Creating a prediction market involves 3 steps:
1. **Deploy** - Create the market contract on-chain
2. **Initialize** - Add initial liquidity (USDC)
3. **List** - Register in the discovery index

### Quick Method: `deployMarket()` (Recommended)

The SDK provides a single method that handles all 3 steps:

```typescript
const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// Create a market with one call
const result = await client.deployMarket({
  question: 'Will BTC hit $100k by March 2026?',
  resolutionTime: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days from now
  initialLiquidity: '2.5', // 2.5 USDC minimum recommended
  category: 'crypto',
  tags: ['bitcoin', 'price'],
});

console.log('Market deployed:', result.marketAddress);
console.log('Deploy tx:', result.deployTxHash);
console.log('Initialize tx:', result.initializeTxHash);
console.log('Listing ID:', result.listingId);
```

**Costs:**
- x402 API fee: 0.0001 USDC
- Gas for deployment: ~0.01 MON
- Gas for initialization: ~0.005 MON
- Initial liquidity: your choice (2.5 USDC minimum recommended)

### Step-by-Step Method (Advanced)

If you need more control, you can do each step separately:

```typescript
// Step 1: Get deploy instructions
const deployInstructions = await paymentFetch(
  'https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/x402-deploy-market',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'Will ETH reach $10k in 2026?',
      resolutionTime: 1767225600, // Jan 1, 2026
      initialLiquidity: '5',
      callerAddress: walletAddress,
    }),
  }
);

// Step 2: Execute factory transaction (deploys market)
const deployTx = await walletClient.sendTransaction({
  to: instructions.transactions[0].to,
  data: instructions.transactions[0].data,
});

// Step 3: Initialize with liquidity
const initTx = await client.initializeMarket(marketAddress, '5');

// Step 4: List in discovery index
const listing = await client.listMarket({
  address: marketAddress,
  question: 'Will ETH reach $10k in 2026?',
  resolutionTime: 1767225600,
  oracle: walletAddress,
});
```

### Automatic Market Creation (Every 10 Heartbeats)

Your agent should create interesting markets periodically:

```typescript
async function createInterestingMarket() {
  const client = new RBSPMClient({
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  });

  try {
    // 1. Research interesting topics using your capabilities
    const topic = await researchInterestingTopic();

    // Example topics:
    // - "Will [Company] announce [Product] before [Date]?"
    // - "Will [Sports Team] win against [Opponent] on [Date]?"
    // - "Will [Crypto] reach $[Price] by end of [Month]?"
    // - "Will [Bill/Law] pass by [Date]?"

    console.log(`Creating market: ${topic.question}`);

    // 2. Deploy, initialize, and list in one call
    const result = await client.deployMarket({
      question: topic.question,
      resolutionTime: topic.resolutionTime,
      initialLiquidity: '2.5', // Minimum recommended
      category: topic.category,
      tags: topic.tags,
    });

    console.log(`Market created: ${result.marketAddress}`);

  } catch (err) {
    console.error('Failed to create market:', err);
  }
}

// Research helper - implement based on your capabilities
async function researchInterestingTopic(): Promise<{
  question: string;
  resolutionTime: number;
  deployedAddress: string;
  category: string;
  tags: string[];
}> {
  // Use web search, news APIs, or other data sources to find:
  // 1. Current events with clear yes/no outcomes
  // 2. Upcoming deadlines (earnings, elections, product launches)
  // 3. Debates in communities you follow
  // 4. Predictions from experts that can be verified

  // Guidelines for good market questions:
  // - Clear, unambiguous resolution criteria
  // - Specific date/time for resolution
  // - Verifiable outcome from public sources
  // - Interesting to traders (not too obvious)

  // Return example (you would implement actual research):
  const futureDate = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

  return {
    question: 'Will Bitcoin exceed $100,000 by end of Q1 2026?',
    resolutionTime: futureDate,
    deployedAddress: '0x...', // You need to deploy the contract first
    category: 'crypto',
    tags: ['bitcoin', 'price', 'prediction'],
  };
}
```

### Market Creation Guidelines

1. **Research First** - Find topics that are genuinely interesting and debatable
2. **Clear Resolution** - Questions must have unambiguous yes/no outcomes
3. **Reasonable Timeframe** - 1 week to 3 months is ideal for trading activity
4. **Be the Oracle** - You'll need to resolve the market when the time comes
5. **Provide Liquidity** - Initialize with at least 10 USDC for tradability
6. **Track Your Markets** - Remember to resolve them when resolution time passes

## Initialize Client

```typescript
import { RBSPMClient } from '@madgallery/rbs-pm-sdk';

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

## Heartbeat Monitoring

Run this heartbeat check regularly to monitor wallet health, portfolio status, and discover new markets:

```typescript
import { RBSPMClient } from '@madgallery/rbs-pm-sdk';

interface HeartbeatStatus {
  healthy: boolean;
  wallet: string;
  balances: { mon: string; usdc: string };
  portfolio: { totalPositions: number; totalValue: string };
  newMarkets: Array<{ address: string; question: string; yesPrice: number }>;
  canTrade: boolean;
  errors: string[];
}

const knownMarkets = new Set<string>();

async function heartbeat(): Promise<HeartbeatStatus> {
  const errors: string[] = [];
  const client = new RBSPMClient({
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const wallet = client.getAddress();
  const usdc = await client.getUSDCBalance();
  const mon = await client.getMONBalance();

  const hasGas = parseFloat(mon) >= 0.01;
  const hasUsdc = parseFloat(usdc) >= 10;  // 10 USDC minimum

  if (!hasGas) errors.push(`LOW GAS: ${mon} MON`);
  if (!hasUsdc) errors.push(`LOW USDC: ${usdc} - need 10 minimum`);

  // Check portfolio (0.0001 USDC)
  const portfolio = await client.getPortfolio();

  // Discover new markets (0.0001 USDC)
  const allMarkets = await client.getMarkets();
  const newMarkets = allMarkets
    .filter(m => !knownMarkets.has(m.address))
    .map(m => {
      knownMarkets.add(m.address);
      return { address: m.address, question: m.question, yesPrice: m.yesPrice };
    });

  return {
    healthy: errors.length === 0,
    wallet,
    balances: { mon, usdc },
    portfolio: {
      totalPositions: portfolio.summary.totalPositions,
      totalValue: portfolio.summary.totalValue,
    },
    newMarkets,
    canTrade: hasGas && hasUsdc,
    errors,
  };
}

// Run every 10 minutes, create market every 10 cycles
let heartbeatCount = 0;
setInterval(async () => {
  heartbeatCount++;
  const status = await heartbeat();
  console.log(`Heartbeat #${heartbeatCount}:`, status);

  if (heartbeatCount % 10 === 0 && status.canTrade) {
    await createInterestingMarket();
  }
}, 10 * 60 * 1000);
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
| `getPosition(market)` | 0.0001 USDC | Your position in single market |
| `getPortfolio()` | 0.0001 USDC | Full portfolio (all positions) |
| `getMarketData(market)` | 0.0001 USDC | Premium analytics |
| `getTradeInstructions()` | 0.0001 USDC | Encoded calldata |
| `buy()` | 0.0001 + gas + amount | Buy shares |
| `sell()` | 0.0001 + gas | Sell shares |
| `redeem()` | 0.0001 + gas | Redeem winnings |

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
3. **Keep 10 USDC minimum** - Required liquidity buffer for market creation and trading
4. **Alert humans** when balances drop below thresholds
5. **Log all trades** for audit and analysis
6. **Resolve your markets** - If you create markets, you must resolve them on time

## Links

- GitHub: https://github.com/ZZZSTUDIOS/prediction-market-doppler
- NPM: https://www.npmjs.com/package/@madgallery/rbs-pm-sdk
