/**
 * Trade on UFC Strickland vs Hernandez market
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/trade-ufc.ts
 */
const { RBSPMClient } = await import('../packages/rbs-pm-sdk/src/client.js');

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

const MARKET = '0x2542019e6e8efd368A55FCb88aCDa09E8C1E2c28';

async function main() {
  const client = new RBSPMClient({ privateKey: PRIVATE_KEY });

  // Check balances
  const usdc = await client.getUSDCBalance();
  const mon = await client.getMONBalance();
  console.log('Wallet:', client.getAddress());
  console.log('USDC balance:', usdc);
  console.log('MON balance:', mon);

  // Get current prices
  const prices = await client.getPrices(MARKET);
  console.log('\nCurrent prices:');
  console.log('  YES (Strickland wins):', (prices.yes * 100).toFixed(1) + '%');
  console.log('  NO (Hernandez wins):', (prices.no * 100).toFixed(1) + '%');

  // Buy 1 USDC of YES-STRICKLAND
  console.log('\nBuying 1 USDC of YES-STRICKLAND...');
  const result = await client.buy(MARKET, true, '1');
  console.log('TX:', result.txHash);
  console.log('Shares received:', result.sharesReceived);

  // Check updated prices
  const newPrices = await client.getPrices(MARKET);
  console.log('\nUpdated prices:');
  console.log('  YES:', (newPrices.yes * 100).toFixed(1) + '%');
  console.log('  NO:', (newPrices.no * 100).toFixed(1) + '%');

  // Check position
  const position = await client.getPosition(MARKET);
  console.log('\nPosition:');
  console.log('  YES shares:', position.yesSharesFormatted);
  console.log('  NO shares:', position.noSharesFormatted);
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
