// Simulate an AI agent using the RBS Prediction Market platform
// This demonstrates the full flow: discover -> research -> predict -> trade

import { RBSPMClient } from './dist/index.js';

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY environment variable');
  process.exit(1);
}

// ============================================================
// AGENT SIMULATION
// ============================================================

console.log('═'.repeat(60));
console.log('🤖 RBS PREDICTION MARKET AGENT');
console.log('═'.repeat(60));

const client = new RBSPMClient({ privateKey: PRIVATE_KEY });

// Step 1: Heartbeat
console.log('\n📡 HEARTBEAT CHECK');
console.log('─'.repeat(40));

const wallet = client.getAddress();
const usdc = await client.getUSDCBalance();
const mon = await client.getMONBalance();

console.log(`Wallet: ${wallet}`);
console.log(`MON Balance: ${parseFloat(mon).toFixed(4)} MON`);
console.log(`USDC Balance: ${parseFloat(usdc).toFixed(4)} USDC`);

const canTrade = parseFloat(mon) >= 0.01 && parseFloat(usdc) >= 0.01;
console.log(`Status: ${canTrade ? '✅ Healthy - Can Trade' : '❌ Unhealthy'}`);

if (!canTrade) {
  console.error('\n⚠️ Cannot trade. Need MON for gas and USDC for trading.');
  process.exit(1);
}

// Step 2: Discover Markets
console.log('\n📊 DISCOVERING MARKETS');
console.log('─'.repeat(40));

const markets = await client.getMarkets();
console.log(`Found ${markets.length} active markets:\n`);

for (const m of markets) {
  const market = m as unknown as { question: string; address: string; total_volume: number; total_trades: number };
  console.log(`• ${market.question}`);
  console.log(`  Volume: $${market.total_volume?.toFixed(2) || '0'} | Trades: ${market.total_trades || 0}`);
}

// Step 3: Select highest volume market
const sortedMarkets = [...markets].sort((a: any, b: any) =>
  (b.total_volume || 0) - (a.total_volume || 0)
);
const targetMarket = sortedMarkets[0] as any;

console.log('\n🎯 SELECTED MARKET (Highest Volume)');
console.log('─'.repeat(40));
console.log(`Question: ${targetMarket.question}`);
console.log(`Address: ${targetMarket.address}`);

// Step 4: Get current prices
const prices = await client.getPrices(targetMarket.address);
console.log(`\nCurrent Market Prices:`);
console.log(`  YES: ${(prices.yes * 100).toFixed(1)}%`);
console.log(`  NO: ${(prices.no * 100).toFixed(1)}%`);

// Step 5: Research Phase
console.log('\n🔍 RESEARCH PHASE');
console.log('─'.repeat(40));

// Simulate research based on the question
const question = targetMarket.question;
console.log(`Researching: "${question}"\n`);

// Parse the question to understand what we're predicting
const isETHvsBTC = question.toLowerCase().includes('eth') && question.toLowerCase().includes('btc');
const isPriceTarget = question.toLowerCase().includes('$') || question.toLowerCase().includes('price');
const isFlippening = question.toLowerCase().includes('flip');

let research: {
  summary: string;
  bullishFactors: string[];
  bearishFactors: string[];
  baseRate: number;
  confidence: number;
};

if (isFlippening || (isETHvsBTC && question.includes('flip'))) {
  console.log('📰 Searching: "ETH flippening BTC market cap analysis 2026"');
  console.log('📰 Searching: "Ethereum vs Bitcoin market dominance trends"');
  console.log('📰 Searching: "ETH/BTC ratio historical data"');

  await sleep(1000); // Simulate research time

  research = {
    summary: 'ETH flippening BTC is a long-discussed possibility. ETH came closest in 2017-2018 at ~0.15 BTC. Current ratio ~0.05. Would require significant shift in narrative or BTC decline.',
    bullishFactors: [
      'Ethereum has more active development and DeFi ecosystem',
      'ETH staking provides yield vs BTC none',
      'Layer 2 scaling improving transaction capacity',
      'Institutional interest growing in ETH',
    ],
    bearishFactors: [
      'BTC has "digital gold" narrative and first-mover advantage',
      'Historical flippening attempts have failed',
      'BTC dominance typically increases in bear markets',
      'ETH/BTC ratio currently at multi-year lows',
    ],
    baseRate: 0.15, // Historical peak ratio, never actually flipped
    confidence: 0.7,
  };
} else if (isPriceTarget && question.toLowerCase().includes('btc')) {
  console.log('📰 Searching: "Bitcoin price prediction 2026"');
  console.log('📰 Searching: "BTC halving cycle analysis"');
  console.log('📰 Searching: "Bitcoin institutional adoption trends"');

  await sleep(1000);

  research = {
    summary: 'BTC $150k would be ~2.5x from current levels. Post-halving cycles historically see 3-5x gains. 2024 halving occurred, peak typically 12-18 months later.',
    bullishFactors: [
      'Post-halving supply shock historically bullish',
      'ETF inflows bringing institutional money',
      'Macro environment improving',
      'Previous cycles saw higher highs',
    ],
    bearishFactors: [
      'Diminishing returns each cycle',
      'Regulatory uncertainty remains',
      'Competition from other assets',
      'Global economic risks',
    ],
    baseRate: 0.6, // Based on historical post-halving performance
    confidence: 0.65,
  };
} else if (isPriceTarget && question.toLowerCase().includes('eth')) {
  console.log('📰 Searching: "Ethereum price prediction 2026"');
  console.log('📰 Searching: "ETH staking yield trends"');
  console.log('📰 Searching: "Ethereum ecosystem growth"');

  await sleep(1000);

  research = {
    summary: 'ETH $10k would be significant growth from current levels. Depends on overall crypto market, ETH/BTC ratio, and ecosystem development.',
    bullishFactors: [
      'Strong DeFi and NFT ecosystem',
      'Staking reduces circulating supply',
      'Layer 2 adoption growing',
      'Institutional products launching',
    ],
    bearishFactors: [
      'Competition from alternative L1s',
      'High gas fees persist',
      'Regulatory classification uncertain',
      'Correlation with BTC limits upside',
    ],
    baseRate: 0.4,
    confidence: 0.6,
  };
} else {
  console.log('📰 Searching: general analysis...');
  await sleep(1000);

  research = {
    summary: 'Insufficient specific data for this question.',
    bullishFactors: ['Market sentiment'],
    bearishFactors: ['Uncertainty'],
    baseRate: 0.5,
    confidence: 0.4,
  };
}

console.log(`\n📋 Research Summary:`);
console.log(`   ${research.summary}`);

console.log(`\n✅ Bullish Factors:`);
for (const factor of research.bullishFactors) {
  console.log(`   • ${factor}`);
}

console.log(`\n❌ Bearish Factors:`);
for (const factor of research.bearishFactors) {
  console.log(`   • ${factor}`);
}

console.log(`\n📊 Base Rate: ${(research.baseRate * 100).toFixed(0)}%`);
console.log(`🎯 Research Confidence: ${(research.confidence * 100).toFixed(0)}%`);

// Step 6: Form Prediction
console.log('\n🧠 FORMING PREDICTION');
console.log('─'.repeat(40));

// Weighted prediction: base rate + adjustment for factors
const bullishWeight = research.bullishFactors.length * 0.05;
const bearishWeight = research.bearishFactors.length * 0.05;
const factorAdjustment = bullishWeight - bearishWeight;

let myPrediction = research.baseRate + factorAdjustment;
myPrediction = Math.max(0.05, Math.min(0.95, myPrediction)); // Clamp to 5-95%

console.log(`Base rate: ${(research.baseRate * 100).toFixed(1)}%`);
console.log(`Factor adjustment: ${(factorAdjustment * 100).toFixed(1)}%`);
console.log(`\n🎯 My Prediction: ${(myPrediction * 100).toFixed(1)}% YES`);

// Step 7: Calculate Edge
console.log('\n📈 EDGE ANALYSIS');
console.log('─'.repeat(40));

const marketPrice = prices.yes;
const edge = myPrediction - marketPrice;

console.log(`My prediction: ${(myPrediction * 100).toFixed(1)}%`);
console.log(`Market price:  ${(marketPrice * 100).toFixed(1)}%`);
console.log(`Edge:          ${(edge * 100).toFixed(1)}%`);
console.log(`Direction:     ${edge > 0 ? 'BUY YES (market underpriced)' : 'BUY NO (market overpriced)'}`);

// Step 8: Trading Decision
console.log('\n💰 TRADING DECISION');
console.log('─'.repeat(40));

const minEdge = 0.05; // 5% minimum edge
const minConfidence = 0.5;
const maxPositionPct = 0.1; // 10% of balance

const shouldTrade = Math.abs(edge) >= minEdge && research.confidence >= minConfidence;

if (shouldTrade) {
  const isYes = edge > 0;
  const positionSize = parseFloat(usdc) * maxPositionPct * research.confidence;
  const amount = Math.min(positionSize, 5); // Cap at $5 for simulation

  console.log(`✅ TRADE SIGNAL DETECTED`);
  console.log(`   Side: ${isYes ? 'YES' : 'NO'}`);
  console.log(`   Edge: ${(Math.abs(edge) * 100).toFixed(1)}%`);
  console.log(`   Confidence: ${(research.confidence * 100).toFixed(0)}%`);
  console.log(`   Position Size: $${amount.toFixed(2)} USDC`);

  console.log(`\n🔄 Executing trade...`);

  try {
    const result = await client.buy(targetMarket.address, isYes, amount.toFixed(6));
    const txHash = typeof result === 'string' ? result : result.txHash;
    console.log(`\n✅ TRADE EXECUTED`);
    console.log(`   Transaction: ${txHash}`);
    console.log(`   View on explorer: https://testnet.monadexplorer.com/tx/${txHash}`);

    // Check new position
    const position = await client.getPosition(targetMarket.address);
    console.log(`\n📊 Updated Position:`);
    console.log(`   YES shares: ${(Number(position.yesShares) / 1e18).toFixed(4)}`);
    console.log(`   NO shares: ${(Number(position.noShares) / 1e18).toFixed(4)}`);
  } catch (err) {
    console.error(`\n❌ Trade failed: ${err}`);
  }
} else {
  console.log(`⏸️ NO TRADE`);
  if (Math.abs(edge) < minEdge) {
    console.log(`   Reason: Edge (${(Math.abs(edge) * 100).toFixed(1)}%) below threshold (${minEdge * 100}%)`);
  }
  if (research.confidence < minConfidence) {
    console.log(`   Reason: Confidence (${(research.confidence * 100).toFixed(0)}%) below threshold (${minConfidence * 100}%)`);
  }
  console.log(`   Action: Continue monitoring for better opportunities`);
}

// Final Summary
console.log('\n' + '═'.repeat(60));
console.log('📋 AGENT SESSION SUMMARY');
console.log('═'.repeat(60));

const finalUsdc = await client.getUSDCBalance();
console.log(`Starting USDC: ${parseFloat(usdc).toFixed(4)}`);
console.log(`Ending USDC:   ${parseFloat(finalUsdc).toFixed(4)}`);
console.log(`API Costs:     ~${(parseFloat(usdc) - parseFloat(finalUsdc)).toFixed(4)} USDC`);
console.log(`Market:        ${targetMarket.question}`);
console.log(`Prediction:    ${(myPrediction * 100).toFixed(1)}% YES`);
console.log(`Market Price:  ${(marketPrice * 100).toFixed(1)}% YES`);
console.log(`Edge:          ${(edge * 100).toFixed(1)}%`);
console.log(`Trade:         ${shouldTrade ? 'EXECUTED' : 'SKIPPED'}`);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
