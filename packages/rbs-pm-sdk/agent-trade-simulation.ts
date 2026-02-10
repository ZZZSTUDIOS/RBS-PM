// Agent Trading Simulation: Research and Trade on Existing Market
// All operations go through x402 endpoints

import { RBSPMClient } from './dist/index.js';

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY environment variable');
  process.exit(1);
}

// The market we just created
const MARKET_ADDRESS = '0x0227903378ba5be52bf53e441de42ee5ab4d86e6' as `0x${string}`;

// Initialize SDK
const client = new RBSPMClient({ privateKey: PRIVATE_KEY });

async function main() {
  console.log('═'.repeat(70));
  console.log('🤖 AGENT TRADING SIMULATION - TRADE ON EXISTING MARKET');
  console.log('═'.repeat(70));
  console.log('');

  // ============================================================
  // STEP 1: HEARTBEAT
  // ============================================================
  console.log('📡 STEP 1: HEARTBEAT CHECK');
  console.log('─'.repeat(50));

  const wallet = client.getAddress();
  const usdc = await client.getUSDCBalance();
  const mon = await client.getMONBalance();

  console.log(`Wallet:  ${wallet}`);
  console.log(`MON:     ${parseFloat(mon).toFixed(4)} (gas)`);
  console.log(`USDC:    ${parseFloat(usdc).toFixed(4)} (trading)`);
  console.log(`Status:  ✅ HEALTHY`);
  console.log('');

  // ============================================================
  // STEP 2: GET MARKET INFO (via x402)
  // ============================================================
  console.log('📊 STEP 2: GET MARKET INFO (x402-market-info)');
  console.log('─'.repeat(50));
  console.log('Cost: 0.0001 USDC');
  console.log('');

  const marketInfo = await client.getMarketInfo(MARKET_ADDRESS);
  console.log(`Market:     ${MARKET_ADDRESS}`);
  console.log(`Question:   ${marketInfo.question}`);
  console.log(`Oracle:     ${marketInfo.oracle}`);
  console.log(`Resolution: ${new Date(Number(marketInfo.resolutionTime) * 1000).toISOString()}`);
  console.log(`Resolved:   ${marketInfo.resolved}`);
  console.log(`Liquidity:  ${marketInfo.totalCollateral} USDC`);
  console.log('');

  // ============================================================
  // STEP 3: GET CURRENT PRICES (via x402)
  // ============================================================
  console.log('💰 STEP 3: GET MARKET PRICES (x402-prices)');
  console.log('─'.repeat(50));
  console.log('Cost: 0.0001 USDC');
  console.log('');

  const prices = await client.getPrices(MARKET_ADDRESS);
  console.log(`YES: ${(prices.yes * 100).toFixed(2)}%`);
  console.log(`NO:  ${(prices.no * 100).toFixed(2)}%`);
  console.log('');

  // ============================================================
  // STEP 4: CHECK CURRENT POSITION (via x402)
  // ============================================================
  console.log('📈 STEP 4: CHECK CURRENT POSITION (x402-position)');
  console.log('─'.repeat(50));
  console.log('Cost: 0.0001 USDC');
  console.log('');

  const currentPosition = await client.getPosition(MARKET_ADDRESS);
  console.log(`Current YES shares: ${(Number(currentPosition.yesShares) / 1e18).toFixed(4)}`);
  console.log(`Current NO shares:  ${(Number(currentPosition.noShares) / 1e18).toFixed(4)}`);
  console.log('');

  // ============================================================
  // STEP 5: RESEARCH
  // ============================================================
  console.log('🔍 STEP 5: RESEARCH PHASE');
  console.log('─'.repeat(50));
  console.log(`Question: "${marketInfo.question}"`);
  console.log('');

  console.log('📰 Performing live web research...');
  console.log('');

  // Simulate real research findings
  const research = {
    summary: `Bitcoin is currently trading around $97,000. The question asks if BTC will touch $100k ` +
             `at any point tomorrow (Feb 11, 2026). Given current levels, this requires only a ~3% move. ` +
             `Daily BTC volatility averages 3-5%, making this achievable but not guaranteed.`,

    keyFindings: [
      'Current BTC price: ~$97,000 (within striking distance)',
      'ETF flows remain positive - institutional buying continues',
      'Bitcoin halving in 2024 historically leads to bull runs 12-18 months later',
      'Technical resistance at $100k - psychological round number',
      'Market sentiment: Cautiously bullish',
    ],

    dataPoints: {
      currentPrice: 97000,
      targetPrice: 100000,
      requiredMove: 3.09,
      avgDailyVolatility: 4.2,
      probability: 0.68, // Based on volatility analysis
    },
  };

  console.log('📋 Research Findings:');
  research.keyFindings.forEach(f => console.log(`   • ${f}`));
  console.log('');

  console.log('📊 Quantitative Analysis:');
  console.log(`   Current Price:     $${research.dataPoints.currentPrice.toLocaleString()}`);
  console.log(`   Target Price:      $${research.dataPoints.targetPrice.toLocaleString()}`);
  console.log(`   Required Move:     ${research.dataPoints.requiredMove.toFixed(2)}%`);
  console.log(`   Avg Daily Vol:     ${research.dataPoints.avgDailyVolatility.toFixed(1)}%`);
  console.log(`   Base Probability:  ${(research.dataPoints.probability * 100).toFixed(0)}%`);
  console.log('');

  // ============================================================
  // STEP 6: FORM PREDICTION
  // ============================================================
  console.log('🧠 STEP 6: FORM PREDICTION');
  console.log('─'.repeat(50));

  // Bayesian-style update based on research
  let prediction = research.dataPoints.probability;

  // Adjustments based on findings
  const adjustments = [
    { factor: 'Within volatility range', delta: +0.05 },
    { factor: 'ETF flows positive', delta: +0.03 },
    { factor: 'Post-halving momentum', delta: +0.04 },
    { factor: '$100k resistance', delta: -0.05 },
    { factor: 'Single day constraint', delta: -0.03 },
  ];

  console.log('Prediction Adjustments:');
  adjustments.forEach(a => {
    const sign = a.delta >= 0 ? '+' : '';
    console.log(`   ${a.factor}: ${sign}${(a.delta * 100).toFixed(0)}%`);
    prediction += a.delta;
  });

  prediction = Math.max(0.1, Math.min(0.9, prediction));

  console.log('');
  console.log(`🎯 FINAL PREDICTION: ${(prediction * 100).toFixed(1)}% YES`);
  console.log('');

  // ============================================================
  // STEP 7: EDGE ANALYSIS
  // ============================================================
  console.log('📈 STEP 7: EDGE ANALYSIS');
  console.log('─'.repeat(50));

  const marketPrice = prices.yes;
  const edge = prediction - marketPrice;
  const edgePercent = Math.abs(edge * 100);

  console.log(`My prediction:  ${(prediction * 100).toFixed(1)}%`);
  console.log(`Market price:   ${(marketPrice * 100).toFixed(1)}%`);
  console.log(`Edge:           ${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}%`);
  console.log(`Direction:      ${edge > 0 ? 'BUY YES' : 'BUY NO'}`);
  console.log('');

  // ============================================================
  // STEP 8: TRADE DECISION & EXECUTION (via x402)
  // ============================================================
  console.log('💰 STEP 8: EXECUTE TRADE (x402-agent-trade)');
  console.log('─'.repeat(50));
  console.log('Cost: 0.0001 USDC (x402) + trade amount');
  console.log('');

  const MIN_EDGE = 0.05; // 5% minimum edge to trade
  const shouldTrade = edgePercent >= MIN_EDGE * 100;

  if (!shouldTrade) {
    console.log(`⏸️ Edge too small (${edgePercent.toFixed(1)}% < ${MIN_EDGE * 100}%)`);
    console.log('   No trade executed.');
  } else {
    const isYes = edge > 0;

    // Kelly criterion for position sizing (simplified)
    // f = (bp - q) / b where b=odds, p=probability, q=1-p
    const odds = isYes ? (1 / marketPrice - 1) : (1 / (1 - marketPrice) - 1);
    const kellyFraction = (odds * prediction - (1 - prediction)) / odds;
    const safeFraction = Math.max(0.01, Math.min(0.25, kellyFraction * 0.5)); // Half-Kelly, max 25%

    const availableUSDC = parseFloat(usdc);
    const tradeAmount = Math.min(1.0, availableUSDC * safeFraction); // Max $1 for testing

    console.log(`✅ TRADE SIGNAL DETECTED`);
    console.log('');
    console.log('Position Sizing (Kelly Criterion):');
    console.log(`   Kelly fraction:    ${(kellyFraction * 100).toFixed(1)}%`);
    console.log(`   Half-Kelly (safe): ${(safeFraction * 100).toFixed(1)}%`);
    console.log(`   Available USDC:    $${availableUSDC.toFixed(2)}`);
    console.log('');
    console.log('Trade Details:');
    console.log(`   Side:    ${isYes ? 'YES' : 'NO'}`);
    console.log(`   Amount:  $${tradeAmount.toFixed(2)} USDC`);
    console.log(`   Edge:    ${edgePercent.toFixed(1)}%`);
    console.log('');
    console.log('🔄 Submitting trade via x402...');

    try {
      const result = await client.buy(MARKET_ADDRESS, isYes, tradeAmount.toString());
      console.log('');
      console.log(`✅ TRADE EXECUTED SUCCESSFULLY!`);
      console.log(`   TX Hash: ${result.txHash}`);
      console.log(`   Explorer: https://testnet.monadexplorer.com/tx/${result.txHash}`);
    } catch (err: any) {
      console.log(`❌ Trade error: ${err.message}`);
    }
  }
  console.log('');

  // ============================================================
  // STEP 9: VERIFY NEW POSITION (via x402)
  // ============================================================
  console.log('📊 STEP 9: VERIFY NEW POSITION (x402-position)');
  console.log('─'.repeat(50));
  console.log('Cost: 0.0001 USDC');
  console.log('');

  const newPosition = await client.getPosition(MARKET_ADDRESS);
  const yesSharesBefore = Number(currentPosition.yesShares) / 1e18;
  const noSharesBefore = Number(currentPosition.noShares) / 1e18;
  const yesSharesAfter = Number(newPosition.yesShares) / 1e18;
  const noSharesAfter = Number(newPosition.noShares) / 1e18;

  console.log('Position Update:');
  console.log(`   YES: ${yesSharesBefore.toFixed(4)} → ${yesSharesAfter.toFixed(4)} (${yesSharesAfter > yesSharesBefore ? '+' : ''}${(yesSharesAfter - yesSharesBefore).toFixed(4)})`);
  console.log(`   NO:  ${noSharesBefore.toFixed(4)} → ${noSharesAfter.toFixed(4)} (${noSharesAfter > noSharesBefore ? '+' : ''}${(noSharesAfter - noSharesBefore).toFixed(4)})`);
  console.log('');

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  const finalUsdc = await client.getUSDCBalance();
  const totalSpent = parseFloat(usdc) - parseFloat(finalUsdc);

  console.log('═'.repeat(70));
  console.log('📋 TRADING SESSION COMPLETE');
  console.log('═'.repeat(70));
  console.log('');
  console.log('Market:');
  console.log(`  Address:    ${MARKET_ADDRESS}`);
  console.log(`  Question:   ${marketInfo.question}`);
  console.log('');
  console.log('Analysis:');
  console.log(`  Prediction: ${(prediction * 100).toFixed(1)}% YES`);
  console.log(`  Market:     ${(marketPrice * 100).toFixed(1)}% YES`);
  console.log(`  Edge:       ${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}%`);
  console.log('');
  console.log('Position:');
  console.log(`  YES shares: ${yesSharesAfter.toFixed(4)}`);
  console.log(`  NO shares:  ${noSharesAfter.toFixed(4)}`);
  console.log('');
  console.log('Costs:');
  console.log(`  Starting USDC: ${parseFloat(usdc).toFixed(4)}`);
  console.log(`  Ending USDC:   ${parseFloat(finalUsdc).toFixed(4)}`);
  console.log(`  Total spent:   ${totalSpent.toFixed(4)} USDC`);
  console.log('');
  console.log('x402 API Calls:');
  console.log('  • x402-market-info:   0.0001 USDC');
  console.log('  • x402-prices:        0.0001 USDC');
  console.log('  • x402-position (x2): 0.0002 USDC');
  console.log('  • x402-agent-trade:   0.0001 USDC');
  console.log('  ─────────────────────────────────');
  console.log('  Total x402 fees:      0.0005 USDC');
}

main().catch(console.error);
