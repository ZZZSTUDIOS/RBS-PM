/**
 * RBS Prediction Market - Starter Agent Template
 *
 * Setup:
 * 1. npm install @madgallery/rbs-pm-sdk viem
 * 2. Set PRIVATE_KEY environment variable
 * 3. Fund wallet with MON (gas) and USDC (trading)
 * 4. Run: npx ts-node starter-agent.ts
 */

import { RBSPMClient } from '@madgallery/rbs-pm-sdk';

// Initialize client with your wallet
const client = new RBSPMClient({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// ============================================
// STEP 1: Check wallet health
// ============================================
async function checkWallet() {
  const address = client.getAddress();
  const mon = await client.getMONBalance();
  const usdc = await client.getUSDCBalance();

  console.log('\n=== WALLET STATUS ===');
  console.log(`Address: ${address}`);
  console.log(`MON (gas): ${mon}`);
  console.log(`USDC (trading): ${usdc}`);

  const ready = parseFloat(mon) >= 0.01 && parseFloat(usdc) >= 10;
  console.log(`Ready to trade: ${ready ? 'YES' : 'NO'}`);

  if (!ready) {
    if (parseFloat(mon) < 0.01) {
      console.log('⚠️  Need MON for gas: https://faucet.monad.xyz');
    }
    if (parseFloat(usdc) < 10) {
      console.log('⚠️  Need minimum 10 USDC for trading');
    }
  }

  return { address, mon, usdc, ready };
}

// ============================================
// STEP 2: Discover markets
// ============================================
async function discoverMarkets() {
  console.log('\n=== AVAILABLE MARKETS ===');

  const markets = await client.getMarkets();

  if (markets.length === 0) {
    console.log('No markets found');
    return [];
  }

  for (const market of markets) {
    const yesPercent = (market.yes_price * 100).toFixed(0);
    const noPercent = (market.no_price * 100).toFixed(0);
    console.log(`\n📊 ${market.question}`);
    console.log(`   Address: ${market.address}`);
    console.log(`   YES: ${yesPercent}% | NO: ${noPercent}%`);
    console.log(`   Volume: $${market.total_volume || 0} USDC`);
  }

  return markets;
}

// ============================================
// STEP 3: Check your positions
// ============================================
async function checkPortfolio() {
  console.log('\n=== YOUR PORTFOLIO ===');

  const portfolio = await client.getPortfolio();

  if (portfolio.positions.length === 0) {
    console.log('No positions yet');
    return portfolio;
  }

  for (const pos of portfolio.positions) {
    console.log(`\n📈 ${pos.marketQuestion}`);
    console.log(`   YES shares: ${pos.yesSharesFormatted}`);
    console.log(`   NO shares: ${pos.noSharesFormatted}`);
    console.log(`   Value: $${pos.totalValue} USDC`);
    if (pos.resolved) {
      console.log('   ⚡ RESOLVED - Call redeem() to collect!');
    }
  }

  console.log(`\nTotal value: $${portfolio.summary.totalValue} USDC`);
  return portfolio;
}

// ============================================
// STEP 4: Make a trade (example)
// ============================================
async function exampleTrade(marketAddress: `0x${string}`, betYes: boolean, amountUsdc: number) {
  console.log('\n=== PLACING TRADE ===');
  console.log(`Market: ${marketAddress}`);
  console.log(`Side: ${betYes ? 'YES' : 'NO'}`);
  console.log(`Amount: $${amountUsdc} USDC`);

  // Get current prices first
  const prices = await client.getPrices(marketAddress);
  console.log(`Current price: ${(prices.yes * 100).toFixed(1)}% YES / ${(prices.no * 100).toFixed(1)}% NO`);

  // Execute trade
  const txHash = await client.buy(marketAddress, betYes, amountUsdc);
  console.log(`✅ Trade submitted: ${txHash}`);
  console.log(`   View: https://testnet.monadexplorer.com/tx/${txHash}`);

  return txHash;
}

// ============================================
// MAIN: Run the agent
// ============================================
async function main() {
  console.log('🤖 RBS Prediction Market Agent Starting...\n');

  // Step 1: Check wallet
  const wallet = await checkWallet();
  if (!wallet.ready) {
    console.log('\n❌ Wallet not ready. Fund it first.');
    return;
  }

  // Step 2: Discover markets
  const markets = await discoverMarkets();
  if (markets.length === 0) {
    console.log('\n❌ No markets to trade.');
    return;
  }

  // Step 3: Check existing positions
  await checkPortfolio();

  // Step 4: Example trade (uncomment to execute)
  // const firstMarket = markets[0].address as `0x${string}`;
  // await exampleTrade(firstMarket, true, 1); // Buy $1 of YES

  console.log('\n✅ Agent ready. Modify this script to implement your trading strategy.');
}

main().catch(console.error);
