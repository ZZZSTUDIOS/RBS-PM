// End-to-end SDK test
// Tests all major SDK operations against live Monad testnet
// Run with: npx tsx test-e2e.ts

import { RBSPMClient } from './src/index';

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY environment variable');
  process.exit(1);
}

// Known market for testing
const TEST_MARKET = '0x3f9498ef0a9cc5a88678d4d4a900ec16875a1f9f' as `0x${string}`;

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  note?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<string | void>) {
  process.stdout.write(`  ${name}...`);
  const start = Date.now();
  try {
    const note = await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration, note: note || undefined });
    console.log(` PASS (${duration}ms)${note ? ` - ${note}` : ''}`);
  } catch (err) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, duration, note: msg });
    console.log(` FAIL (${duration}ms) - ${msg}`);
  }
}

async function main() {
  console.log('=== RBS PM SDK End-to-End Test ===\n');

  // 1. Initialize client
  const client = new RBSPMClient({ privateKey: PRIVATE_KEY });

  const address = client.getAddress();
  console.log(`Wallet: ${address}`);
  console.log(`x402 Enabled: ${client.hasPaymentCapability()}`);
  console.log(`Test Market: ${TEST_MARKET}\n`);

  // ---- Free operations (on-chain reads) ----
  console.log('--- Free Operations (on-chain reads) ---');

  let usdcBalance = '0';
  let monBalance = '0';

  await test('getUSDCBalance', async () => {
    usdcBalance = await client.getUSDCBalance();
    return `${usdcBalance} USDC`;
  });

  await test('getMONBalance', async () => {
    monBalance = await client.getMONBalance();
    return `${monBalance} MON`;
  });

  await test('getAddress', async () => {
    const addr = client.getAddress();
    if (!addr) throw new Error('No address returned');
    return addr;
  });

  await test('hasPaymentCapability', async () => {
    const has = client.hasPaymentCapability();
    if (!has) throw new Error('No payment capability');
    return `${has}`;
  });

  // Check we have enough to proceed
  if (parseFloat(usdcBalance) < 0.01) {
    console.error(`\nInsufficient USDC balance (${usdcBalance}). Need at least 0.01 USDC.`);
    process.exit(1);
  }

  // ---- x402 Read Operations (0.0001 USDC each) ----
  console.log('\n--- x402 Read Operations (0.0001 USDC each) ---');

  let markets: any[] = [];
  await test('getMarkets', async () => {
    markets = await client.getMarkets();
    return `${markets.length} markets found`;
  });

  await test('getPrices', async () => {
    const prices = await client.getPrices(TEST_MARKET);
    return `YES: ${(prices.yes * 100).toFixed(1)}%, NO: ${(prices.no * 100).toFixed(1)}%`;
  });

  await test('getMarketInfo', async () => {
    const info = await client.getMarketInfo(TEST_MARKET);
    return `"${info.question.slice(0, 40)}..." resolved=${info.resolved}`;
  });

  await test('getPosition', async () => {
    const pos = await client.getPosition(TEST_MARKET);
    return `YES: ${pos.yesShares.toString()}, NO: ${pos.noShares.toString()}`;
  });

  await test('getPortfolio', async () => {
    const portfolio = await client.getPortfolio();
    return `${portfolio.summary.totalPositions} positions, $${portfolio.summary.totalValue} value`;
  });

  await test('getPremiumMarketData', async () => {
    const data = await client.getPremiumMarketData(TEST_MARKET);
    return `got premium data`;
  });

  await test('getFeeInfo', async () => {
    const fees = await client.getFeeInfo(TEST_MARKET);
    return `pending: ${fees.pendingCreatorFeesFormatted} USDC, creator: ${fees.marketCreator.slice(0, 10)}...`;
  });

  // ---- On-chain Quote Operations (free) ----
  console.log('\n--- Quote Operations (free on-chain reads) ---');

  await test('getBuyQuote', async () => {
    const quote = await client.getBuyQuote(TEST_MARKET, true, '1');
    return `1 USDC -> ${quote.shares.toString()} shares`;
  });

  // ---- Trade Operations (x402 + gas + amount) ----
  console.log('\n--- Trade Operations (x402 + gas) ---');

  await test('buy (0.10 USDC of YES)', async () => {
    const result = await client.buy(TEST_MARKET, true, '0.1');
    return `tx: ${result.txHash.slice(0, 14)}...`;
  });

  // Check position after buy
  let yesShares = 0n;
  await test('getPosition (after buy)', async () => {
    const pos = await client.getPosition(TEST_MARKET);
    yesShares = pos.yesShares;
    return `YES shares: ${pos.yesShares.toString()}`;
  });

  // Sell what we bought (if we have shares)
  if (yesShares > 0n) {
    await test('sell (all YES shares)', async () => {
      const result = await client.sell(TEST_MARKET, true, yesShares);
      return `tx: ${result.txHash.slice(0, 14)}...`;
    });
  } else {
    console.log('  sell (skipped - no shares to sell)');
  }

  // ---- Resolution check (read-only) ----
  console.log('\n--- Resolution Check ---');

  await test('canResolve', async () => {
    const status = await client.canResolve(TEST_MARKET);
    return `canResolve: ${status.canResolve}, isOracle: ${status.isOracle}, time: ${status.resolutionTime.toISOString()}`;
  });

  // ---- Final balance ----
  console.log('\n--- Final Balance ---');
  const finalUSDC = await client.getUSDCBalance();
  const finalMON = await client.getMONBalance();
  const spent = parseFloat(usdcBalance) - parseFloat(finalUSDC);

  console.log(`  USDC: ${usdcBalance} -> ${finalUSDC} (spent: ${spent.toFixed(6)})`);
  console.log(`  MON:  ${monBalance} -> ${finalMON}`);

  // ---- Summary ----
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.name.padEnd(30)} ${r.duration}ms${r.note ? `  ${r.note.slice(0, 60)}` : ''}`);
  }

  console.log('='.repeat(60));
  console.log(`${passed} passed, ${failed} failed out of ${results.length} tests`);
  console.log(`Total USDC spent: ${spent.toFixed(6)}`);
  console.log('='.repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
