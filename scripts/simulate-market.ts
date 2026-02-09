/**
 * Market Simulation - Testing redemption solvency
 *
 * This simulates trades and verifies winning shares can redeem for 1 MON
 */

// Simplified LMSR cost function
function costFunction(yesShares: number, noShares: number, alpha: number, minLiquidity: number): number {
  const totalShares = yesShares + noShares;
  let b = alpha * totalShares;
  if (b < minLiquidity) b = minLiquidity;

  const expYes = Math.exp(yesShares / b);
  const expNo = Math.exp(noShares / b);

  return b * Math.log(expYes + expNo);
}

function getCost(currentYes: number, currentNo: number, shares: number, isYes: boolean, alpha: number, minLiquidity: number): number {
  const newYes = isYes ? currentYes + shares : currentYes;
  const newNo = isYes ? currentNo : currentNo + shares;

  const newCost = costFunction(newYes, newNo, alpha, minLiquidity);
  const currentCost = costFunction(currentYes, currentNo, alpha, minLiquidity);

  return Math.max(0, newCost - currentCost);
}

function getPrice(yesShares: number, noShares: number, alpha: number, minLiquidity: number): { yes: number; no: number } {
  const totalShares = yesShares + noShares;
  let b = alpha * totalShares;
  if (b < minLiquidity) b = minLiquidity;

  const expYes = Math.exp(yesShares / b);
  const expNo = Math.exp(noShares / b);
  const sum = expYes + expNo;

  return {
    yes: expYes / sum,
    no: expNo / sum,
  };
}

// Simulation
console.log('=== MARKET SIMULATION ===\n');

const ALPHA = 0.03;  // 3% spread parameter
const MIN_LIQUIDITY = 10;  // Minimum b
const FEE_RATE = 0.01;  // 1% trading fee
const INITIAL_SHARES = 100;  // Initial seed for both outcomes
const CREATOR_BUFFER = 10;  // Creator's liquidity buffer in MON (minimum required)

// Market state
let yesShares = INITIAL_SHARES;
let noShares = INITIAL_SHARES;
let totalCollateral = CREATOR_BUFFER;
let creatorFees = 0;
let protocolFees = 0;

// Track minted tokens (what users actually hold)
const userTokens: { [user: string]: { yes: number; no: number } } = {};

function buyShares(user: string, isYes: boolean, sharesToBuy: number) {
  const prices = getPrice(yesShares, noShares, ALPHA, MIN_LIQUIDITY);
  const cost = getCost(yesShares, noShares, sharesToBuy, isYes, ALPHA, MIN_LIQUIDITY);

  const fee = cost * FEE_RATE;
  const protocolShare = fee / 2;
  const creatorShare = fee - protocolShare;
  const costAfterFee = cost - fee;

  // Update state
  if (isYes) {
    yesShares += sharesToBuy;
  } else {
    noShares += sharesToBuy;
  }
  totalCollateral += costAfterFee;
  creatorFees += creatorShare;
  protocolFees += protocolShare;

  // Track user tokens
  if (!userTokens[user]) {
    userTokens[user] = { yes: 0, no: 0 };
  }
  if (isYes) {
    userTokens[user].yes += sharesToBuy;
  } else {
    userTokens[user].no += sharesToBuy;
  }

  console.log(`${user} buys ${sharesToBuy} ${isYes ? 'YES' : 'NO'} @ ${(isYes ? prices.yes : prices.no).toFixed(4)}`);
  console.log(`  Cost: ${cost.toFixed(4)} MON (fee: ${fee.toFixed(4)})`);
  console.log(`  Collateral added: ${costAfterFee.toFixed(4)} MON`);
  console.log(`  Total collateral: ${totalCollateral.toFixed(4)} MON\n`);
}

// Simulate trades
console.log('--- Initial State ---');
console.log(`Creator buffer: ${CREATOR_BUFFER} MON`);
console.log(`Initial shares: YES=${yesShares}, NO=${noShares}`);
console.log(`Starting prices: YES=${getPrice(yesShares, noShares, ALPHA, MIN_LIQUIDITY).yes.toFixed(4)}, NO=${getPrice(yesShares, noShares, ALPHA, MIN_LIQUIDITY).no.toFixed(4)}\n`);

console.log('--- Trades ---\n');

// EXTREME imbalanced scenario - everyone buys one side
buyShares('Alice', true, 100);
buyShares('Bob', true, 100);
buyShares('Carol', true, 100);
buyShares('Dave', true, 100);
buyShares('Eve', true, 100);
// Only one small NO bet
buyShares('Frank', false, 10);

// Summary
console.log('--- Final State Before Resolution ---');
console.log(`YES shares: ${yesShares} (minted: ${yesShares - INITIAL_SHARES})`);
console.log(`NO shares: ${noShares} (minted: ${noShares - INITIAL_SHARES})`);
console.log(`Total collateral: ${totalCollateral.toFixed(4)} MON`);
console.log(`Creator fees accrued: ${creatorFees.toFixed(4)} MON`);
console.log(`Protocol fees sent: ${protocolFees.toFixed(4)} MON\n`);

const prices = getPrice(yesShares, noShares, ALPHA, MIN_LIQUIDITY);
console.log(`Final prices: YES=${prices.yes.toFixed(4)}, NO=${prices.no.toFixed(4)}`);
console.log(`Price sum: ${(prices.yes + prices.no).toFixed(4)} (spread = ${((prices.yes + prices.no - 1) * 100).toFixed(2)}%)\n`);

// Resolution scenarios
console.log('=== RESOLUTION SCENARIOS ===\n');

// Scenario 1: YES wins
console.log('--- If YES wins ---');
const yesMinted = yesShares - INITIAL_SHARES;
const yesRedemptionNeeded = yesMinted; // 1 MON per share
console.log(`Winning tokens to redeem: ${yesMinted}`);
console.log(`MON needed (1 per share): ${yesRedemptionNeeded.toFixed(4)} MON`);
console.log(`Collateral available: ${totalCollateral.toFixed(4)} MON`);
const yesShortfall = yesRedemptionNeeded - totalCollateral;
if (yesShortfall > 0) {
  console.log(`❌ SHORTFALL: ${yesShortfall.toFixed(4)} MON`);
  console.log(`   Winners would get ${(totalCollateral / yesMinted).toFixed(4)} MON per share`);
} else {
  console.log(`✓ SOLVENT: Excess ${(-yesShortfall).toFixed(4)} MON`);
}

console.log('\nUser holdings:');
for (const [user, tokens] of Object.entries(userTokens)) {
  if (tokens.yes > 0) {
    console.log(`  ${user}: ${tokens.yes} YES tokens → ${tokens.yes.toFixed(4)} MON`);
  }
}

// Scenario 2: NO wins
console.log('\n--- If NO wins ---');
const noMinted = noShares - INITIAL_SHARES;
const noRedemptionNeeded = noMinted; // 1 MON per share
console.log(`Winning tokens to redeem: ${noMinted}`);
console.log(`MON needed (1 per share): ${noRedemptionNeeded.toFixed(4)} MON`);
console.log(`Collateral available: ${totalCollateral.toFixed(4)} MON`);
const noShortfall = noRedemptionNeeded - totalCollateral;
if (noShortfall > 0) {
  console.log(`❌ SHORTFALL: ${noShortfall.toFixed(4)} MON`);
  console.log(`   Winners would get ${(totalCollateral / noMinted).toFixed(4)} MON per share`);
} else {
  console.log(`✓ SOLVENT: Excess ${(-noShortfall).toFixed(4)} MON`);
}

console.log('\nUser holdings:');
for (const [user, tokens] of Object.entries(userTokens)) {
  if (tokens.no > 0) {
    console.log(`  ${user}: ${tokens.no} NO tokens → ${tokens.no.toFixed(4)} MON`);
  }
}

// Calculate required buffer
console.log('\n=== BUFFER ANALYSIS ===');
const maxRedemption = Math.max(yesMinted, noMinted);
const collateralFromTrades = totalCollateral - CREATOR_BUFFER;
const requiredBuffer = maxRedemption - collateralFromTrades;
console.log(`Max possible redemption: ${maxRedemption} MON`);
console.log(`Collateral from trades: ${collateralFromTrades.toFixed(4)} MON`);
console.log(`Current buffer: ${CREATOR_BUFFER} MON`);
console.log(`Required buffer for solvency: ${Math.max(0, requiredBuffer).toFixed(4)} MON`);
