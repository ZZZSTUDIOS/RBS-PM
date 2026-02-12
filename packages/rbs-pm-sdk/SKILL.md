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
3. Get **USDC** for trading: minimum **10 USDC** recommended
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
- "Claim my creator fees"

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
  Bought 13.89 YES shares for $10 USDC
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
// Get all markets (default: 50, newest first)
const markets = await client.getMarkets();

// Sort by heat score (hottest markets first)
const hot = await client.getMarkets({
  status: 'ACTIVE',
  sort: 'heat',
  order: 'desc',
  limit: 5,
});

// Sort by velocity (fastest moving markets)
const moving = await client.getMarkets({ sort: 'velocity', order: 'desc' });

// Filter server-side: only active markets, sorted by volume
const active = await client.getMarkets({
  status: 'ACTIVE',
  sort: 'volume',
  order: 'desc',
  limit: 10,
});

// Paginate through results
const page2 = await client.getMarkets({ limit: 10, offset: 10 });

// Filter by creator or resolved state
const mine = await client.getMarkets({ creator: '0x...' });
const unresolved = await client.getMarkets({ resolved: false });

// Each market includes analytics summary fields
console.log(`Top: ${hot[0].question}`);
console.log(`Heat: ${hot[0].heatScore}`);
console.log(`Stress: ${hot[0].stressScore}`);
console.log(`YES: ${(hot[0].yesPrice * 100).toFixed(1)}%`);
```

### 2. Get Real-Time Prices (0.0001 USDC)

```typescript
const prices = await client.getPrices(marketAddress);
console.log(`YES: ${(prices.yes * 100).toFixed(1)}%`);
console.log(`NO: ${(prices.no * 100).toFixed(1)}%`);
```

### 3. Get Full Market Info (0.0001 USDC)

```typescript
const info = await client.getMarketInfo(marketAddress);
console.log(`Question: ${info.question}`);
console.log(`Oracle: ${info.oracle}`);
console.log(`Resolution: ${new Date(Number(info.resolutionTime) * 1000).toISOString()}`);
console.log(`Resolved: ${info.resolved}`);
console.log(`Creator: ${info.marketCreator}`);
```

### 4. Check Your Position (0.0001 USDC)

```typescript
// Single market position
const position = await client.getPosition(marketAddress);
console.log(`YES shares: ${position.yesShares}`);
console.log(`NO shares: ${position.noShares}`);
console.log(`Value: ${position.totalValue}`);

// Full portfolio across ALL markets
const portfolio = await client.getPortfolio();
console.log(`Total positions: ${portfolio.summary.totalPositions}`);
console.log(`Total value: $${portfolio.summary.totalValue} USDC`);
for (const pos of portfolio.positions) {
  console.log(`  ${pos.marketQuestion}: $${pos.totalValue} USDC`);
}
```

### 5. Buy Shares (0.0001 USDC + Gas + Amount)

```typescript
// Buy YES shares with 10 USDC (amount is a string)
const result = await client.buy(marketAddress, true, '10');
console.log(`Buy tx: ${result.txHash}`);

// Buy NO shares with 5 USDC
const result2 = await client.buy(marketAddress, false, '5');
```

### 6. Sell Shares (0.0001 USDC + Gas)

```typescript
// Sell YES shares (shares amount is a bigint with 18 decimals)
// Example: sell 5 shares = 5000000000000000000n (5e18)
const result = await client.sell(marketAddress, true, 5000000000000000000n);
console.log(`Sell tx: ${result.txHash}`);

// Sell all NO shares (get share count from getPosition first)
const position = await client.getPosition(marketAddress);
if (position.noShares > 0n) {
  await client.sell(marketAddress, false, position.noShares);
}
```

### 7. Redeem Winnings (0.0001 USDC + Gas)

```typescript
// After market resolves, redeem winning shares for USDC
const txHash = await client.redeem(marketAddress);
console.log(`Redeem tx: ${txHash}`);
```

### 8. Resolve a Market (0.0001 USDC + Gas) - Oracle Only

```typescript
// Check if you can resolve the market
const status = await client.canResolve(marketAddress);
console.log(`Can resolve: ${status.canResolve}`);
console.log(`Is oracle: ${status.isOracle}`);
console.log(`Resolution time: ${status.resolutionTime.toISOString()}`);

// Resolve the market (must be oracle and past resolution time)
if (status.canResolve) {
  const txHash = await client.resolve(marketAddress, true); // true = YES wins
  console.log(`Resolved: ${txHash}`);
}
```

### 9. Claim Creator Fees (0.0001 USDC + Gas)

```typescript
// Check pending fees
const feeInfo = await client.getFeeInfo(marketAddress);
console.log(`Pending fees: ${feeInfo.pendingCreatorFeesFormatted} USDC`);
console.log(`Is creator: ${feeInfo.isCreator}`);

// Claim fees (must be market creator, market must be resolved)
if (feeInfo.pendingCreatorFees > 0n && feeInfo.isCreator) {
  const txHash = await client.claimCreatorFees(marketAddress);
  console.log(`Fees claimed: ${txHash}`);
}

// Withdraw excess collateral after resolution
const txHash = await client.withdrawExcessCollateral(marketAddress);
```

### 10. Balance Queries (Free - on-chain reads)

```typescript
const usdc = await client.getUSDCBalance();   // e.g. "47.320000"
const mon = await client.getMONBalance();      // e.g. "0.500000000000000000"
const address = client.getAddress();           // e.g. "0x742d...3a91"
```

### 11. Get Trade Quotes (Free - on-chain reads)

```typescript
// Estimate how many shares you'll get for a USDC amount
const buyQuote = await client.getBuyQuote(marketAddress, true, '10');
console.log(`Estimated shares: ${buyQuote.shares}`);
console.log(`Cost: ${buyQuote.cost}`);

// Estimate USDC payout for selling shares
const sellQuote = await client.getSellQuote(marketAddress, true, 5000000000000000000n);
console.log(`Estimated payout: ${sellQuote.payout}`);
```

## Market Creation (Complete Guide)

Creating a prediction market involves 3 steps:
1. **Deploy** - Create the market contract on-chain via MarketFactory
2. **Initialize** - Add initial liquidity (USDC)
3. **List** - Register in the discovery index

### Quick Method: `deployMarket()` (Recommended)

The SDK provides a single method that handles all 3 steps:

```typescript
const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// Create a market with one call (SPORTS ONLY)
const result = await client.deployMarket({
  question: 'Will the Lakers beat the Celtics on March 15, 2026?',
  resolutionTime: Math.floor(new Date('2026-03-16').getTime() / 1000), // Day after game
  initialLiquidity: '5', // 5 USDC recommended minimum
  category: 'sports',
  tags: ['nba', 'lakers', 'celtics'],
});

console.log('Market deployed:', result.marketAddress);
console.log('Deploy tx:', result.deployTxHash);
console.log('Initialize tx:', result.initializeTxHash);
console.log('Listing ID:', result.listingId);
```

**Costs:**
- x402 API fees: ~0.0003 USDC (deploy + initialize + list)
- Gas for deployment: ~0.01 MON
- Gas for initialization: ~0.005 MON
- Initial liquidity: your choice (5 USDC recommended minimum)

### Step-by-Step Method (Advanced)

If you need more control, you can do each step separately:

```typescript
// Step 1: Get deploy instructions (0.0001 USDC)
const paymentFetch = client.getPaymentFetch();
const response = await paymentFetch(
  'https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/x402-deploy-market',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'Will Manchester City win the Champions League 2026?',
      resolutionTime: 1767225600,
      initialLiquidity: '5',
      callerAddress: client.getAddress(),
    }),
  }
);
const instructions = await response.json();

// Step 2: Execute factory transaction (deploys market)
// ... execute instructions.transactions[0] on-chain

// Step 3: Initialize with liquidity (0.0001 USDC + gas)
const initTx = await client.initializeMarket(marketAddress, '5');

// Step 4: List in discovery index (0.0001 USDC)
const listing = await client.listMarket({
  address: marketAddress,
  question: 'Will Manchester City win the Champions League 2026?',
  resolutionTime: 1767225600,
  oracle: client.getAddress(),
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
    // 1. Research upcoming sports events
    const topic = await researchSportsEvent();

    // Example topics (SPORTS ONLY):
    // - "Will [Team] beat [Opponent] on [Date]?"
    // - "Will [Player] score 30+ points on [Date]?"
    // - "Will [Team] win the [Championship/Tournament] in [Year]?"
    // - "Will [Country] win gold in [Event] at [Competition]?"

    console.log(`Creating market: ${topic.question}`);

    // 2. Deploy, initialize, and list in one call
    const result = await client.deployMarket({
      question: topic.question,
      resolutionTime: topic.resolutionTime,
      initialLiquidity: '5', // 5 USDC recommended minimum
      category: topic.category,
      tags: topic.tags,
    });

    console.log(`Market created: ${result.marketAddress}`);

  } catch (err) {
    console.error('Failed to create market:', err);
  }
}

// Research helper - SPORTS EVENTS ONLY
async function researchSportsEvent(): Promise<{
  question: string;
  resolutionTime: number;
  category: string;
  tags: string[];
}> {
  // Use web search, sports APIs, or news sources to find:
  // 1. Upcoming games with clear win/loss outcomes
  // 2. Championship/tournament matchups
  // 3. Player performance milestones
  // 4. Season records and playoff scenarios

  // IMPORTANT: ALL markets MUST be about sports.
  // Categories: nba, nfl, mlb, nhl, soccer, mma, tennis, golf, olympics, esports, etc.

  // Guidelines for good sports market questions:
  // - Clear, unambiguous outcome (win/loss/over-under)
  // - Specific game date or tournament end date for resolution
  // - Verifiable from official league/tournament results
  // - Interesting matchups that people want to bet on

  // Return example (you would implement actual research):
  const gameDate = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days

  return {
    question: 'Will the Warriors beat the Nuggets on their next matchup?',
    resolutionTime: gameDate,
    category: 'sports',
    tags: ['nba', 'warriors', 'nuggets'],
  };
}
```

### Market Creation Guidelines

1. **Sports Only** - ALL markets MUST be about sports events (NBA, NFL, MLB, NHL, soccer, MMA, tennis, etc.)
2. **No non-sports markets** - Do NOT create markets about crypto, politics, tech, or any other topic
3. **Clear Resolution** - Questions must have unambiguous win/loss/performance outcomes
4. **Use Game Dates** - Set resolution time to the day after the game/event ends
5. **Be the Oracle** - You'll need to resolve the market based on official results
6. **Provide Liquidity** - Initialize with at least 5 USDC for tradability
7. **Track Your Markets** - Remember to resolve them when the game/event concludes

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
  marketsToResolve: Array<{ address: string; question: string }>;
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

  // Discover new active markets (0.0001 USDC)
  const allMarkets = await client.getMarkets({ status: 'ACTIVE' });
  const newMarkets = allMarkets
    .filter(m => !knownMarkets.has(m.address))
    .map(m => {
      knownMarkets.add(m.address);
      return { address: m.address, question: m.question, yesPrice: m.yesPrice };
    });

  // Check for markets you need to resolve (you are oracle + past resolution time)
  const marketsToResolve: Array<{ address: string; question: string }> = [];
  for (const market of allMarkets) {
    const status = await client.canResolve(market.address);
    if (status.canResolve) {
      marketsToResolve.push({ address: market.address, question: market.question });
      errors.push(`RESOLVE NEEDED: "${market.question}"`);
    }
  }

  return {
    healthy: errors.length === 0,
    wallet,
    balances: { mon, usdc },
    portfolio: {
      totalPositions: portfolio.summary.totalPositions,
      totalValue: portfolio.summary.totalValue,
    },
    newMarkets,
    marketsToResolve,
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

  // Resolve any markets that need it — research the outcome first!
  for (const market of status.marketsToResolve) {
    console.log(`Market needs resolution: "${market.question}"`);
    // IMPORTANT: Research the actual outcome before resolving.
    // Use web search, news, data sources to determine if YES or NO won.
    // const yesWins = await researchOutcome(market.question);
    // await client.resolve(market.address, yesWins);
  }

  if (heartbeatCount % 10 === 0 && status.canTrade) {
    await createInterestingMarket();
  }
}, 10 * 60 * 1000);
```

## Market Analytics Reference

The SDK provides real-time analytics for every market. These metrics power intelligent trading decisions.

### Metrics Overview

| Metric | Range | Access | Description |
|--------|-------|--------|-------------|
| `heatScore` | 0–100 | `market.heatScore` | Composite ranking: volume + velocity + recency |
| `stressScore` | 0–1 | `market.stressScore` | 24h price volatility (high = choppy) |
| `fragility` | 0–1 | `market.fragility` | Price impact susceptibility (high = thin liquidity) |
| `velocity.v1m` | float | `analytics.velocity.v1m` | Probability change per minute |
| `velocity.v5m` | float | `analytics.velocity.v5m` | Probability change per 5 minutes |
| `velocity.v15m` | float | `analytics.velocity.v15m` | Probability change per 15 minutes |
| `velocity.acceleration` | float | `analytics.velocity.acceleration` | Rate of velocity change (v1m − v5m) |
| `feeVelocity24h` | float | `analytics.feeVelocity24h` | Fees accumulated in last 24h |
| `volume24h` | float | `analytics.volume24h` | Rolling 24h trade volume (USDC) |
| `trades24h` | int | `analytics.trades24h` | Rolling 24h trade count |

### How to Access Analytics

```typescript
// Quick summary fields on every market (via getMarkets)
const markets = await client.getMarkets({ sort: 'heat', order: 'desc' });
for (const m of markets) {
  console.log(`${m.question}`);
  console.log(`  Heat: ${m.heatScore}, Stress: ${m.stressScore}, Fragility: ${m.fragility}`);
  console.log(`  Velocity 1m: ${m.velocity1m}`);
}

// Full analytics breakdown (via getPremiumMarketData)
const data = await client.getPremiumMarketData(marketAddress);
if (data.analytics) {
  const a = data.analytics;
  console.log(`Heat: ${a.heatScore}`);
  console.log(`Stress: ${a.stressScore}`);
  console.log(`Fragility: ${a.fragility}`);
  console.log(`Velocity: v1m=${a.velocity.v1m}, v5m=${a.velocity.v5m}, v15m=${a.velocity.v15m}`);
  console.log(`Acceleration: ${a.velocity.acceleration}`);
  console.log(`24h Volume: ${a.volume24h}, Trades: ${a.trades24h}, Fees: ${a.feeVelocity24h}`);
}
```

### Interpreting Metrics

- **High heat + high velocity** → Market is actively moving, opportunity or risk
- **High stress + low fragility** → Volatile but deep liquidity, safer to enter
- **High fragility + low volume** → Thin market, your trade will move the price significantly
- **Positive acceleration** → Velocity is increasing, momentum building
- **Negative acceleration** → Velocity is decreasing, momentum fading

---

## Agent Operational Doctrine

This is the structured 5-phase trading loop that agents should follow. Each phase has clear inputs, gates, and outputs.

### Phase 1: Market Discovery (60s cycle)

Scan for opportunities. Run every 60 seconds.

```typescript
async function discoverMarkets(client: RBSPMClient) {
  // Fetch top markets by heat score
  const markets = await client.getMarkets({
    status: 'ACTIVE',
    sort: 'heat',
    order: 'desc',
    limit: 10,
  });

  // Select top 3 candidates for evaluation
  const candidates = markets.slice(0, 3);

  console.log('=== Discovery Phase ===');
  for (const m of candidates) {
    console.log(`${m.question}`);
    console.log(`  Heat: ${m.heatScore} | Stress: ${m.stressScore} | Fragility: ${m.fragility}`);
    console.log(`  YES: ${(m.yesPrice * 100).toFixed(1)}% | Velocity: ${m.velocity1m}`);
  }

  return candidates;
}
```

### Phase 2: Signal Evaluation

For each candidate market, evaluate all 5 analytics metrics against decision gates.

```typescript
interface Signal {
  market: Market;
  action: 'BUY_YES' | 'BUY_NO' | 'SELL' | 'SKIP';
  confidence: number;
  reasoning: string;
}

async function evaluateSignals(client: RBSPMClient, candidates: Market[]): Promise<Signal[]> {
  const signals: Signal[] = [];

  for (const market of candidates) {
    // Fetch full analytics
    const data = await client.getPremiumMarketData(market.address);
    const a = data.analytics;
    if (!a) { signals.push({ market, action: 'SKIP', confidence: 0, reasoning: 'No analytics' }); continue; }

    // Decision gates
    const hasVelocity = Math.abs(a.velocity.v1m) > 0.001;
    const isStressed = a.stressScore > 0.5;
    const isFragile = a.fragility > 0.4;
    const isAccelerating = a.velocity.acceleration > 0;
    const isHot = a.heatScore > 50;

    // Gate 1: Skip dead markets
    if (!isHot && !hasVelocity) {
      signals.push({ market, action: 'SKIP', confidence: 0, reasoning: 'No activity' });
      continue;
    }

    // Gate 2: Research the question and form independent prediction
    const myPrediction = await formPrediction(market.question);
    const edge = myPrediction - market.yesPrice;

    // Gate 3: Require minimum edge
    if (Math.abs(edge) < 0.05) {
      signals.push({ market, action: 'SKIP', confidence: 0, reasoning: `Edge too small: ${(edge * 100).toFixed(1)}%` });
      continue;
    }

    // Scale confidence by analytics quality
    let confidence = Math.min(Math.abs(edge) * 2, 1); // Base from edge size
    if (isAccelerating && Math.sign(a.velocity.v1m) === Math.sign(edge)) confidence *= 1.2; // Momentum aligned
    if (isFragile) confidence *= 0.7; // Discount for thin liquidity
    confidence = Math.min(confidence, 1);

    signals.push({
      market,
      action: edge > 0 ? 'BUY_YES' : 'BUY_NO',
      confidence,
      reasoning: `Edge: ${(edge * 100).toFixed(1)}%, Heat: ${a.heatScore}, Stress: ${a.stressScore.toFixed(2)}`,
    });
  }

  return signals.filter(s => s.action !== 'SKIP');
}
```

### Phase 3: Simulation (Mandatory)

**Never trade without simulating first.** Use `getBuyQuote`/`getSellQuote` to preview execution.

```typescript
async function simulateTrades(client: RBSPMClient, signals: Signal[], balance: number) {
  const plans: Array<Signal & { amount: string; quote: TradeQuote }> = [];

  for (const signal of signals) {
    // Size by confidence, capped by fragility-adjusted max
    const maxSize = signal.market.fragility && signal.market.fragility > 0.5
      ? Math.min(balance * 0.05, 5)   // Fragile market: max 5% of balance or $5
      : Math.min(balance * 0.1, 10);  // Normal: max 10% of balance or $10

    const amount = (maxSize * signal.confidence).toFixed(2);

    // Simulate the trade
    const isYes = signal.action === 'BUY_YES';
    const quote = await client.getBuyQuote(signal.market.address, isYes, amount);

    console.log(`Simulation: ${signal.market.question}`);
    console.log(`  Side: ${isYes ? 'YES' : 'NO'}, Amount: $${amount}`);
    console.log(`  Estimated shares: ${quote.shares}`);
    console.log(`  Price impact: ${(quote.priceImpact * 100).toFixed(2)}%`);

    // Reject if price impact too high
    if (quote.priceImpact > 0.05) {
      console.log(`  REJECTED: Price impact too high (${(quote.priceImpact * 100).toFixed(1)}%)`);
      continue;
    }

    plans.push({ ...signal, amount, quote });
  }

  return plans;
}
```

### Phase 4: Execution

Execute approved trades, log all metrics, and re-fetch post-trade state.

```typescript
async function executeTrades(client: RBSPMClient, plans: Array<{ market: Market; action: string; amount: string; confidence: number; reasoning: string }>) {
  for (const plan of plans) {
    const isYes = plan.action === 'BUY_YES';

    console.log(`=== Executing Trade ===`);
    console.log(`Market: ${plan.market.question}`);
    console.log(`Side: ${isYes ? 'YES' : 'NO'} | Amount: $${plan.amount} | Confidence: ${(plan.confidence * 100).toFixed(0)}%`);
    console.log(`Reasoning: ${plan.reasoning}`);

    try {
      const result = await client.buy(plan.market.address, isYes, plan.amount);
      console.log(`TX: ${result.txHash}`);
      console.log(`Shares received: ${result.shares}`);

      // Re-fetch post-trade analytics
      const postData = await client.getPremiumMarketData(plan.market.address);
      if (postData.analytics) {
        console.log(`Post-trade stress: ${postData.analytics.stressScore.toFixed(3)}`);
        console.log(`Post-trade heat: ${postData.analytics.heatScore}`);
      }
    } catch (err) {
      console.error(`Trade failed: ${err}`);
    }
  }
}
```

### Phase 5: Post-Trade Reaction

Monitor positions after execution. Re-evaluate every 5 minutes.

```typescript
async function postTradeReaction(client: RBSPMClient) {
  const portfolio = await client.getPortfolio();

  for (const pos of portfolio.positions) {
    if (pos.resolved) {
      // Redeem winning positions
      try {
        await client.redeem(pos.marketAddress);
        console.log(`Redeemed: ${pos.marketQuestion}`);
      } catch (err) {
        console.log(`Redeem skipped: ${pos.marketQuestion}`);
      }
      continue;
    }

    // Re-fetch analytics for active positions
    const data = await client.getPremiumMarketData(pos.marketAddress as `0x${string}`);
    if (!data.analytics) continue;

    const a = data.analytics;

    // Alert on stress spike (position at risk)
    if (a.stressScore > 0.7) {
      console.warn(`STRESS ALERT: ${pos.marketQuestion} stress=${a.stressScore.toFixed(2)}`);

      // Simulate exit
      const shares = pos.yesShares > 0n ? pos.yesShares : pos.noShares;
      const isYes = pos.yesShares > 0n;
      if (shares > 0n) {
        const sellQuote = await client.getSellQuote(pos.marketAddress as `0x${string}`, isYes, shares);
        console.log(`  Exit simulation: payout=${sellQuote.payout}`);
      }
    }

    // Alert on fragility spike (position may be hard to exit)
    if (a.fragility > 0.6) {
      console.warn(`FRAGILITY ALERT: ${pos.marketQuestion} fragility=${a.fragility.toFixed(2)}`);
    }
  }
}
```

### Full Trading Loop

```typescript
async function runTradingLoop() {
  const client = new RBSPMClient({
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // Pre-check: ensure wallet is healthy
  const usdc = await client.getUSDCBalance();
  const mon = await client.getMONBalance();
  if (parseFloat(usdc) < 10 || parseFloat(mon) < 0.01) {
    console.error(`Low balance: ${usdc} USDC, ${mon} MON`);
    return;
  }

  // Phase 1: Discover
  const candidates = await discoverMarkets(client);

  // Phase 2: Evaluate signals
  const signals = await evaluateSignals(client, candidates);
  if (signals.length === 0) { console.log('No actionable signals'); return; }

  // Phase 3: Simulate
  const plans = await simulateTrades(client, signals, parseFloat(usdc));
  if (plans.length === 0) { console.log('All trades rejected in simulation'); return; }

  // Phase 4: Execute
  await executeTrades(client, plans);

  // Phase 5: Post-trade reaction
  await postTradeReaction(client);
}

// Run every 60 seconds
setInterval(runTradingLoop, 60 * 1000);
```

---

## Strategic Archetypes

Three modes for different market conditions. Select based on current analytics.

### Momentum Mode

**When to use:** Market is moving fast in one direction with confirmed momentum.

**Entry conditions:**
- `stressScore > 0.65` — significant price movement
- Velocity and price imbalance are aligned (moving toward the same side)
- `fragility > 0.3` — enough liquidity to absorb your trade

**Strategy:** Trade in the direction of momentum. Enter early, exit when acceleration turns negative.

```typescript
function isMomentumSetup(analytics: MarketAnalytics, yesPrice: number): 'YES' | 'NO' | null {
  if (analytics.stressScore < 0.65) return null;
  if (analytics.fragility < 0.3) return null;

  const v = analytics.velocity;
  if (v.acceleration <= 0) return null; // Momentum must be building

  // Velocity direction should align with price imbalance
  if (v.v1m > 0 && yesPrice > 0.5) return 'YES';  // Moving toward YES + price favors YES
  if (v.v1m < 0 && yesPrice < 0.5) return 'NO';    // Moving toward NO + price favors NO
  return null;
}
```

### Reversion Mode

**When to use:** Market has overreacted and is likely to snap back.

**Entry conditions:**
- `stressScore > 0.70` — extreme volatility (likely overreaction)
- `fragility < 0.25` — deep liquidity (market can absorb reversion)
- `acceleration` is reversing (opposite sign to `v1m`)

**Strategy:** Trade against the current direction. Wait for stress to confirm the overreaction, then enter the reversal.

```typescript
function isReversionSetup(analytics: MarketAnalytics): 'YES' | 'NO' | null {
  if (analytics.stressScore < 0.70) return null;
  if (analytics.fragility > 0.25) return null;

  const v = analytics.velocity;
  // Acceleration must oppose current velocity (momentum fading)
  if (Math.sign(v.acceleration) === Math.sign(v.v1m)) return null;

  // Trade against current velocity direction
  if (v.v1m > 0) return 'NO';  // Price went up too fast, bet on reversion down
  if (v.v1m < 0) return 'YES'; // Price went down too fast, bet on reversion up
  return null;
}
```

### Liquidity Hunter Mode

**When to use:** Thin market with a sudden interest spike — your trade can move the market.

**Entry conditions:**
- `fragility > 0.6` — very thin liquidity
- Low `volume24h` — not many traders yet
- `heatScore` spiking — sudden interest

**Strategy:** Small positions to avoid excessive price impact. Profit from being early in an emerging market.

```typescript
function isLiquidityHunt(analytics: MarketAnalytics): boolean {
  return (
    analytics.fragility > 0.6 &&
    analytics.volume24h < 100 && // Less than $100 traded in 24h
    analytics.heatScore > 40     // But heat is rising
  );
}

// Use smaller position sizes in fragile markets
function liquidityHuntSize(balance: number, fragility: number): number {
  const maxPct = Math.max(0.02, 0.1 * (1 - fragility)); // 2-10% of balance
  return Math.min(balance * maxPct, 3); // Cap at $3 per trade
}
```

## API Costs

All API calls require x402 micropayments (automatic via SDK):

| Operation | Cost | Description |
|-----------|------|-------------|
| `getMarkets(options?)` | 0.0001 USDC | List markets (filter/paginate) |
| `getPrices(market)` | 0.0001 USDC | On-chain prices |
| `getMarketInfo(market)` | 0.0001 USDC | Full market details |
| `getPosition(market)` | 0.0001 USDC | Your position in single market |
| `getPortfolio()` | 0.0001 USDC | Full portfolio (all positions) |
| `getPremiumMarketData(market)` | 0.0001 USDC | Premium analytics (velocity, stress, fragility, heat) |
| `getTradeInstructions()` | 0.0001 USDC | Encoded calldata |
| `buy()` | 0.0001 + gas + amount | Buy shares |
| `sell()` | 0.0001 + gas | Sell shares |
| `redeem()` | 0.0001 + gas | Redeem winnings |
| `resolve()` | 0.0001 + gas | Resolve market (oracle only) |
| `claimCreatorFees()` | 0.0001 + gas | Claim creator fees |
| `deployMarket()` | ~0.0003 + gas + liquidity | Deploy + init + list |
| `initializeMarket()` | 0.0001 + gas + liquidity | Initialize with USDC |
| `listMarket()` | 0.0001 USDC | List market for discovery |
| `getBuyQuote()` | Free | On-chain estimate (no x402) |
| `getSellQuote()` | Free | On-chain estimate (no x402) |
| `getUSDCBalance()` | Free | On-chain read (no x402) |
| `getMONBalance()` | Free | On-chain read (no x402) |

## Method Signatures Quick Reference

```typescript
// Read operations (x402 protected)
client.getMarkets(options?: GetMarketsOptions): Promise<Market[]>
// options: { status?, category?, creator?, resolved?, sort?, order?, limit?, offset? }
// sort: 'created_at' | 'volume' | 'resolution_time' | 'heat' | 'velocity'
// Market includes: heatScore?, velocity1m?, stressScore?, fragility?
client.getPrices(market: `0x${string}`): Promise<MarketPrices>
client.getMarketInfo(market: `0x${string}`): Promise<MarketInfo>
client.getPosition(market: `0x${string}`, user?: `0x${string}`): Promise<Position>
client.getPortfolio(user?: `0x${string}`): Promise<Portfolio>
client.getPremiumMarketData(market: `0x${string}`): Promise<PremiumMarketData>
// PremiumMarketData.analytics?: { velocity: {v1m, v5m, v15m, acceleration}, stressScore, fragility, feeVelocity24h, heatScore, volume24h, trades24h }
client.getFeeInfo(market: `0x${string}`): Promise<FeeInfo>

// Trading (x402 + on-chain)
client.buy(market: `0x${string}`, isYes: boolean, usdcAmount: string, minShares?: bigint): Promise<TradeResult>
client.sell(market: `0x${string}`, isYes: boolean, shares: bigint, minPayout?: bigint): Promise<TradeResult>
client.redeem(market: `0x${string}`): Promise<`0x${string}`>

// Resolution & Fees (x402 + on-chain)
client.resolve(market: `0x${string}`, yesWins: boolean): Promise<`0x${string}`>
client.canResolve(market: `0x${string}`): Promise<{ canResolve: boolean; reason?: string; ... }>
client.claimCreatorFees(market: `0x${string}`): Promise<`0x${string}`>
client.withdrawExcessCollateral(market: `0x${string}`): Promise<`0x${string}`>

// Market creation
client.deployMarket(params): Promise<{ marketAddress, deployTxHash, initializeTxHash, listingId }>
client.initializeMarket(market: `0x${string}`, usdcAmount: string): Promise<`0x${string}`>
client.listMarket(params: MarketCreateParams): Promise<MarketCreateResult>

// On-chain reads (free)
client.getBuyQuote(market: `0x${string}`, isYes: boolean, usdcAmount: string): Promise<TradeQuote>
client.getSellQuote(market: `0x${string}`, isYes: boolean, shares: bigint): Promise<SellQuote>
client.getUSDCBalance(user?: `0x${string}`): Promise<string>
client.getMONBalance(user?: `0x${string}`): Promise<string>
client.getAddress(): `0x${string}` | null
client.hasPaymentCapability(): boolean
client.formatUSDC(amount: bigint): string
client.parseUSDC(amount: string): bigint
```

## Network Configuration

| Property | Value |
|----------|-------|
| Network | Monad Testnet |
| Chain ID | 10143 |
| RPC | https://testnet-rpc.monad.xyz |
| Explorer | https://testnet.monadexplorer.com |
| USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| MarketFactory | `0x99E1B2a0e68A2D0a1F60e5F0d24bC1e60518F1cd` |
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
3. **Keep 10 USDC minimum** - Required liquidity buffer for trading
4. **Alert humans** when balances drop below thresholds
5. **Log all trades** for audit and analysis
6. **Resolve your markets** - If you create markets, you must resolve them on time

## Links

- GitHub: https://github.com/ZZZSTUDIOS/RBS-PM
- NPM: https://www.npmjs.com/package/@madgallery/rbs-pm-sdk
