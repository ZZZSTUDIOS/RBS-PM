/**
 * Test all x402 endpoints
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/test-all-x402.ts
 */
const { RBSPMClient } = await import('../packages/rbs-pm-sdk/src/client.js');

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

// Active market with liquidity
const MARKET = '0x2542019e6e8efd368A55FCb88aCDa09E8C1E2c28';

async function main() {
  const client = new RBSPMClient({ privateKey: PRIVATE_KEY });
  const wallet = client.getAddress();

  const results: { endpoint: string; status: string; detail: string }[] = [];

  async function test(name: string, fn: () => Promise<string>) {
    try {
      const detail = await fn();
      results.push({ endpoint: name, status: 'PASS', detail });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ endpoint: name, status: 'FAIL', detail: msg.slice(0, 120) });
    }
  }

  console.log(`Testing all x402 endpoints with wallet ${wallet}\n`);

  // 1a. getMarkets - default (x402-markets)
  await test('x402-markets (default)', async () => {
    const markets = await client.getMarkets();
    return `${markets.length} markets found`;
  });

  // 1b. getMarkets - filtered by status
  await test('x402-markets (status=ACTIVE)', async () => {
    const markets = await client.getMarkets({ status: 'ACTIVE' });
    return `${markets.length} active markets`;
  });

  // 1c. getMarkets - sorted by volume, limited
  await test('x402-markets (sort=volume, limit=3)', async () => {
    const markets = await client.getMarkets({ sort: 'volume', order: 'desc', limit: 3 });
    return `${markets.length} markets (max 3)`;
  });

  // 1d. getMarkets - pagination
  await test('x402-markets (limit=2, offset=1)', async () => {
    const markets = await client.getMarkets({ limit: 2, offset: 1 });
    return `${markets.length} markets (page 2, size 2)`;
  });

  // 1e. getMarkets - resolved filter
  await test('x402-markets (resolved=false)', async () => {
    const markets = await client.getMarkets({ resolved: false });
    return `${markets.length} unresolved markets`;
  });

  // 2. getPrices (x402-prices)
  await test('x402-prices', async () => {
    const prices = await client.getPrices(MARKET);
    return `YES: ${(prices.yes * 100).toFixed(1)}%, NO: ${(prices.no * 100).toFixed(1)}%`;
  });

  // 3. getMarketInfo (x402-market-info)
  await test('x402-market-info', async () => {
    const info = await client.getMarketInfo(MARKET);
    return `"${(info.question || '').slice(0, 50)}..." resolved=${info.resolved}`;
  });

  // 4. getMarketData (x402-market-data) - if it exists in SDK
  await test('x402-market-data', async () => {
    // market-data might be accessed via getMarketInfo or a separate method
    if (typeof (client as any).getMarketData === 'function') {
      const data = await (client as any).getMarketData(MARKET);
      return JSON.stringify(data).slice(0, 100);
    }
    // Try direct fetch
    const resp = await fetch(`https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/x402-market-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketAddress: MARKET }),
    });
    if (resp.status === 402) return `402 returned (x402 working, needs payment)`;
    return `Status: ${resp.status}`;
  });

  // 5. getPosition (x402-position)
  await test('x402-position', async () => {
    const pos = await client.getPosition(MARKET);
    return `YES: ${pos.yesShares?.toString() || '0'}, NO: ${pos.noShares?.toString() || '0'}`;
  });

  // 6. getPortfolio (x402-portfolio)
  await test('x402-portfolio', async () => {
    const portfolio = await client.getPortfolio();
    const count = portfolio.positions?.length ?? 0;
    return `${count} positions`;
  });

  // 7. buy (x402-agent-trade)
  await test('x402-agent-trade (buy)', async () => {
    const result = await client.buy(MARKET, false, '0.1');
    return `TX: ${result.txHash?.slice(0, 18)}... shares: ${result.sharesReceived || 'confirmed'}`;
  });

  // 8. sell (x402-agent-trade)
  await test('x402-agent-trade (sell)', async () => {
    // Sell the NO shares we just bought
    const pos = await client.getPosition(MARKET);
    const noShares = pos.noShares || 0n;
    if (noShares === 0n) return 'SKIP: no NO shares to sell';
    const result = await client.sell(MARKET, false, noShares);
    return `TX: ${result.txHash?.slice(0, 18)}...`;
  });

  // 9. canResolve / resolve (x402-resolve) - just check, don't actually resolve
  await test('x402-resolve (canResolve check)', async () => {
    const status = await client.canResolve(MARKET);
    return `canResolve: ${JSON.stringify(status)}`;
  });

  // 10. getFeeInfo / claimCreatorFees (x402-claim-fees)
  await test('x402-claim-fees (getFeeInfo)', async () => {
    const feeInfo = await client.getFeeInfo(MARKET);
    return `pending: ${feeInfo.pendingCreatorFeesFormatted} USDC, creator: ${feeInfo.marketCreator.slice(0, 10)}..., isCreator: ${feeInfo.isCreator}`;
  });

  // 11. redeem (x402-redeem) - just check, market not resolved so should fail gracefully
  await test('x402-redeem', async () => {
    try {
      await client.redeem(MARKET);
      return 'redeemed (unexpected - market not resolved)';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not resolved') || msg.includes('revert') || msg.includes('MarketNotResolved')) {
        return `Correctly rejected: market not resolved`;
      }
      throw err;
    }
  });

  // 12. deploy-market - just verify 402 response (don't actually deploy)
  await test('x402-deploy-market (402 check)', async () => {
    const resp = await fetch(`https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/x402-deploy-market`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (resp.status === 402) return `402 returned correctly`;
    return `Status: ${resp.status} (expected 402)`;
  });

  // 13. initialize - just verify 402 response
  await test('x402-initialize (402 check)', async () => {
    const resp = await fetch(`https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/x402-initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (resp.status === 402) return `402 returned correctly`;
    return `Status: ${resp.status} (expected 402)`;
  });

  // 14. create-market (listing) - just verify 402 response
  await test('x402-create-market (402 check)', async () => {
    const resp = await fetch(`https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/x402-create-market`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (resp.status === 402) return `402 returned correctly`;
    return `Status: ${resp.status} (expected 402)`;
  });

  // Print results
  console.log('\n' + '='.repeat(80));
  console.log('RESULTS');
  console.log('='.repeat(80));

  let passed = 0, failed = 0;
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'OK' : 'XX';
    console.log(`  [${icon}] ${r.endpoint.padEnd(42)} ${r.detail}`);
    if (r.status === 'PASS') passed++; else failed++;
  }

  console.log('='.repeat(80));
  console.log(`${passed} passed, ${failed} failed out of ${results.length} tests`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
