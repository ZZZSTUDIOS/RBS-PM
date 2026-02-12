/**
 * Buy shares on a market using the SDK
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/buy-shares-sdk.ts
 */
const { RBSPMClient } = await import('../packages/rbs-pm-sdk/src/client.js');

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

const MARKET = '0x0e52b8edf0A96E5FAadCD5b21feC05a8dc3e7eBA' as `0x${string}`;

async function main() {
  const client = new RBSPMClient({ privateKey: PRIVATE_KEY });

  console.log('=== Buy Shares via SDK ===\n');

  // Get market info first
  const prices = await client.getPrices(MARKET);
  console.log('Market:', MARKET);
  console.log('YES price:', prices.yes.toFixed(4));
  console.log('NO price:', prices.no.toFixed(4));

  // Buy 1 USDC of YES shares
  console.log('\n--- Buying 1 USDC of YES shares ---');
  const yesBuy = await client.buy(MARKET, true, '1');
  console.log('TX:', yesBuy.txHash);
  console.log('Shares received:', Number(yesBuy.shares) / 1e18);
  console.log('Cost (USDC):', Number(yesBuy.cost) / 1e6);

  // Buy 1 USDC of NO shares
  console.log('\n--- Buying 1 USDC of NO shares ---');
  const noBuy = await client.buy(MARKET, false, '1');
  console.log('TX:', noBuy.txHash);
  console.log('Shares received:', Number(noBuy.shares) / 1e18);
  console.log('Cost (USDC):', Number(noBuy.cost) / 1e6);

  // Check updated prices
  const newPrices = await client.getPrices(MARKET);
  console.log('\nUpdated prices:');
  console.log('YES price:', newPrices.yes.toFixed(4));
  console.log('NO price:', newPrices.no.toFixed(4));

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
