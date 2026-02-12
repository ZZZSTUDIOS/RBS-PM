/**
 * Check position and x402 spend
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/check-position.ts
 */
const { RBSPMClient } = await import('../packages/rbs-pm-sdk/src/client.js');

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

const MARKET = '0x2542019e6e8efd368A55FCb88aCDa09E8C1E2c28';

async function main() {
  const client = new RBSPMClient({ privateKey: PRIVATE_KEY });

  console.log('Wallet:', client.getAddress());
  console.log('USDC:', await client.getUSDCBalance());
  console.log('MON:', await client.getMONBalance());

  // Get position in UFC market
  const position = await client.getPosition(MARKET);
  console.log('\n=== UFC Market Position ===');
  console.log('YES shares:', position.yesSharesFormatted ?? position.yesShares?.toString());
  console.log('NO shares:', position.noSharesFormatted ?? position.noShares?.toString());

  // Get full portfolio
  const portfolio = await client.getPortfolio();
  console.log('\n=== Full Portfolio ===');
  console.log('Total positions:', portfolio.summary?.totalPositions ?? portfolio.positions?.length);
  for (const pos of portfolio.positions || []) {
    console.log(`\n  Market: ${pos.question || pos.marketAddress}`);
    console.log(`  YES: ${pos.yesSharesFormatted ?? pos.yesShares}`);
    console.log(`  NO: ${pos.noSharesFormatted ?? pos.noShares}`);
  }

  // Get prices
  const prices = await client.getPrices(MARKET);
  console.log('\n=== UFC Prices ===');
  console.log('YES (Strickland):', (prices.yes * 100).toFixed(1) + '%');
  console.log('NO (Hernandez):', (prices.no * 100).toFixed(1) + '%');
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
