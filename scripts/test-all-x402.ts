/**
 * Test all x402 endpoints and report total fees paid
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/test-all-x402.ts
 */
import { RBSPMClient } from '../packages/rbs-pm-sdk/dist/index.js';

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

const FEE = 0.0001; // USDC per x402 call

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
  x402Calls: number; // how many x402 calls this test made
}

async function main() {
  const client = new RBSPMClient({ privateKey: PRIVATE_KEY });
  const wallet = client.getAddress();
  const startUsdc = await client.getUSDCBalance();
  const startMon = await client.getMONBalance();

  console.log(`Wallet: ${wallet}`);
  console.log(`Starting USDC: ${startUsdc}`);
  console.log(`Starting MON:  ${startMon}`);
  console.log('');

  const results: TestResult[] = [];

  const DELAY_MS = 2000; // Short delay between calls — SDK handles retry/backoff internally

  async function test(name: string, x402Calls: number, fn: () => Promise<string>) {
    if (x402Calls > 0) await new Promise(r => setTimeout(r, DELAY_MS));
    const t0 = Date.now();
    try {
      const detail = await fn();
      const ms = Date.now() - t0;
      results.push({ name, status: 'PASS', detail: `${detail} (${ms}ms)`, x402Calls });
      console.log(`  [OK] ${name} — ${detail} (${ms}ms)`);
    } catch (err: unknown) {
      const ms = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name, status: 'FAIL', detail: msg.slice(0, 150), x402Calls: 0 });
      console.log(`  [XX] ${name} — ${msg.slice(0, 150)} (${ms}ms)`);
    }
  }

  // ============================================================
  // FREE: On-chain reads (no x402)
  // ============================================================
  console.log('=== FREE: On-chain reads ===');

  await test('getUSDCBalance()', 0, async () => {
    const bal = await client.getUSDCBalance();
    return `${bal} USDC`;
  });

  await test('getMONBalance()', 0, async () => {
    const bal = await client.getMONBalance();
    return `${bal} MON`;
  });

  // ============================================================
  // x402-markets: various sort/filter combos
  // ============================================================
  console.log('\n=== x402-markets (0.0001 USDC each) ===');

  let activeMarket: `0x${string}` | null = null;

  await test('getMarkets() default', 1, async () => {
    const m = await client.getMarkets();
    if (m.length > 0) activeMarket = m[0].address;
    return `${m.length} markets`;
  });

  await test('getMarkets({ sort: "heat", limit: 3 })', 1, async () => {
    const m = await client.getMarkets({ sort: 'heat', order: 'desc', limit: 3 });
    if (m.length > 0 && !activeMarket) activeMarket = m[0].address;
    return `${m.length} markets, top heat: ${m[0]?.heatScore ?? 'N/A'}`;
  });

  await test('getMarkets({ sort: "velocity" })', 1, async () => {
    const m = await client.getMarkets({ sort: 'velocity', order: 'desc', limit: 3 });
    return `${m.length} markets, top v1m: ${m[0]?.velocity1m ?? 'N/A'}`;
  });

  await test('getMarkets({ sort: "volume" })', 1, async () => {
    const m = await client.getMarkets({ sort: 'volume', order: 'desc', limit: 3 });
    return `${m.length} markets`;
  });

  await test('getMarkets({ status: "ACTIVE" })', 1, async () => {
    const m = await client.getMarkets({ status: 'ACTIVE' });
    if (m.length > 0 && !activeMarket) activeMarket = m[0].address;
    return `${m.length} active markets`;
  });

  await test('getMarkets({ resolved: false, limit: 2, offset: 1 })', 1, async () => {
    const m = await client.getMarkets({ resolved: false, limit: 2, offset: 1 });
    return `${m.length} markets (page 2)`;
  });

  if (!activeMarket) {
    console.error('\nNo active market found — cannot continue');
    process.exit(1);
  }
  console.log(`\nUsing market: ${activeMarket}`);

  // ============================================================
  // x402-prices
  // ============================================================
  console.log('\n=== x402-prices (0.0001 USDC) ===');

  await test('getPrices(market)', 1, async () => {
    const p = await client.getPrices(activeMarket!);
    return `YES: ${(p.yes * 100).toFixed(1)}%, NO: ${(p.no * 100).toFixed(1)}%`;
  });

  // ============================================================
  // x402-market-info
  // ============================================================
  console.log('\n=== x402-market-info (0.0001 USDC) ===');

  await test('getMarketInfo(market)', 1, async () => {
    const info = await client.getMarketInfo(activeMarket!);
    return `"${(info.question || '').slice(0, 50)}" resolved=${info.resolved}`;
  });

  // ============================================================
  // x402-market-data (premium analytics)
  // ============================================================
  console.log('\n=== x402-market-data (0.0001 USDC) ===');

  await test('getPremiumMarketData(market)', 1, async () => {
    const d = await client.getPremiumMarketData(activeMarket!);
    const a = d.analytics;
    if (!a) return 'No analytics available';
    return `heat=${a.heatScore} stress=${a.stressScore?.toFixed(2)} frag=${a.fragility?.toFixed(2)} v1m=${a.velocity?.v1m}`;
  });

  // ============================================================
  // x402-position
  // ============================================================
  console.log('\n=== x402-position (0.0001 USDC) ===');

  await test('getPosition(market)', 1, async () => {
    const pos = await client.getPosition(activeMarket!);
    return `YES: ${pos.yesShares.toString()}, NO: ${pos.noShares.toString()}`;
  });

  // ============================================================
  // x402-portfolio
  // ============================================================
  console.log('\n=== x402-portfolio (0.0001 USDC) ===');

  await test('getPortfolio()', 1, async () => {
    const p = await client.getPortfolio();
    return `${p.summary.totalPositions} positions, $${p.summary.totalValue} USDC`;
  });

  // ============================================================
  // FREE: getBuyQuote / getSellQuote (on-chain reads)
  // ============================================================
  console.log('\n=== FREE: Quote reads ===');

  await test('getBuyQuote(market, YES, "1")', 0, async () => {
    const q = await client.getBuyQuote(activeMarket!, true, '1');
    return `shares=${q.shares.toString()}, avgPrice=${q.averagePrice.toFixed(4)}`;
  });

  await test('getBuyQuote(market, NO, "0.5")', 0, async () => {
    const q = await client.getBuyQuote(activeMarket!, false, '0.5');
    return `shares=${q.shares.toString()}`;
  });

  await test('getSellQuote(market, YES, 1e18)', 0, async () => {
    const q = await client.getSellQuote(activeMarket!, true, 1000000000000000000n);
    return `payout=${q.payout.toString()}`;
  });

  // ============================================================
  // x402-agent-trade: buy + sell
  // ============================================================
  console.log('\n=== x402-agent-trade (0.0001 USDC + gas each) ===');

  await test('buy(market, YES, "0.1")', 1, async () => {
    const r = await client.buy(activeMarket!, true, '0.1');
    return `tx=${r.txHash.slice(0, 18)}... shares=${r.shares.toString()}`;
  });

  // Sell what we just bought
  await test('sell(market, YES, shares)', 1, async () => {
    // Need position to know how many shares (costs 0.0001)
    const pos = await client.getPosition(activeMarket!);
    if (pos.yesShares === 0n) return 'SKIP: no YES shares';
    const r = await client.sell(activeMarket!, true, pos.yesShares);
    return `tx=${r.txHash.slice(0, 18)}... payout=${r.cost.toString()}`;
  });

  // ============================================================
  // x402-claim-fees (getFeeInfo)
  // ============================================================
  console.log('\n=== x402-claim-fees (0.0001 USDC) ===');

  await test('getFeeInfo(market)', 1, async () => {
    const f = await client.getFeeInfo(activeMarket!);
    return `pending=${f.pendingCreatorFeesFormatted} USDC, isCreator=${f.isCreator}`;
  });

  // ============================================================
  // x402-resolve (canResolve — calls getMarketInfo internally)
  // ============================================================
  console.log('\n=== canResolve (0.0001 USDC via getMarketInfo) ===');

  await test('canResolve(market)', 1, async () => {
    const s = await client.canResolve(activeMarket!);
    return `canResolve=${s.canResolve}, isOracle=${s.isOracle}, reason=${s.reason || 'none'}`;
  });

  // ============================================================
  // x402-redeem (expected to fail — market not resolved)
  // ============================================================
  console.log('\n=== x402-redeem (0.0001 USDC) ===');

  await test('redeem(market) — expect rejection', 1, async () => {
    try {
      await client.redeem(activeMarket!);
      return 'Redeemed (unexpected)';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('revert') || msg.includes('not resolved') || msg.includes('reverted')) {
        return `Correctly rejected: ${msg.slice(0, 80)}`;
      }
      throw err; // Unexpected error
    }
  });

  // ============================================================
  // 402-only checks (don't pay — just verify challenge)
  // ============================================================
  console.log('\n=== 402 challenge checks (FREE — no payment) ===');

  for (const ep of ['x402-deploy-market', 'x402-initialize', 'x402-create-market']) {
    await test(`${ep} (402 check)`, 0, async () => {
      const resp = await fetch(`https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return resp.status === 402 ? '402 returned correctly' : `Status: ${resp.status} (expected 402)`;
    });
  }

  // ============================================================
  // Summary
  // ============================================================
  const endUsdc = await client.getUSDCBalance();
  const endMon = await client.getMONBalance();
  const totalX402Calls = results.filter(r => r.status === 'PASS').reduce((sum, r) => sum + r.x402Calls, 0);
  const totalFees = totalX402Calls * FEE;
  const actualSpent = parseFloat(startUsdc) - parseFloat(endUsdc);
  const gasSpent = parseFloat(startMon) - parseFloat(endMon);

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Tests:        ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log(`  x402 calls:   ${totalX402Calls} (expected fee: ${totalFees.toFixed(4)} USDC)`);
  console.log(`  USDC spent:   ${actualSpent.toFixed(6)} USDC (start: ${startUsdc}, end: ${endUsdc})`);
  console.log(`  Gas spent:    ${gasSpent.toFixed(6)} MON (start: ${parseFloat(startMon).toFixed(6)}, end: ${parseFloat(endMon).toFixed(6)})`);
  console.log('='.repeat(80));

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  [XX] ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
