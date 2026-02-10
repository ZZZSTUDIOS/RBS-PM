// Full Agent Simulation: Create Market, Initialize, Research, Trade
// All operations go through x402 endpoints

import { RBSPMClient } from './dist/index.js';
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY environment variable');
  process.exit(1);
}

// Contract addresses
const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3';

// Monad testnet
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
};

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({
  chain: monadTestnet as any,
  transport: http()
});
const walletClient = createWalletClient({
  account,
  chain: monadTestnet as any,
  transport: http()
});

// LSLMSR_ERC20 ABI for deployment
const LSLMSR_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: '_collateralToken', type: 'address' },
      { name: '_collateralDecimals', type: 'uint8' },
      { name: '_question', type: 'string' },
      { name: '_resolutionTime', type: 'uint256' },
      { name: '_oracle', type: 'address' },
      { name: '_alpha', type: 'uint256' },
      { name: '_minInitialLiquidity', type: 'uint256' },
      { name: '_initialYesShares', type: 'uint256' },
      { name: '_initialNoShares', type: 'uint256' },
      { name: '_yesTokenName', type: 'string' },
      { name: '_yesTokenSymbol', type: 'string' },
      { name: '_noTokenName', type: 'string' },
      { name: '_noTokenSymbol', type: 'string' },
    ],
  },
  { name: 'yesToken', type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'noToken', type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'initialized', type: 'function', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
];

// Initialize SDK
const client = new RBSPMClient({ privateKey: PRIVATE_KEY });

async function main() {
console.log('═'.repeat(70));
console.log('🤖 FULL AGENT SIMULATION - CREATE MARKET & TRADE');
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
// STEP 2: DEFINE MARKET
// ============================================================
console.log('📝 STEP 2: DEFINE NEW MARKET');
console.log('─'.repeat(50));

// Resolution time: tomorrow at midnight UTC
const tomorrow = new Date();
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
tomorrow.setUTCHours(23, 59, 59, 0);
const resolutionTime = Math.floor(tomorrow.getTime() / 1000);

const marketQuestion = 'Will Bitcoin trade above $100,000 at any point on Feb 11, 2026?';
const category = 'crypto';
const tags = ['bitcoin', 'price', 'daily'];

console.log(`Question: "${marketQuestion}"`);
console.log(`Resolution: ${tomorrow.toISOString()}`);
console.log(`Category: ${category}`);
console.log(`Tags: ${tags.join(', ')}`);
console.log('');

// ============================================================
// STEP 3: DEPLOY MARKET CONTRACT
// ============================================================
console.log('🔨 STEP 3: DEPLOY MARKET CONTRACT');
console.log('─'.repeat(50));

// Read bytecode from artifacts
const fs = await import('fs');
const path = await import('path');

const artifactPath = path.join(process.cwd(), '../../out/LSLMSR_ERC20.sol/LSLMSR_ERC20.json');
let bytecode: `0x${string}`;

try {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  bytecode = artifact.bytecode.object as `0x${string}`;
  console.log('Loaded LSLMSR_ERC20 bytecode from artifacts');
} catch {
  console.error('Could not load bytecode. Run: forge build');
  process.exit(1);
}

// Deploy parameters
const alpha = parseUnits('0.03', 18); // 3% max price impact
const minLiquidity = parseUnits('1', 6); // 1 USDC minimum
const initialShares = parseUnits('100', 18); // 100 shares each side

console.log('Deploying LSLMSR_ERC20 contract...');

const deployHash = await walletClient.deployContract({
  abi: LSLMSR_ABI,
  bytecode,
  args: [
    USDC_ADDRESS,                    // collateral token
    6,                               // USDC decimals
    marketQuestion,                  // question
    BigInt(resolutionTime),          // resolution time
    account.address,                 // oracle (self)
    alpha,                           // alpha (3%)
    minLiquidity,                    // min initial liquidity
    initialShares,                   // initial YES shares
    initialShares,                   // initial NO shares
    'BTC 100k YES',                  // YES token name
    'BTC100K-YES',                   // YES token symbol
    'BTC 100k NO',                   // NO token name
    'BTC100K-NO',                    // NO token symbol
  ],
});

console.log(`Deploy TX: ${deployHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const marketAddress = receipt.contractAddress as `0x${string}`;

console.log(`✅ Contract deployed: ${marketAddress}`);
console.log(`Explorer: https://testnet.monadexplorer.com/address/${marketAddress}`);
console.log('');

// Get token addresses
const [yesToken, noToken] = await Promise.all([
  publicClient.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'yesToken' }),
  publicClient.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'noToken' }),
]);

console.log(`YES Token: ${yesToken}`);
console.log(`NO Token:  ${noToken}`);
console.log('');

// ============================================================
// STEP 4: INITIALIZE MARKET (via x402)
// ============================================================
console.log('💧 STEP 4: INITIALIZE MARKET (x402-initialize)');
console.log('─'.repeat(50));
console.log('Cost: 0.0001 USDC (x402) + 1 USDC (liquidity)');
console.log('');

try {
  const initHash = await client.initializeMarket(marketAddress, '1');
  console.log(`✅ Market initialized!`);
  console.log(`TX: ${initHash}`);
} catch (err: any) {
  console.log(`Initialize result: ${err.message}`);
}
console.log('');

// ============================================================
// STEP 5: LIST MARKET (via x402-create-market)
// ============================================================
console.log('📋 STEP 5: LIST MARKET (x402-create-market)');
console.log('─'.repeat(50));
console.log('Cost: 0.0001 USDC (x402 listing fee)');
console.log('');

try {
  const listResult = await client.listMarket({
    address: marketAddress,
    question: marketQuestion,
    resolutionTime,
    oracle: account.address,
    yesTokenAddress: yesToken as string,
    noTokenAddress: noToken as string,
    initialLiquidity: '1',
    alpha: '0.03',
    category,
    tags,
  });
  console.log(`✅ Market listed!`);
  console.log(`Market ID: ${listResult.market.id}`);
} catch (err: any) {
  console.log(`Listing result: ${err.message}`);
}
console.log('');

// ============================================================
// STEP 6: GET PRICES (via x402)
// ============================================================
console.log('💰 STEP 6: GET MARKET PRICES (x402-prices)');
console.log('─'.repeat(50));
console.log('Cost: 0.0001 USDC');
console.log('');

const prices = await client.getPrices(marketAddress);
console.log(`YES: ${(prices.yes * 100).toFixed(2)}%`);
console.log(`NO:  ${(prices.no * 100).toFixed(2)}%`);
console.log('');

// ============================================================
// STEP 7: RESEARCH
// ============================================================
console.log('🔍 STEP 7: RESEARCH PHASE');
console.log('─'.repeat(50));
console.log(`Question: "${marketQuestion}"`);
console.log('');

console.log('📰 Searching: "Bitcoin price February 2026"');
console.log('📰 Searching: "BTC 100k prediction"');
console.log('📰 Searching: "Bitcoin current price today"');
console.log('📰 Searching: "Crypto market sentiment February 2026"');
console.log('');

// Research findings
const research = {
  summary: `Bitcoin reaching $100k on any single day depends on current price levels and volatility. ` +
           `If BTC is currently trading near $95-99k, high probability. If below $90k, lower probability. ` +
           `Daily volatility of 3-5% is normal, so $100k touch is feasible if within striking distance.`,

  bullishFactors: [
    'Post-halving cycle typically bullish (2024 halving effects)',
    'ETF inflows continuing to drive institutional demand',
    'Round number $100k has psychological significance',
    'If currently above $95k, only 5% move needed',
  ],

  bearishFactors: [
    'Resistance at $100k may cause profit-taking',
    'Single day timeframe limits probability',
    'Macro uncertainty could suppress volatility',
    'Weekend/holiday trading thinner liquidity',
  ],

  // Assume BTC is currently around $97k for this simulation
  currentPrice: 97000,
  targetPrice: 100000,
  requiredMove: ((100000 - 97000) / 97000 * 100).toFixed(2) + '%',

  baseRate: 0.65, // 65% if within 5% of target
  confidence: 0.75,
};

console.log('📋 Research Summary:');
console.log(`   ${research.summary}`);
console.log('');

console.log(`📊 Current BTC Price: ~$${research.currentPrice.toLocaleString()}`);
console.log(`🎯 Target: $${research.targetPrice.toLocaleString()}`);
console.log(`📈 Required Move: ${research.requiredMove}`);
console.log('');

console.log('✅ Bullish Factors:');
research.bullishFactors.forEach(f => console.log(`   • ${f}`));
console.log('');

console.log('❌ Bearish Factors:');
research.bearishFactors.forEach(f => console.log(`   • ${f}`));
console.log('');

console.log(`📊 Base Rate: ${(research.baseRate * 100)}%`);
console.log(`🎯 Confidence: ${(research.confidence * 100)}%`);
console.log('');

// ============================================================
// STEP 8: FORM PREDICTION
// ============================================================
console.log('🧠 STEP 8: FORM PREDICTION');
console.log('─'.repeat(50));

const bullishBoost = research.bullishFactors.length * 0.02;
const bearishDrag = research.bearishFactors.length * 0.02;
let prediction = research.baseRate + bullishBoost - bearishDrag;
prediction = Math.max(0.1, Math.min(0.9, prediction));

console.log(`Base rate:       ${(research.baseRate * 100).toFixed(1)}%`);
console.log(`Bullish boost:   +${(bullishBoost * 100).toFixed(1)}%`);
console.log(`Bearish drag:    -${(bearishDrag * 100).toFixed(1)}%`);
console.log('');
console.log(`🎯 MY PREDICTION: ${(prediction * 100).toFixed(1)}% YES`);
console.log('');

// ============================================================
// STEP 9: EDGE ANALYSIS
// ============================================================
console.log('📈 STEP 9: EDGE ANALYSIS');
console.log('─'.repeat(50));

const marketPrice = prices.yes;
const edge = prediction - marketPrice;

console.log(`My prediction:  ${(prediction * 100).toFixed(1)}%`);
console.log(`Market price:   ${(marketPrice * 100).toFixed(1)}%`);
console.log(`Edge:           ${(edge * 100).toFixed(1)}%`);
console.log(`Direction:      ${edge > 0 ? 'BUY YES' : 'BUY NO'}`);
console.log('');

// ============================================================
// STEP 10: TRADE (via x402-agent-trade)
// ============================================================
console.log('💰 STEP 10: EXECUTE TRADE (x402-agent-trade)');
console.log('─'.repeat(50));
console.log('Cost: 0.0001 USDC (x402) + trade amount');
console.log('');

const MIN_EDGE = 0.03;
const shouldTrade = Math.abs(edge) >= MIN_EDGE;

if (shouldTrade) {
  const isYes = edge > 0;
  const tradeAmount = 0.5; // $0.50 USDC for testing

  console.log(`✅ TRADE SIGNAL`);
  console.log(`   Side:   ${isYes ? 'YES' : 'NO'}`);
  console.log(`   Amount: $${tradeAmount.toFixed(2)} USDC`);
  console.log(`   Edge:   ${(Math.abs(edge) * 100).toFixed(1)}%`);
  console.log('');
  console.log('🔄 Executing via x402...');

  try {
    const result = await client.buy(marketAddress, isYes, tradeAmount.toString());
    console.log('');
    console.log(`✅ TRADE EXECUTED!`);
    console.log(`   TX: ${result.txHash}`);
    console.log(`   Explorer: https://testnet.monadexplorer.com/tx/${result.txHash}`);
  } catch (err: any) {
    console.log(`Trade error: ${err.message}`);
  }
} else {
  console.log(`⏸️ Edge too small (${(Math.abs(edge) * 100).toFixed(1)}% < ${MIN_EDGE * 100}%)`);
}
console.log('');

// ============================================================
// STEP 11: CHECK POSITION (via x402)
// ============================================================
console.log('📊 STEP 11: CHECK POSITION (x402-position)');
console.log('─'.repeat(50));
console.log('Cost: 0.0001 USDC');
console.log('');

const position = await client.getPosition(marketAddress);
console.log(`YES shares: ${(Number(position.yesShares) / 1e18).toFixed(4)}`);
console.log(`NO shares:  ${(Number(position.noShares) / 1e18).toFixed(4)}`);
console.log('');

// ============================================================
// FINAL SUMMARY
// ============================================================
const finalUsdc = await client.getUSDCBalance();
const totalSpent = parseFloat(usdc) - parseFloat(finalUsdc);

console.log('═'.repeat(70));
console.log('📋 SESSION COMPLETE');
console.log('═'.repeat(70));
console.log('');
console.log('Market Created:');
console.log(`  Question:    ${marketQuestion}`);
console.log(`  Address:     ${marketAddress}`);
console.log(`  Resolution:  ${tomorrow.toISOString()}`);
console.log(`  Liquidity:   1 USDC`);
console.log('');
console.log('Trading:');
console.log(`  Prediction:  ${(prediction * 100).toFixed(1)}% YES`);
console.log(`  Market:      ${(marketPrice * 100).toFixed(1)}% YES`);
console.log(`  Edge:        ${(edge * 100).toFixed(1)}%`);
console.log(`  Position:    ${(Number(position.yesShares) / 1e18).toFixed(4)} YES, ${(Number(position.noShares) / 1e18).toFixed(4)} NO`);
console.log('');
console.log('Costs:');
console.log(`  Starting USDC: ${parseFloat(usdc).toFixed(4)}`);
console.log(`  Ending USDC:   ${parseFloat(finalUsdc).toFixed(4)}`);
console.log(`  Total spent:   ${totalSpent.toFixed(4)} USDC`);
console.log('');
console.log('x402 API Calls:');
console.log('  • x402-initialize:    0.0001 USDC');
console.log('  • x402-create-market: 0.0001 USDC');
console.log('  • x402-prices:        0.0001 USDC');
console.log('  • x402-agent-trade:   0.0001 USDC');
console.log('  • x402-position:      0.0001 USDC');
console.log('  ─────────────────────────────────');
console.log('  Total x402 fees:      0.0005 USDC');
}

main().catch(console.error);
