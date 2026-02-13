// Test all x402 endpoints using published SDK v1.0.38
// Run with: npx tsx test-x402.ts

import { RBSPMClient } from '@madgallery/rbs-pm-sdk';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const client = new RBSPMClient({
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const addr = client.getAddress();
  console.log(`Wallet: ${addr}`);
  console.log(`x402 Enabled: ${client.hasPaymentCapability()}\n`);

  // === FREE OPERATIONS ===
  console.log('=== FREE OPERATIONS ===');

  const usdc = await client.getUSDCBalance();
  console.log(`✓ getUSDCBalance: ${usdc} USDC`);

  const mon = await client.getMONBalance();
  console.log(`✓ getMONBalance: ${mon} MON`);

  // === x402 READS (0.01 USDC each) ===
  console.log('\n=== x402 READS ===');

  // 1. getMarkets
  console.log('\n--- getMarkets (0.01 USDC) ---');
  const markets = await client.getMarkets({ status: 'ACTIVE', limit: 3 });
  console.log(`✓ Got ${markets.length} markets`);
  for (const m of markets) {
    console.log(`  ${m.question} | YES: ${(m.yesPrice * 100).toFixed(1)}%`);
  }
  await sleep(2000);

  // 2. getPortfolio
  console.log('\n--- getPortfolio (0.01 USDC) ---');
  const portfolio = await client.getPortfolio();
  console.log(`✓ Positions: ${portfolio.summary.totalPositions}, Value: $${portfolio.summary.totalValue}`);
  await sleep(2000);

  // 3. getPosition (single market)
  if (markets.length > 0) {
    console.log('\n--- getPosition (0.01 USDC) ---');
    const pos = await client.getPosition(markets[0].address as `0x${string}`);
    console.log(`✓ Position in "${markets[0].question}": YES=${pos.yesShares}, NO=${pos.noShares}`);
    await sleep(2000);
  }

  // 4. getPrices
  if (markets.length > 0) {
    console.log('\n--- getPrices (0.01 USDC) ---');
    const prices = await client.getPrices(markets[0].address as `0x${string}`);
    console.log(`✓ Prices: YES=${prices.yesPrice}, NO=${prices.noPrice}`);
    await sleep(2000);
  }

  // 5. getMarketInfo
  if (markets.length > 0) {
    console.log('\n--- getMarketInfo (0.01 USDC) ---');
    const info = await client.getMarketInfo(markets[0].address as `0x${string}`);
    console.log(`✓ Info: oracle=${info.oracle}, resolved=${info.resolved}`);
    await sleep(2000);
  }

  // 6. getPremiumMarketData
  if (markets.length > 0) {
    console.log('\n--- getPremiumMarketData (0.01 USDC) ---');
    const data = await client.getPremiumMarketData(markets[0].address as `0x${string}`);
    console.log(`✓ Premium data: heat=${data.heatScore}, stress=${data.stressScore}`);
    await sleep(2000);
  }

  // 7. canResolve
  if (markets.length > 0) {
    console.log('\n--- canResolve (0.01 USDC) ---');
    const canRes = await client.canResolve(markets[0].address as `0x${string}`);
    console.log(`✓ canResolve=${canRes.canResolve}, reason=${canRes.reason}`);
    await sleep(2000);
  }

  // 8. getFeeInfo
  if (markets.length > 0) {
    console.log('\n--- getFeeInfo (0.01 USDC) ---');
    const fees = await client.getFeeInfo(markets[0].address as `0x${string}`);
    console.log(`✓ Fees: pendingCreatorFees=${fees.pendingCreatorFees}`);
    await sleep(2000);
  }

  // === FREE QUOTES ===
  console.log('\n=== FREE QUOTES ===');

  if (markets.length > 0) {
    const mAddr = markets[0].address as `0x${string}`;

    console.log('\n--- getBuyQuote (FREE) ---');
    const buyQ = await client.getBuyQuote(mAddr, true, '1');
    console.log(`✓ Buy 1 USDC of YES → ${buyQ.shares} shares, avg price: ${buyQ.averagePrice}`);

    console.log('\n--- getSellQuote (FREE) ---');
    const sellQ = await client.getSellQuote(mAddr, true, BigInt(1e18));
    console.log(`✓ Sell 1 share of YES → payout: ${sellQ.payout}`);
  }

  // === WRITE OPERATIONS (0.01 USDC + gas) ===
  console.log('\n=== WRITE OPERATIONS ===');

  if (markets.length > 0) {
    const mAddr = markets[0].address as `0x${string}`;

    // Buy 1 USDC of YES
    console.log('\n--- buy (0.01 USDC + gas + 1 USDC) ---');
    try {
      const buyResult = await client.buy(mAddr, true, '1');
      console.log(`✓ Buy TX: ${buyResult.txHash}`);
    } catch (e: any) {
      console.log(`✗ Buy failed: ${e.message}`);
    }
    await sleep(3000);

    // Sell a small amount
    console.log('\n--- sell (0.01 USDC + gas) ---');
    try {
      const pos = await client.getPosition(mAddr);
      await sleep(2000);
      const yesShares = BigInt(pos.yesShares);
      if (yesShares > 0n) {
        const toSell = yesShares / 4n;
        const sellResult = await client.sell(mAddr, true, toSell > 0n ? toSell : 1n);
        console.log(`✓ Sell TX: ${sellResult.txHash}`);
      } else {
        console.log('  No YES shares to sell, skipping');
      }
    } catch (e: any) {
      console.log(`✗ Sell failed: ${e.message}`);
    }
  }

  // === FINAL BALANCE ===
  console.log('\n=== FINAL ===');
  const finalUsdc = await client.getUSDCBalance();
  const finalMon = await client.getMONBalance();
  console.log(`USDC: ${usdc} → ${finalUsdc} (spent: ${(parseFloat(usdc) - parseFloat(finalUsdc)).toFixed(4)})`);
  console.log(`MON: ${mon} → ${finalMon}`);
  console.log('\nAll x402 endpoint tests complete!');
}

main().catch(console.error);
