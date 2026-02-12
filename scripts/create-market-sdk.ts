/**
 * Create a new market using the SDK
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/create-market-sdk.ts
 */
// Direct import since re-export doesn't work with tsx
const { RBSPMClient } = await import('../packages/rbs-pm-sdk/src/client.js');

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

async function main() {
  const client = new RBSPMClient({ privateKey: PRIVATE_KEY });

  console.log('=== Deploy New Market via SDK ===\n');

  // UFC Fight Night: Strickland vs Hernandez - Feb 21, 2026
  // Main card at 8 PM ET = Feb 22, 2026 01:00 UTC
  // Resolution after fight ends ~Feb 22, 2026 05:00 UTC
  const resolutionTime = Math.floor(new Date('2026-02-22T05:00:00Z').getTime() / 1000);

  const result = await client.deployMarket({
    question: 'Will Sean Strickland defeat Anthony Hernandez at UFC Fight Night on Feb 21, 2026?',
    resolutionTime,
    initialLiquidity: '5',
    yesSymbol: 'YES-STRICKLAND',
    noSymbol: 'NO-STRICKLAND',
    category: 'sports',
    tags: ['ufc', 'mma', 'strickland', 'hernandez'],
  });

  console.log('\n=== Market Created ===');
  console.log('Market address:', result.marketAddress);
  console.log('Deploy tx:', result.deployTxHash);
  console.log('Initialize tx:', result.initializeTxHash);
  console.log('Listing ID:', result.listingId);
  console.log('Resolution:', new Date(resolutionTime * 1000).toISOString());

  // Fetch market info to confirm
  const markets = await client.getMarkets();
  const newMarket = markets.find(m => m.address?.toLowerCase() === result.marketAddress.toLowerCase());
  if (newMarket) {
    console.log('\nMarket visible in discovery:');
    console.log('  Question:', newMarket.question);
    console.log('  ID:', newMarket.id);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
