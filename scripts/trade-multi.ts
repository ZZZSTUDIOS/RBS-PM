/**
 * Make multiple trades on Strickland market
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/trade-multi.ts
 */
const { RBSPMClient } = await import('../packages/rbs-pm-sdk/src/client.js');

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

const MARKET = '0x2542019e6e8efd368A55FCb88aCDa09E8C1E2c28';

async function main() {
  const client = new RBSPMClient({ privateKey: PRIVATE_KEY });
  console.log('Wallet:', client.getAddress());

  // Trade 1: Buy 2 USDC of NO
  console.log('\n--- Trade 1: Buying 2 USDC of NO-HERNANDEZ ---');
  const r1 = await client.buy(MARKET, false, '2');
  console.log('TX:', r1.txHash);

  const p1 = await client.getPrices(MARKET);
  console.log('Prices -> YES:', (p1.yes * 100).toFixed(1) + '%', 'NO:', (p1.no * 100).toFixed(1) + '%');

  // Trade 2: Buy 1.5 USDC of YES
  console.log('\n--- Trade 2: Buying 1.5 USDC of YES-STRICKLAND ---');
  const r2 = await client.buy(MARKET, true, '1.5');
  console.log('TX:', r2.txHash);

  const p2 = await client.getPrices(MARKET);
  console.log('Prices -> YES:', (p2.yes * 100).toFixed(1) + '%', 'NO:', (p2.no * 100).toFixed(1) + '%');

  console.log('\nDone! 2 additional trades complete.');
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
