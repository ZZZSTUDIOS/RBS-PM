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

### 1. Scan All Markets — ONE Call (0.0001 USDC)

`getMarkets()` returns **all active markets with prices and analytics** in a single call. This is your primary scan — don't call individual price/info endpoints per market.

```typescript
// ONE call = all prices, analytics, and market data you need
const markets = await client.getMarkets({ status: 'ACTIVE' });

for (const m of markets) {
  console.log(`${m.question}`);
  console.log(`  YES: ${(m.yesPrice * 100).toFixed(1)}% | NO: ${(m.noPrice * 100).toFixed(1)}%`);
  console.log(`  Heat: ${m.heatScore} | Stress: ${m.stressScore} | Fragility: ${m.fragility}`);
  console.log(`  Resolution: ${m.resolutionTime.toISOString()}`);
}

// Sort/filter options (still just 1 call each):
// { sort: 'heat' | 'volume' | 'velocity' | 'created_at' | 'resolution_time' }
// { status: 'ACTIVE' | 'RESOLVED', order: 'asc' | 'desc', limit, offset }
```

### 2. Check Portfolio (0.0001 USDC)

```typescript
const portfolio = await client.getPortfolio();
console.log(`Positions: ${portfolio.summary.totalPositions}`);
console.log(`Value: $${portfolio.summary.totalValue} USDC`);
for (const pos of portfolio.positions) {
  console.log(`  ${pos.marketQuestion}: $${pos.totalValue} USDC`);
}
```

### 3. Get Trade Quotes (Free)

```typescript
// Always simulate before trading — these are free on-chain reads
const buyQuote = await client.getBuyQuote(marketAddress, true, '10');
console.log(`Shares: ${buyQuote.shares}, Avg price: ${buyQuote.averagePrice}`);

const sellQuote = await client.getSellQuote(marketAddress, true, shares);
console.log(`Payout: ${sellQuote.payout}`);
```

### 4. Buy Shares (0.0001 USDC + Gas + Amount)

```typescript
const result = await client.buy(marketAddress, true, '10'); // YES, 10 USDC
console.log(`TX: ${result.txHash}, Shares: ${result.shares}`);
```

### 5. Sell Shares (0.0001 USDC + Gas)

```typescript
// Shares is a bigint with 18 decimals (e.g. 5 shares = 5000000000000000000n)
const result = await client.sell(marketAddress, true, shares);
console.log(`TX: ${result.txHash}, Payout: ${result.cost}`);
```

### 6. Redeem Winnings (0.0001 USDC + Gas)

```typescript
await client.redeem(marketAddress); // After market resolves
```

### 7. Resolve a Market (0.0001 USDC + Gas) — Oracle Only

```typescript
// Check resolution time from getMarkets() data first (free — already fetched)
// Only call canResolve() when you know it's past resolution time
const status = await client.canResolve(marketAddress);
if (status.canResolve) {
  await client.resolve(marketAddress, true); // true = YES wins
}
```

### 8. Balance Queries (Free)

```typescript
const usdc = await client.getUSDCBalance();  // "47.320000"
const mon = await client.getMONBalance();     // "0.500000000000000000"
const address = client.getAddress();          // "0x742d...3a91"
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

## Agent Trading Loop

**Cost-efficient pattern: 2 API calls per scan cycle (0.0002 USDC)**

Each x402 call takes ~8 seconds. Minimize calls to keep scans fast.

```typescript
async function tradingLoop(client: RBSPMClient) {
  // === SCAN (2 x402 calls, ~16s) ===
  const usdc = await client.getUSDCBalance();  // Free
  const mon = await client.getMONBalance();     // Free
  if (parseFloat(usdc) < 5 || parseFloat(mon) < 0.01) return; // Low balance, skip

  // Call 1: All markets with prices + analytics (0.0001 USDC)
  const markets = await client.getMarkets({ status: 'ACTIVE' });

  // Call 2: Your positions with live values (0.0001 USDC)
  const portfolio = await client.getPortfolio();

  // === EVALUATE (no API calls — use data already fetched) ===

  // Check for markets needing resolution (use resolutionTime from getMarkets, no extra API call)
  const now = new Date();
  const needsResolve = markets.filter(m =>
    m.resolutionTime < now && !m.resolved && m.oracle.toLowerCase() === client.getAddress()!.toLowerCase()
  );
  for (const m of needsResolve) {
    // Research outcome, then resolve (0.0001 USDC + gas per market)
    // await client.resolve(m.address, yesWins);
  }

  // Redeem any resolved positions
  for (const pos of portfolio.positions) {
    if (pos.resolved) {
      try { await client.redeem(pos.marketAddress as `0x${string}`); } catch {}
    }
  }

  // Find trading opportunities using analytics from getMarkets() response
  for (const m of markets) {
    const edge = estimateEdge(m); // Your research/prediction logic
    if (Math.abs(edge) < 0.05) continue; // Skip if no edge

    // Simulate (FREE — on-chain reads)
    const isYes = edge > 0;
    const amount = Math.min(parseFloat(usdc) * 0.1, 5).toFixed(2);
    const quote = await client.getBuyQuote(m.address, isYes, amount);

    // Execute only when you have real edge (0.0001 USDC + gas + amount)
    await client.buy(m.address, isYes, amount);
  }
}

// Run every 60 seconds
setInterval(() => tradingLoop(client), 60_000);
```

**Per-cycle cost:** 0.0002 USDC (scan) + 0.0001 per trade. NOT 0.002+ from calling individual endpoints.

## Analytics Reference

All analytics are included in `getMarkets()` response — no extra API calls needed.

| Metric | Range | What it means |
|--------|-------|---------------|
| `heatScore` | 0–100 | Composite ranking (volume + velocity + recency) |
| `stressScore` | 0–1 | 24h price volatility |
| `fragility` | 0–1 | Price impact susceptibility (high = thin liquidity) |
| `velocity1m` | float | Probability change per minute |

For full velocity breakdown (v5m, v15m, acceleration), use `getPremiumMarketData()` (0.0001 USDC per market — only call this for specific markets you're about to trade).

### Signal Interpretation

- **High heat + velocity** → Market moving, opportunity or risk
- **High stress + low fragility** → Volatile but deep liquidity, safer to enter
- **High fragility** → Your trade will move price significantly, use small sizes
- **Research > analytics** → Analytics tell you WHEN to look, research tells you WHAT to bet

## API Costs

Each x402 call costs 0.0001 USDC and takes ~8 seconds. **Minimize calls.**

| Use this | Cost | What you get |
|----------|------|-------------|
| **`getMarkets()`** | 0.0001 | **All markets + prices + analytics.** Your primary scan. |
| **`getPortfolio()`** | 0.0001 | **All your positions + live values.** |
| **`getBuyQuote()` / `getSellQuote()`** | Free | Simulate trades before executing. |
| **`buy()` / `sell()`** | 0.0001 + gas | Execute a trade. |

**Only call these when you have a specific reason:**

| Method | Cost | When to use |
|--------|------|-------------|
| `getPremiumMarketData()` | 0.0001 | Full velocity breakdown (v5m, v15m, acceleration) for a market you're about to trade |
| `getPrices()` | 0.0001 | Live blockchain price for a single market (getMarkets has cached prices) |
| `getMarketInfo()` | 0.0001 | Full on-chain market details |
| `canResolve()` | 0.0001 | Check if resolution is possible (use getMarkets resolutionTime first!) |
| `resolve()` | 0.0001 + gas | Resolve a market (oracle only) |
| `redeem()` | 0.0001 + gas | Redeem winning shares |
| `getFeeInfo()` | 0.0001 | Check pending creator fees |
| `claimCreatorFees()` | 0.0001 + gas | Claim creator fees |
| `deployMarket()` | ~0.0003 + gas + liquidity | Create a new market |

**DO NOT** loop through markets calling individual endpoints. One `getMarkets()` gives you everything.

## Method Signatures

```typescript
// PRIMARY SCAN (use these every cycle)
client.getMarkets(options?): Promise<Market[]>
  // options: { status?, sort?, order?, limit?, offset?, category?, creator?, resolved? }
  // sort: 'heat' | 'volume' | 'velocity' | 'created_at' | 'resolution_time'
  // Market: { address, question, yesPrice, noPrice, heatScore, stressScore, fragility, velocity1m, resolutionTime, ... }
client.getPortfolio(user?): Promise<Portfolio>
  // Portfolio: { positions: [{ marketAddress, yesShares, noShares, totalValue, ... }], summary }

// FREE (on-chain reads, no x402)
client.getBuyQuote(market, isYes, usdcAmount): Promise<TradeQuote>
client.getSellQuote(market, isYes, shares): Promise<{ payout, priceImpact }>
client.getUSDCBalance(user?): Promise<string>
client.getMONBalance(user?): Promise<string>
client.getAddress(): `0x${string}` | null

// TRADING (0.0001 USDC + gas each)
client.buy(market, isYes, usdcAmount, minShares?): Promise<TradeResult>
client.sell(market, isYes, shares, minPayout?): Promise<TradeResult>
client.redeem(market): Promise<`0x${string}`>
client.resolve(market, yesWins): Promise<`0x${string}`>
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
