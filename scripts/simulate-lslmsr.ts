/**
 * LS-LMSR Trade Simulation
 *
 * Replicates the exact Solidity math from LSLMSR_ERC20.sol to show
 * how prices, slippage, and liquidity move as trades happen.
 *
 * Usage:  npx tsx scripts/simulate-lslmsr.ts
 */

const SCALE = BigInt(1e18);

// ── Contract math (exact replica) ───────────────────────────────

function _exp(x: bigint): bigint {
  if (x > 6n * SCALE) x = 6n * SCALE;
  let result = SCALE;
  let term = SCALE;
  for (let i = 1n; i <= 12n; i++) {
    term = (term * x) / (i * SCALE);
    result += term;
    if (term < 1n) break;
  }
  return result;
}

function _ln(x: bigint): bigint {
  if (x < SCALE) return 0n;
  if (x === SCALE) return 0n;
  const LN2 = 693147180559945309n;
  let halvings = 0n;
  while (x >= 2n * SCALE) {
    x = x / 2n;
    halvings++;
  }
  const y = x - SCALE;
  if (y === 0n) return halvings * LN2;
  let result = 0n;
  let term = y;
  let positive = true;
  for (let i = 1n; i <= 30n; i++) {
    if (positive) {
      result += term / i;
    } else {
      if (term / i > result) break;
      result -= term / i;
    }
    term = (term * y) / SCALE;
    positive = !positive;
    if (term < 1000000n) break;
  }
  return result + halvings * LN2;
}

// ── Market state ────────────────────────────────────────────────

interface MarketState {
  yesShares: bigint;
  noShares: bigint;
  alpha: bigint;
  minLiquidity: bigint;
}

function liquidityParameter(s: MarketState): bigint {
  const total = s.yesShares + s.noShares;
  const dynamicB = (s.alpha * total) / SCALE;
  return dynamicB > s.minLiquidity ? dynamicB : s.minLiquidity;
}

function costFunction(yesShares: bigint, noShares: bigint, s: MarketState): bigint {
  const total = yesShares + noShares;
  let b = (s.alpha * total) / SCALE;
  if (b < s.minLiquidity) b = s.minLiquidity;

  // Log-sum-exp trick: keeps exp arguments bounded
  // C = max(yes,no) + b * ln(exp(-(max-yes)/b) + exp(-(max-no)/b))
  const maxShares = yesShares > noShares ? yesShares : noShares;
  let expYes: bigint;
  let expNo: bigint;

  if (yesShares >= noShares) {
    expYes = SCALE; // exp(0)
    const gap = ((yesShares - noShares) * SCALE) / b;
    if (gap === 0n) {
      expNo = SCALE;
    } else {
      const expGap = _exp(gap);
      expNo = (SCALE * SCALE) / expGap; // 1/exp(gap)
    }
  } else {
    expNo = SCALE; // exp(0)
    const gap = ((noShares - yesShares) * SCALE) / b;
    if (gap === 0n) {
      expYes = SCALE;
    } else {
      const expGap = _exp(gap);
      expYes = (SCALE * SCALE) / expGap; // 1/exp(gap)
    }
  }

  const sum = expYes + expNo;
  const lnSum = _ln(sum);
  return maxShares + (b * lnSum) / SCALE;
}

function getCost(isYes: boolean, shares: bigint, s: MarketState): bigint {
  const newYes = isYes ? s.yesShares + shares : s.yesShares;
  const newNo = isYes ? s.noShares : s.noShares + shares;
  const newCost = costFunction(newYes, newNo, s);
  const currentCost = costFunction(s.yesShares, s.noShares, s);
  return newCost > currentCost ? newCost - currentCost : 0n;
}

function softmaxYes(s: MarketState): bigint {
  const b = liquidityParameter(s);
  if (s.yesShares >= s.noShares) {
    const diff = ((s.yesShares - s.noShares) * SCALE) / b;
    const expDiff = _exp(diff);
    return (expDiff * SCALE) / (expDiff + SCALE);
  } else {
    const diff = ((s.noShares - s.yesShares) * SCALE) / b;
    const expDiff = _exp(diff);
    return (SCALE * SCALE) / (SCALE + expDiff);
  }
}

// Entropy term α·H(s) from Theorem 4.3 of Othman et al.
// H(s) = L - s_max * diff, where L = softplus(diff)
function entropyTerm(s: MarketState): bigint {
  const b = liquidityParameter(s);
  const LN2 = 693147180559945309n;
  let gap: bigint;
  if (s.yesShares >= s.noShares) {
    gap = s.yesShares - s.noShares;
  } else {
    gap = s.noShares - s.yesShares;
  }
  if (gap === 0n) {
    return (s.alpha * LN2) / SCALE;
  }
  const diff = (gap * SCALE) / b;
  const expDiff = _exp(diff);
  const sMax = (expDiff * SCALE) / (expDiff + SCALE);
  const L = _ln(expDiff + SCALE);
  const sMaxTimesDiff = (sMax * diff) / SCALE;
  const entropy = L > sMaxTimesDiff ? L - sMaxTimesDiff : 0n;
  return (s.alpha * entropy) / SCALE;
}

// LS-LMSR price: p_i = s_i + α·H(s) (Theorem 4.3)
function getYesPrice(s: MarketState): bigint {
  return softmaxYes(s) + entropyTerm(s);
}

function getNoPrice(s: MarketState): bigint {
  return (SCALE - softmaxYes(s)) + entropyTerm(s);
}

// Binary search for shares (matches _calculateSharesForPayment)
function calculateSharesForPayment(isYes: boolean, paymentInShareScale: bigint, s: MarketState): bigint {
  if (paymentInShareScale === 0n) return 0n;
  let low = 0n;
  let high = paymentInShareScale * 2n;
  for (let i = 0; i < 64; i++) {
    const mid = (low + high) / 2n;
    const cost = getCost(isYes, mid, s);
    if (cost <= paymentInShareScale) {
      low = mid;
    } else {
      high = mid;
    }
    if (high - low <= 1n) break;
  }
  return low;
}

// Execute a buy and mutate state (matches contract buy() logic)
function executeBuy(isYes: boolean, usdcAmount: number, s: MarketState): {
  shares: number;
  costUsdc: number;
  refundUsdc: number;
} {
  const SHARE_SCALE = BigInt(1e12); // 10^(18-6) for USDC
  const collateralRaw = BigInt(Math.round(usdcAmount * 1e6)); // USDC 6 decimals
  const fee = (collateralRaw * 50n) / 10000n; // 0.5%
  const paymentAfterFee = collateralRaw - fee;
  const paymentInShareScale = paymentAfterFee * SHARE_SCALE;

  const shares = calculateSharesForPayment(isYes, paymentInShareScale, s);
  const actualCostInShareScale = getCost(isYes, shares, s);
  const actualCostCollateral = actualCostInShareScale / SHARE_SCALE;

  // Update state
  if (isYes) {
    s.yesShares += shares;
  } else {
    s.noShares += shares;
  }

  const refund = paymentAfterFee > actualCostCollateral ? paymentAfterFee - actualCostCollateral : 0n;

  return {
    shares: Number(shares) / 1e18,
    costUsdc: Number(actualCostCollateral) / 1e6,
    refundUsdc: Number(refund) / 1e6,
  };
}

// ── Formatting helpers ──────────────────────────────────────────

function fmt(n: number, dec = 4): string {
  return n.toFixed(dec);
}

function pct(price: bigint): string {
  return ((Number(price) / 1e18) * 100).toFixed(2) + '%';
}

function printState(label: string, s: MarketState) {
  const b = liquidityParameter(s);
  console.log(`\n  ${label}`);
  console.log(`  YES shares: ${fmt(Number(s.yesShares) / 1e18, 2)}  |  NO shares: ${fmt(Number(s.noShares) / 1e18, 2)}`);
  console.log(`  YES price:  ${pct(getYesPrice(s))}      |  NO price:  ${pct(getNoPrice(s))}`);
  console.log(`  b (liquidity): ${fmt(Number(b) / 1e18, 2)}`);
}

function divider() {
  console.log('─'.repeat(90));
}

// ── Simulations ─────────────────────────────────────────────────

function makeMarket(alpha = 0.03, minLiq = 1, initShares = 100): MarketState {
  return {
    yesShares: BigInt(Math.round(initShares * 1e18)),
    noShares: BigInt(Math.round(initShares * 1e18)),
    alpha: BigInt(Math.round(alpha * 1e18)),
    minLiquidity: BigInt(Math.round(minLiq * 1e18)),
  };
}

// ─────────────────────────────────────────────────────────────────
// TABLE 1: Single BUY YES at various amounts (fresh market each time)
// ─────────────────────────────────────────────────────────────────
function table1() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  TABLE 1: Price Impact of a Single BUY YES Trade (alpha=0.03, minLiq=1, init=100) ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const amounts = [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
  const header = 'USDC Bet'.padStart(10) + '  │'
    + ' Shares'.padStart(10) + '  │'
    + ' Avg Price'.padStart(10) + '  │'
    + ' Spot Before'.padStart(12) + '  │'
    + ' Spot After'.padStart(12) + '  │'
    + ' Impact'.padStart(8) + '  │'
    + ' b After'.padStart(10);

  divider();
  console.log(header);
  divider();

  for (const amt of amounts) {
    const s = makeMarket();
    const spotBefore = Number(getYesPrice(s)) / 1e18;
    const result = executeBuy(true, amt, s);
    const spotAfter = Number(getYesPrice(s)) / 1e18;
    const avgPrice = result.costUsdc / result.shares;
    const impact = ((avgPrice - spotBefore) / spotBefore) * 100;
    const b = Number(liquidityParameter(s)) / 1e18;

    console.log(
      `${('$' + fmt(amt, 2)).padStart(10)}  │` +
      `${fmt(result.shares, 4).padStart(10)}  │` +
      `${('$' + fmt(avgPrice, 4)).padStart(10)}  │` +
      `${pct(BigInt(Math.round(spotBefore * 1e18))).padStart(12)}  │` +
      `${pct(BigInt(Math.round(spotAfter * 1e18))).padStart(12)}  │` +
      `${fmt(impact, 2).padStart(7)}%  │` +
      `${fmt(b, 2).padStart(10)}`
    );
  }
  divider();
  console.log('  * Each row is a fresh 50/50 market. Impact = (avgPrice - spotPrice) / spotPrice');
}

// ─────────────────────────────────────────────────────────────────
// TABLE 2: Sequential buys on same market (cumulative effect)
// ─────────────────────────────────────────────────────────────────
function table2() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  TABLE 2: Sequential $10 BUY YES Trades on Same Market (price drift)          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const s = makeMarket();
  const header = '  Trade #'.padStart(9) + '  │'
    + ' Shares'.padStart(10) + '  │'
    + ' Avg Price'.padStart(10) + '  │'
    + ' YES Price'.padStart(10) + '  │'
    + ' NO Price'.padStart(10) + '  │'
    + ' Impact'.padStart(8) + '  │'
    + ' Total YES'.padStart(10) + '  │'
    + ' b'.padStart(8);

  divider();
  console.log(header);
  divider();

  for (let i = 1; i <= 15; i++) {
    const spotBefore = Number(getYesPrice(s)) / 1e18;
    const result = executeBuy(true, 10, s);
    const spotAfter = Number(getYesPrice(s)) / 1e18;
    const avgPrice = result.costUsdc / result.shares;
    const impact = ((avgPrice - spotBefore) / spotBefore) * 100;
    const b = Number(liquidityParameter(s)) / 1e18;
    const totalYes = Number(s.yesShares) / 1e18;

    console.log(
      `${('#' + i).padStart(9)}  │` +
      `${fmt(result.shares, 4).padStart(10)}  │` +
      `${('$' + fmt(avgPrice, 4)).padStart(10)}  │` +
      `${pct(BigInt(Math.round(spotAfter * 1e18))).padStart(10)}  │` +
      `${pct(getNoPrice(s)).padStart(10)}  │` +
      `${fmt(impact, 2).padStart(7)}%  │` +
      `${fmt(totalYes, 2).padStart(10)}  │` +
      `${fmt(b, 2).padStart(8)}`
    );
  }
  divider();
}

// ─────────────────────────────────────────────────────────────────
// TABLE 3: Compare different alpha values
// ─────────────────────────────────────────────────────────────────
function table3() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  TABLE 3: Alpha Comparison — $50 BUY YES on fresh 50/50 markets               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const alphas = [0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.5];
  const header = '  Alpha'.padStart(8) + '  │'
    + ' b value'.padStart(10) + '  │'
    + ' Shares'.padStart(10) + '  │'
    + ' Avg Price'.padStart(10) + '  │'
    + ' Spot After'.padStart(12) + '  │'
    + ' Impact'.padStart(8) + '  │'
    + ' Interpretation'.padStart(20);

  divider();
  console.log(header);
  divider();

  for (const a of alphas) {
    const s = makeMarket(a, 1, 100);
    const spotBefore = Number(getYesPrice(s)) / 1e18;
    const result = executeBuy(true, 50, s);
    const spotAfter = Number(getYesPrice(s)) / 1e18;
    const avgPrice = result.costUsdc / result.shares;
    const impact = ((avgPrice - spotBefore) / spotBefore) * 100;
    const b = Number(liquidityParameter(s)) / 1e18;
    const interp = impact < 1 ? 'Very deep' : impact < 5 ? 'Deep' : impact < 15 ? 'Medium' : impact < 30 ? 'Shallow' : 'Very shallow';

    console.log(
      `${fmt(a, 3).padStart(8)}  │` +
      `${fmt(b, 2).padStart(10)}  │` +
      `${fmt(result.shares, 4).padStart(10)}  │` +
      `${('$' + fmt(avgPrice, 4)).padStart(10)}  │` +
      `${pct(BigInt(Math.round(spotAfter * 1e18))).padStart(12)}  │` +
      `${fmt(impact, 2).padStart(7)}%  │` +
      `${interp.padStart(20)}`
    );
  }
  divider();
  console.log('  * Lower alpha = deeper liquidity = less slippage. b = alpha * totalShares');
}

// ─────────────────────────────────────────────────────────────────
// TABLE 4: Both sides — BUY YES then BUY NO
// ─────────────────────────────────────────────────────────────────
function table4() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  TABLE 4: Mixed Trades — Alternating BUY YES / BUY NO ($10 each)              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const s = makeMarket();
  const header = '  Trade'.padStart(12) + '  │'
    + ' Shares'.padStart(10) + '  │'
    + ' Avg Price'.padStart(10) + '  │'
    + ' YES Price'.padStart(10) + '  │'
    + ' NO Price'.padStart(10) + '  │'
    + ' Impact'.padStart(8) + '  │'
    + ' b'.padStart(8);

  divider();
  console.log(header);
  divider();

  const trades: Array<{ label: string; isYes: boolean; amount: number }> = [
    { label: 'BUY YES $10', isYes: true, amount: 10 },
    { label: 'BUY YES $10', isYes: true, amount: 10 },
    { label: 'BUY YES $25', isYes: true, amount: 25 },
    { label: 'BUY NO  $10', isYes: false, amount: 10 },
    { label: 'BUY NO  $10', isYes: false, amount: 10 },
    { label: 'BUY NO  $50', isYes: false, amount: 50 },
    { label: 'BUY YES $100', isYes: true, amount: 100 },
    { label: 'BUY NO  $100', isYes: false, amount: 100 },
  ];

  for (const t of trades) {
    const price = t.isYes ? getYesPrice(s) : getNoPrice(s);
    const spotBefore = Number(price) / 1e18;
    const result = executeBuy(t.isYes, t.amount, s);
    const avgPrice = result.costUsdc / result.shares;
    const impact = ((avgPrice - spotBefore) / spotBefore) * 100;
    const b = Number(liquidityParameter(s)) / 1e18;

    console.log(
      `${t.label.padStart(12)}  │` +
      `${fmt(result.shares, 4).padStart(10)}  │` +
      `${('$' + fmt(avgPrice, 4)).padStart(10)}  │` +
      `${pct(getYesPrice(s)).padStart(10)}  │` +
      `${pct(getNoPrice(s)).padStart(10)}  │` +
      `${fmt(impact, 2).padStart(7)}%  │` +
      `${fmt(b, 2).padStart(8)}`
    );
  }
  divider();
}

// ─────────────────────────────────────────────────────────────────
// TABLE 5: minLiquidity effect
// ─────────────────────────────────────────────────────────────────
function table5() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  TABLE 5: minLiquidity Effect — $50 BUY YES (alpha=0.03, init=100)            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const minLiqs = [1, 5, 10, 50, 100, 500, 1000];
  const header = '  minLiq'.padStart(10) + '  │'
    + ' b used'.padStart(10) + '  │'
    + ' b source'.padStart(12) + '  │'
    + ' Shares'.padStart(10) + '  │'
    + ' Avg Price'.padStart(10) + '  │'
    + ' Spot After'.padStart(12) + '  │'
    + ' Impact'.padStart(8);

  divider();
  console.log(header);
  divider();

  for (const ml of minLiqs) {
    const s = makeMarket(0.03, ml, 100);
    const dynamicB = 0.03 * 200; // alpha * totalShares
    const spotBefore = Number(getYesPrice(s)) / 1e18;
    const result = executeBuy(true, 50, s);
    const spotAfter = Number(getYesPrice(s)) / 1e18;
    const avgPrice = result.costUsdc / result.shares;
    const impact = ((avgPrice - spotBefore) / spotBefore) * 100;
    const b = Number(liquidityParameter(s)) / 1e18;
    const bSource = ml > dynamicB ? 'minLiq' : 'dynamic';

    console.log(
      `${fmt(ml, 0).padStart(10)}  │` +
      `${fmt(b, 2).padStart(10)}  │` +
      `${bSource.padStart(12)}  │` +
      `${fmt(result.shares, 4).padStart(10)}  │` +
      `${('$' + fmt(avgPrice, 4)).padStart(10)}  │` +
      `${pct(BigInt(Math.round(spotAfter * 1e18))).padStart(12)}  │` +
      `${fmt(impact, 2).padStart(7)}%`
    );
  }
  divider();
  console.log('  * dynamic b = alpha * totalShares = 0.03 * 200 = 6.0');
  console.log('  * When minLiq > dynamic b, minLiquidity overrides → deeper pool → less slippage');
}

// ── Run all ─────────────────────────────────────────────────────

console.log('═'.repeat(90));
console.log('  LS-LMSR TRADE SIMULATION');
console.log('  Exact replica of LSLMSR_ERC20.sol math (alpha=0.03, USDC collateral)');
console.log('═'.repeat(90));

table1();
table2();
table3();
table4();
table5();

console.log('\n' + '═'.repeat(90));
console.log('  KEY TAKEAWAYS');
console.log('═'.repeat(90));
console.log(`
  1. Price impact DOES increase with larger bets (Table 1).
  2. Sequential same-side trades compound: each gets worse price (Table 2).
  3. alpha controls depth: lower alpha = deeper pool = less slippage (Table 3).
  4. b is dynamic: grows as totalShares grows, providing more liquidity (Table 2 b column).
  5. minLiquidity is a floor on b — if set high, it absorbs slippage (Table 5).
  6. With current params (alpha=0.03, minLiq=1, init=100):
     - $10 trade ≈ ${(() => {
       const s = makeMarket(); const sb = Number(getYesPrice(s)) / 1e18;
       const r = executeBuy(true, 10, s); const avg = r.costUsdc / r.shares;
       return fmt(((avg - sb) / sb) * 100, 2);
     })()}% impact
     - $100 trade ≈ ${(() => {
       const s = makeMarket(); const sb = Number(getYesPrice(s)) / 1e18;
       const r = executeBuy(true, 100, s); const avg = r.costUsdc / r.shares;
       return fmt(((avg - sb) / sb) * 100, 2);
     })()}% impact
     - $1000 trade ≈ ${(() => {
       const s = makeMarket(); const sb = Number(getYesPrice(s)) / 1e18;
       const r = executeBuy(true, 1000, s); const avg = r.costUsdc / r.shares;
       return fmt(((avg - sb) / sb) * 100, 2);
     })()}% impact
`);
