const { RBSPMClient } = await import('../packages/rbs-pm-sdk/src/client.js');
const client = new RBSPMClient({ privateKey: process.env.PRIVATE_KEY as `0x${string}` });

const portfolio = await client.getPortfolio();
console.log('Positions:', portfolio.positions?.length);
console.log('Summary:', portfolio.summary);
for (const pos of portfolio.positions || []) {
  console.log(`\n  ${pos.marketQuestion || pos.marketAddress}`);
  console.log(`  YES: ${pos.yesSharesFormatted ?? pos.yesShares} | NO: ${pos.noSharesFormatted ?? pos.noShares}`);
  console.log(`  Value: ${pos.totalValue} USDC`);
}
