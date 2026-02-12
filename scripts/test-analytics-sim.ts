/**
 * Simulate market analytics computation with realistic data
 * Validates: velocity, stress, fragility, fee velocity, heat score
 *
 * Usage: npx tsx scripts/test-analytics-sim.ts
 */

// ============ Types ============

interface Snapshot {
  market_id: string;
  yes_price: number;
  snapshot_time: Date;
}

interface Trade {
  market_id: string;
  amount: number;
  creator_fee: number;
  created_at: Date;
}

interface MarketState {
  id: string;
  name: string;
  total_collateral: number;
  liquidity_parameter: number;
}

interface MarketAnalytics {
  velocity: { v1m: number; v5m: number; v15m: number; acceleration: number };
  stressScore: number;
  fragility: number;
  feeVelocity24h: number;
  heatScore: number;
  volume24h: number;
  trades24h: number;
}

// ============ Simulated Data Generators ============

function generateSnapshots(marketId: string, pattern: 'stable' | 'trending' | 'volatile' | 'spike' | 'dead'): Snapshot[] {
  const now = Date.now();
  const snapshots: Snapshot[] = [];
  const MINUTE = 60_000;

  // Generate 60 minutes of snapshots (1 per minute)
  for (let i = 60; i >= 0; i--) {
    let price: number;
    const t = i; // minutes ago

    switch (pattern) {
      case 'stable':
        // Barely moves: 0.50 ± 0.01
        price = 0.50 + Math.sin(t * 0.1) * 0.01;
        break;
      case 'trending':
        // Steady uptrend: 0.40 → 0.65 over 60 min
        price = 0.40 + (60 - t) * (0.25 / 60);
        break;
      case 'volatile':
        // Wild swings: 0.30 ↔ 0.70
        price = 0.50 + Math.sin(t * 0.5) * 0.20;
        break;
      case 'spike':
        // Sudden spike in last 5 minutes
        price = t > 5 ? 0.45 : 0.45 + (5 - t) * 0.06; // jumps to 0.75
        break;
      case 'dead':
        // No movement at all
        price = 0.50;
        break;
    }

    snapshots.push({
      market_id: marketId,
      yes_price: Math.max(0.01, Math.min(0.99, price)),
      snapshot_time: new Date(now - t * MINUTE),
    });
  }

  return snapshots;
}

function generateTrades(marketId: string, pattern: 'active' | 'moderate' | 'dead' | 'whale'): Trade[] {
  const now = Date.now();
  const trades: Trade[] = [];
  const HOUR = 3_600_000;

  switch (pattern) {
    case 'active':
      // 50 trades in last 24h, spread out, avg 0.5 USDC each
      for (let i = 0; i < 50; i++) {
        const amount = 0.3 + Math.random() * 0.7; // 0.3-1.0 USDC
        trades.push({
          market_id: marketId,
          amount,
          creator_fee: amount * 0.005, // 0.5% fee
          created_at: new Date(now - Math.random() * 24 * HOUR),
        });
      }
      break;
    case 'moderate':
      // 10 trades in last 24h
      for (let i = 0; i < 10; i++) {
        const amount = 0.2 + Math.random() * 0.5;
        trades.push({
          market_id: marketId,
          amount,
          creator_fee: amount * 0.005,
          created_at: new Date(now - Math.random() * 24 * HOUR),
        });
      }
      break;
    case 'dead':
      // 0 trades in last 24h (last trade was 3 days ago)
      trades.push({
        market_id: marketId,
        amount: 0.5,
        creator_fee: 0.0025,
        created_at: new Date(now - 72 * HOUR),
      });
      break;
    case 'whale':
      // 5 large trades in last 2 hours
      for (let i = 0; i < 5; i++) {
        const amount = 5 + Math.random() * 10; // 5-15 USDC
        trades.push({
          market_id: marketId,
          amount,
          creator_fee: amount * 0.005,
          created_at: new Date(now - Math.random() * 2 * HOUR),
        });
      }
      break;
  }

  return trades;
}

// ============ Analytics Computation (matches planned indexer logic) ============

function computeVelocity(snapshots: Snapshot[]): { v1m: number; v5m: number; v15m: number; acceleration: number } {
  if (snapshots.length < 2) return { v1m: 0, v5m: 0, v15m: 0, acceleration: 0 };

  // Sort descending (most recent first)
  const sorted = [...snapshots].sort((a, b) => b.snapshot_time.getTime() - a.snapshot_time.getTime());
  const now = sorted[0].snapshot_time.getTime();
  const currentPrice = sorted[0].yes_price;

  // Find closest snapshot to each window
  function findPriceAtMinutesAgo(minutes: number): number | null {
    const targetTime = now - minutes * 60_000;
    let closest: Snapshot | null = null;
    let closestDiff = Infinity;

    for (const s of sorted) {
      const diff = Math.abs(s.snapshot_time.getTime() - targetTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = s;
      }
    }

    // Only use if within 90 seconds of target
    if (closest && closestDiff < 90_000) return closest.yes_price;
    return null;
  }

  const p1m = findPriceAtMinutesAgo(1);
  const p5m = findPriceAtMinutesAgo(5);
  const p15m = findPriceAtMinutesAgo(15);

  // Raw velocity: V_w = P_t - P_{t-w}
  const v1m = p1m !== null ? currentPrice - p1m : 0;
  const v5m = p5m !== null ? currentPrice - p5m : 0;
  const v15m = p15m !== null ? currentPrice - p15m : 0;

  // Acceleration: A = V_1m - (V_5m / 5)
  const acceleration = v1m - (v5m / 5);

  return { v1m, v5m, v15m, acceleration };
}

function computeStress(snapshots: Snapshot[]): number {
  if (snapshots.length < 2) return 0;

  // Filter to last 24h
  const now = Math.max(...snapshots.map(s => s.snapshot_time.getTime()));
  const cutoff = now - 24 * 3_600_000;
  const recent = snapshots.filter(s => s.snapshot_time.getTime() > cutoff);

  if (recent.length < 2) return 0;

  const prices = recent.map(s => s.yes_price);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const priceRange = maxPrice - minPrice;

  // Normalize: 0.5 swing = max stress (1.0)
  return Math.min(priceRange / 0.5, 1.0);
}

function computeFragility(market: MarketState): number {
  if (!market.liquidity_parameter || market.liquidity_parameter <= 0) return 1.0;
  // Alpha (liquidity_parameter) directly controls price impact in LS-LMSR
  // alpha=10 → very deep (fragility ~0), alpha=0.5 → very thin (fragility ~0.95)
  const ALPHA_DEEP = 10; // reference: alpha >= 10 considered "deep"
  return Math.max(0, 1 - market.liquidity_parameter / ALPHA_DEEP);
}

function computeTradeMetrics(trades: Trade[]): { trades24h: number; volume24h: number; feeVelocity24h: number; lastTradeAt: Date | null } {
  const now = Date.now();
  const cutoff = now - 24 * 3_600_000;
  const recent = trades.filter(t => t.created_at.getTime() > cutoff);

  return {
    trades24h: recent.length,
    volume24h: recent.reduce((sum, t) => sum + t.amount, 0),
    feeVelocity24h: recent.reduce((sum, t) => sum + t.creator_fee, 0),
    lastTradeAt: recent.length > 0 ? new Date(Math.max(...recent.map(t => t.created_at.getTime()))) : null,
  };
}

function computeHeatScore(
  analytics: { trades24h: number; volume24h: number; stressScore: number; fragility: number; lastTradeAt: Date | null },
  maxTrades: number,
  maxVolume: number,
): number {
  const normTrades = maxTrades > 0 ? analytics.trades24h / maxTrades : 0;
  const normVolume = maxVolume > 0 ? analytics.volume24h / maxVolume : 0;

  // Recency: 1.0 if last trade was just now, 0 if 48h+ ago
  let recencyFactor = 0;
  if (analytics.lastTradeAt) {
    const hoursSinceLastTrade = (Date.now() - analytics.lastTradeAt.getTime()) / 3_600_000;
    recencyFactor = Math.max(0, 1 - hoursSinceLastTrade / 48);
  }

  const heat = (
    0.30 * normTrades +
    0.25 * normVolume +
    0.15 * analytics.stressScore +
    0.20 * recencyFactor +
    0.10 * (1 - analytics.fragility)
  ) * 100;

  return Math.round(heat * 100) / 100; // 2 decimal places
}

// ============ Run Simulation ============

console.log('='.repeat(80));
console.log('MARKET ANALYTICS SIMULATION');
console.log('='.repeat(80));

// Define 5 test markets with different behaviors
const scenarios: Array<{
  market: MarketState;
  pricePattern: 'stable' | 'trending' | 'volatile' | 'spike' | 'dead';
  tradePattern: 'active' | 'moderate' | 'dead' | 'whale';
  description: string;
}> = [
  {
    market: { id: 'M1', name: 'Hot Volatile Market', total_collateral: 50, liquidity_parameter: 2 },
    pricePattern: 'volatile',
    tradePattern: 'active',
    description: 'High activity + wild price swings → should rank #1 heat',
  },
  {
    market: { id: 'M2', name: 'Whale Spike Market', total_collateral: 10, liquidity_parameter: 1 },
    pricePattern: 'spike',
    tradePattern: 'whale',
    description: 'Sudden spike from whale trades → high velocity + stress',
  },
  {
    market: { id: 'M3', name: 'Steady Trending Market', total_collateral: 100, liquidity_parameter: 5 },
    pricePattern: 'trending',
    tradePattern: 'moderate',
    description: 'Gradual trend with moderate activity → medium heat',
  },
  {
    market: { id: 'M4', name: 'Stable Deep Market', total_collateral: 200, liquidity_parameter: 8 },
    pricePattern: 'stable',
    tradePattern: 'moderate',
    description: 'Deep liquidity, barely moves → low stress, low fragility',
  },
  {
    market: { id: 'M5', name: 'Dead Market', total_collateral: 5, liquidity_parameter: 0.5 },
    pricePattern: 'dead',
    tradePattern: 'dead',
    description: 'No activity → should rank last',
  },
];

// Generate data and compute analytics
const allResults: Array<MarketAnalytics & { name: string; description: string }> = [];

// First pass: compute raw metrics
const rawMetrics: Array<{
  name: string;
  description: string;
  velocity: { v1m: number; v5m: number; v15m: number; acceleration: number };
  stressScore: number;
  fragility: number;
  tradeMetrics: { trades24h: number; volume24h: number; feeVelocity24h: number; lastTradeAt: Date | null };
}> = [];

for (const scenario of scenarios) {
  const snapshots = generateSnapshots(scenario.market.id, scenario.pricePattern);
  const trades = generateTrades(scenario.market.id, scenario.tradePattern);

  const velocity = computeVelocity(snapshots);
  const stressScore = computeStress(snapshots);
  const fragility = computeFragility(scenario.market);
  const tradeMetrics = computeTradeMetrics(trades);

  rawMetrics.push({
    name: scenario.market.name,
    description: scenario.description,
    velocity,
    stressScore,
    fragility,
    tradeMetrics,
  });
}

// Second pass: compute heat with cross-market normalization
const maxTrades = Math.max(...rawMetrics.map(m => m.tradeMetrics.trades24h));
const maxVolume = Math.max(...rawMetrics.map(m => m.tradeMetrics.volume24h));

for (const raw of rawMetrics) {
  const heatScore = computeHeatScore(
    {
      trades24h: raw.tradeMetrics.trades24h,
      volume24h: raw.tradeMetrics.volume24h,
      stressScore: raw.stressScore,
      fragility: raw.fragility,
      lastTradeAt: raw.tradeMetrics.lastTradeAt,
    },
    maxTrades,
    maxVolume,
  );

  allResults.push({
    name: raw.name,
    description: raw.description,
    velocity: raw.velocity,
    stressScore: raw.stressScore,
    fragility: raw.fragility,
    feeVelocity24h: raw.tradeMetrics.feeVelocity24h,
    heatScore,
    volume24h: raw.tradeMetrics.volume24h,
    trades24h: raw.tradeMetrics.trades24h,
  });
}

// ============ Output Results ============

for (const result of allResults) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${result.name}`);
  console.log(`  ${result.description}`);
  console.log(`${'─'.repeat(60)}`);

  console.log(`  velocity:`);
  console.log(`    v1m:          ${result.velocity.v1m >= 0 ? '+' : ''}${result.velocity.v1m.toFixed(6)}`);
  console.log(`    v5m:          ${result.velocity.v5m >= 0 ? '+' : ''}${result.velocity.v5m.toFixed(6)}`);
  console.log(`    v15m:         ${result.velocity.v15m >= 0 ? '+' : ''}${result.velocity.v15m.toFixed(6)}`);
  console.log(`    acceleration: ${result.velocity.acceleration >= 0 ? '+' : ''}${result.velocity.acceleration.toFixed(6)}`);
  console.log(`  stressScore:    ${result.stressScore.toFixed(4)}  (0=calm, 1=extreme)`);
  console.log(`  fragility:      ${result.fragility.toFixed(4)}  (0=deep, 1=fragile)`);
  console.log(`  feeVelocity24h: ${result.feeVelocity24h.toFixed(6)} USDC`);
  console.log(`  volume24h:      ${result.volume24h.toFixed(4)} USDC`);
  console.log(`  trades24h:      ${result.trades24h}`);
  console.log(`  heatScore:      ${result.heatScore.toFixed(2)} / 100`);
}

// ============ Heat Ranking ============

console.log(`\n${'='.repeat(80)}`);
console.log('HEAT RANKING (sorted)');
console.log('='.repeat(80));

const sorted = [...allResults].sort((a, b) => b.heatScore - a.heatScore);
sorted.forEach((r, i) => {
  console.log(`  #${i + 1}  ${r.heatScore.toFixed(2).padStart(6)}  ${r.name.padEnd(25)}  stress=${r.stressScore.toFixed(2)} frag=${r.fragility.toFixed(2)} v1m=${r.velocity.v1m >= 0 ? '+' : ''}${r.velocity.v1m.toFixed(4)}`);
});

// ============ Sanity Checks ============

console.log(`\n${'='.repeat(80)}`);
console.log('SANITY CHECKS');
console.log('='.repeat(80));

const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

// Check 1: Hot volatile market should rank #1
const hotMarket = allResults.find(r => r.name === 'Hot Volatile Market')!;
const deadMarket = allResults.find(r => r.name === 'Dead Market')!;
checks.push({
  name: 'Hot market ranks above dead market',
  pass: hotMarket.heatScore > deadMarket.heatScore,
  detail: `hot=${hotMarket.heatScore.toFixed(2)} vs dead=${deadMarket.heatScore.toFixed(2)}`,
});

// Check 2: Dead market should have heat score near 0
checks.push({
  name: 'Dead market heat < 10',
  pass: deadMarket.heatScore < 10,
  detail: `heat=${deadMarket.heatScore.toFixed(2)}`,
});

// Check 3: Volatile market should have high stress
const volatileStress = allResults.find(r => r.name === 'Hot Volatile Market')!.stressScore;
checks.push({
  name: 'Volatile market stress > 0.5',
  pass: volatileStress > 0.5,
  detail: `stress=${volatileStress.toFixed(4)}`,
});

// Check 4: Stable market should have low stress
const stableStress = allResults.find(r => r.name === 'Stable Deep Market')!.stressScore;
checks.push({
  name: 'Stable market stress < 0.1',
  pass: stableStress < 0.1,
  detail: `stress=${stableStress.toFixed(4)}`,
});

// Check 5: Dead market stress should be 0
checks.push({
  name: 'Dead market stress = 0',
  pass: deadMarket.stressScore === 0,
  detail: `stress=${deadMarket.stressScore.toFixed(4)}`,
});

// Check 6: Deep liquidity market should have low fragility
const deepFragility = allResults.find(r => r.name === 'Stable Deep Market')!.fragility;
checks.push({
  name: 'Deep market fragility < 0.5',
  pass: deepFragility < 0.5,
  detail: `fragility=${deepFragility.toFixed(4)} (collateral=200, liq_param=8)`,
});

// Check 7: Low liquidity market should have high fragility
const shallowFragility = allResults.find(r => r.name === 'Dead Market')!.fragility;
checks.push({
  name: 'Shallow market fragility > 0.5',
  pass: shallowFragility > 0.5,
  detail: `fragility=${shallowFragility.toFixed(4)} (collateral=5, liq_param=0.5)`,
});

// Check 8: Spike market should have positive v1m (price rising)
const spikeVelocity = allResults.find(r => r.name === 'Whale Spike Market')!.velocity;
checks.push({
  name: 'Spike market v1m > 0 (price rising)',
  pass: spikeVelocity.v1m > 0,
  detail: `v1m=${spikeVelocity.v1m.toFixed(6)}`,
});

// Check 9: Trending market should have positive v15m
const trendVelocity = allResults.find(r => r.name === 'Steady Trending Market')!.velocity;
checks.push({
  name: 'Trending market v15m > 0',
  pass: trendVelocity.v15m > 0,
  detail: `v15m=${trendVelocity.v15m.toFixed(6)}`,
});

// Check 10: Stable market velocity near 0
const stableVelocity = allResults.find(r => r.name === 'Stable Deep Market')!.velocity;
checks.push({
  name: 'Stable market |v1m| < 0.01',
  pass: Math.abs(stableVelocity.v1m) < 0.01,
  detail: `v1m=${stableVelocity.v1m.toFixed(6)}`,
});

// Check 11: Spike acceleration should be positive (move strengthening)
checks.push({
  name: 'Spike market acceleration > 0 (strengthening)',
  pass: spikeVelocity.acceleration > 0,
  detail: `accel=${spikeVelocity.acceleration.toFixed(6)}`,
});

// Check 12: Whale trades should have high fee velocity
const whaleFees = allResults.find(r => r.name === 'Whale Spike Market')!.feeVelocity24h;
const deadFees = deadMarket.feeVelocity24h;
checks.push({
  name: 'Whale fees >> dead fees',
  pass: whaleFees > deadFees * 10,
  detail: `whale=${whaleFees.toFixed(6)} vs dead=${deadFees.toFixed(6)}`,
});

// Check 13: All heat scores between 0 and 100
const allInRange = allResults.every(r => r.heatScore >= 0 && r.heatScore <= 100);
checks.push({
  name: 'All heat scores in [0, 100]',
  pass: allInRange,
  detail: allResults.map(r => r.heatScore.toFixed(1)).join(', '),
});

// Check 14: All stress scores between 0 and 1
const stressInRange = allResults.every(r => r.stressScore >= 0 && r.stressScore <= 1);
checks.push({
  name: 'All stress scores in [0, 1]',
  pass: stressInRange,
  detail: allResults.map(r => r.stressScore.toFixed(2)).join(', '),
});

// Check 15: All fragility scores between 0 and 1
const fragInRange = allResults.every(r => r.fragility >= 0 && r.fragility <= 1);
checks.push({
  name: 'All fragility scores in [0, 1]',
  pass: fragInRange,
  detail: allResults.map(r => r.fragility.toFixed(2)).join(', '),
});

// Print check results
let passed = 0;
let failed = 0;
for (const check of checks) {
  const icon = check.pass ? 'OK' : 'XX';
  console.log(`  [${icon}] ${check.name.padEnd(45)} ${check.detail}`);
  if (check.pass) passed++;
  else failed++;
}

console.log(`\n  ${passed} passed, ${failed} failed out of ${checks.length} checks`);

if (failed > 0) {
  console.log('\n  FAILURES detected — review formulas before implementing');
  process.exit(1);
} else {
  console.log('\n  All checks passed — formulas validated');
}
