/**
 * Close all positions — sell active, redeem resolved
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/close-positions.ts
 */
const { RBSPMClient } = await import('../packages/rbs-pm-sdk/src/client.js');

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

async function main() {
  const client = new RBSPMClient({ privateKey: PRIVATE_KEY });
  console.log('Wallet:', client.getAddress());
  console.log('USDC before:', await client.getUSDCBalance());

  const portfolio = await client.getPortfolio();
  console.log('Total positions:', portfolio.positions?.length);

  for (const pos of portfolio.positions || []) {
    const addr = pos.marketAddress;
    const question = pos.question || addr;
    const yesShares = BigInt(pos.yesShares || '0');
    const noShares = BigInt(pos.noShares || '0');

    if (yesShares === 0n && noShares === 0n) continue;

    console.log(`\n=== ${question} ===`);
    console.log(`  YES: ${pos.yesSharesFormatted || yesShares.toString()}, NO: ${pos.noSharesFormatted || noShares.toString()}`);
    console.log(`  Resolved: ${pos.resolved}`);

    try {
      if (pos.resolved) {
        // Redeem resolved market
        console.log('  -> Redeeming...');
        const result = await client.redeem(addr);
        console.log('  -> Redeemed TX:', result.txHash);
      } else {
        // Sell shares on active market
        if (yesShares > 0n) {
          console.log(`  -> Selling ${pos.yesSharesFormatted} YES shares...`);
          const result = await client.sell(addr, true, yesShares);
          console.log('  -> Sold YES TX:', result.txHash);
        }
        if (noShares > 0n) {
          console.log(`  -> Selling ${pos.noSharesFormatted} NO shares...`);
          const result = await client.sell(addr, false, noShares);
          console.log('  -> Sold NO TX:', result.txHash);
        }
      }
    } catch (err: any) {
      console.error(`  -> FAILED: ${err.message || err}`);
    }
  }

  console.log('\nUSDC after:', await client.getUSDCBalance());
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
