/**
 * Example: Create a Prediction Market on Monad using Doppler
 * 
 * This script demonstrates the full flow:
 * 1. Create YES and NO outcome tokens via Doppler
 * 2. Deploy the prediction market contract
 * 3. Fund the market with collateral
 * 4. Trade tokens (users buy YES/NO based on their predictions)
 * 5. Resolve the market
 * 6. Redeem winning tokens
 */

import { parseEther, formatEther, type Address } from 'viem';
import { DopplerPredictionMarketSDK, Outcome, monadTestnet, ADDRESSES } from './sdk';

// For actual Doppler integration
// import { DopplerSDK, MulticurveBuilder } from '@whetstone-research/doppler-sdk';

async function main() {
  console.log('🎯 Doppler Prediction Market on Monad\n');
  console.log('='.repeat(50));

  // ============================================================
  // STEP 1: Initialize SDK
  // ============================================================
  
  const sdk = new DopplerPredictionMarketSDK();
  
  // In production, set your private key from environment
  // sdk.setWallet(process.env.PRIVATE_KEY as `0x${string}`);
  
  console.log('\n📌 Network:', monadTestnet.name);
  console.log('📌 Chain ID:', monadTestnet.id);
  console.log('📌 RPC:', monadTestnet.rpcUrls.default.http[0]);

  // ============================================================
  // STEP 2: Define the prediction market
  // ============================================================
  
  const marketConfig = {
    question: 'Will ETH hit $10,000 by end of 2026?',
    resolutionTime: new Date('2026-12-31T23:59:59Z'),
    oracle: '0xYourOracleAddress' as Address, // Who can resolve
    
    // YES outcome token
    yesToken: {
      name: 'ETH10K-YES',
      symbol: 'YES-ETH10K',
      tokenURI: 'https://api.yourapp.com/metadata/eth10k-yes.json',
      initialSupply: parseEther('1000000000'),   // 1B tokens
      numTokensToSell: parseEther('900000000'),  // 900M for sale
    },
    
    // NO outcome token
    noToken: {
      name: 'ETH10K-NO',
      symbol: 'NO-ETH10K',
      tokenURI: 'https://api.yourapp.com/metadata/eth10k-no.json',
      initialSupply: parseEther('1000000000'),
      numTokensToSell: parseEther('900000000'),
    },
  };

  console.log('\n📋 Market Configuration:');
  console.log(`   Question: "${marketConfig.question}"`);
  console.log(`   Resolution: ${marketConfig.resolutionTime.toISOString()}`);

  // ============================================================
  // STEP 3: Create outcome tokens with Doppler
  // ============================================================
  
  console.log('\n🚀 Creating outcome tokens via Doppler...\n');
  
  // Here's the actual Doppler SDK code you'd use:
  const dopplerCode = `
// Initialize Doppler SDK
import { DopplerSDK } from '@whetstone-research/doppler-sdk';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Define Monad testnet (or use from SDK if available)
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'Monad', symbol: 'MON' },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
};

const account = privateKeyToAccount(process.env.PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const walletClient = createWalletClient({
  chain: monadTestnet,
  transport: http(),
  account,
});

const sdk = new DopplerSDK({
  publicClient,
  walletClient,
  chainId: monadTestnet.id,
});

// WMON address on Monad testnet
const WMON = '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541';

// Create YES token
const yesParams = sdk
  .buildMulticurveAuction()
  .tokenConfig({
    name: 'ETH10K-YES',
    symbol: 'YES-ETH10K',
    tokenURI: 'https://api.yourapp.com/metadata/eth10k-yes.json',
  })
  .saleConfig({
    initialSupply: parseEther('1000000000'),
    numTokensToSell: parseEther('900000000'),
    numeraire: WMON,
  })
  .withCurves({
    numerairePrice: 1, // MON price in USD (adjust as needed)
    curves: [
      // Price starts very low ($0.001 market cap)
      // This creates a classic prediction market dynamic
      {
        marketCap: { start: 1_000, end: 10_000 },
        numPositions: 5,
        shares: parseEther('0.3'),
      },
      {
        marketCap: { start: 10_000, end: 100_000 },
        numPositions: 10,
        shares: parseEther('0.5'),
      },
      {
        marketCap: { start: 100_000, end: 'max' },
        numPositions: 5,
        shares: parseEther('0.2'),
      },
    ],
  })
  .withGovernance({ type: 'noOp' })
  .withMigration({ type: 'noOp' })
  .withUserAddress(account.address)
  .build();

console.log('Creating YES token...');
const yesResult = await sdk.factory.createMulticurve(yesParams);
console.log('YES Token:', yesResult.tokenAddress);
console.log('YES Pool:', yesResult.poolId);

// Create NO token (same config, different name)
const noParams = sdk
  .buildMulticurveAuction()
  .tokenConfig({
    name: 'ETH10K-NO',
    symbol: 'NO-ETH10K',
    tokenURI: 'https://api.yourapp.com/metadata/eth10k-no.json',
  })
  .saleConfig({
    initialSupply: parseEther('1000000000'),
    numTokensToSell: parseEther('900000000'),
    numeraire: WMON,
  })
  .withCurves({
    numerairePrice: 1,
    curves: [
      {
        marketCap: { start: 1_000, end: 10_000 },
        numPositions: 5,
        shares: parseEther('0.3'),
      },
      {
        marketCap: { start: 10_000, end: 100_000 },
        numPositions: 10,
        shares: parseEther('0.5'),
      },
      {
        marketCap: { start: 100_000, end: 'max' },
        numPositions: 5,
        shares: parseEther('0.2'),
      },
    ],
  })
  .withGovernance({ type: 'noOp' })
  .withMigration({ type: 'noOp' })
  .withUserAddress(account.address)
  .build();

console.log('Creating NO token...');
const noResult = await sdk.factory.createMulticurve(noParams);
console.log('NO Token:', noResult.tokenAddress);
console.log('NO Pool:', noResult.poolId);
`;

  console.log('📝 Doppler SDK Code for creating tokens:');
  console.log('-'.repeat(50));
  console.log(dopplerCode);
  console.log('-'.repeat(50));

  // ============================================================
  // STEP 4: Deploy Prediction Market Contract
  // ============================================================
  
  console.log('\n📄 After creating tokens, deploy the prediction market:\n');
  
  const deployCode = `
// After you have token addresses from Doppler
const YES_TOKEN = '0x...'; // From Doppler
const NO_TOKEN = '0x...';  // From Doppler

// Deploy using Foundry
// forge create contracts/PredictionMarketFactory.sol:PredictionMarketFactory \\
//   --rpc-url https://testnet-rpc.monad.xyz \\
//   --private-key $PRIVATE_KEY \\
//   --constructor-args $DOPPLER_AIRLOCK $WMON

// Or using the factory (if already deployed)
const { marketAddress, txHash } = await sdk.createMarket(
  YES_TOKEN,
  NO_TOKEN,
  "${marketConfig.question}",
  new Date('${marketConfig.resolutionTime.toISOString()}'),
  '${marketConfig.oracle}' // Oracle address
);

console.log('Market created at:', marketAddress);
`;

  console.log(deployCode);

  // ============================================================
  // STEP 5: Trading Flow
  // ============================================================
  
  console.log('\n💱 Trading Outcome Tokens:\n');
  
  const tradingCode = `
// Users buy YES or NO tokens based on their prediction
// Trading happens directly on Doppler's bonding curves

import { DopplerSDK, Quoter } from '@whetstone-research/doppler-sdk';

// Get a quote for buying YES tokens
const quoter = new Quoter(publicClient, monadTestnet.id);

// Buy YES tokens (think outcome will happen)
const buyYesQuote = await quoter.quoteExactInputV4({
  poolKey: {
    currency0: WMON,  // Paying with WMON
    currency1: YES_TOKEN,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: 8,
    hooks: yesHookAddress,
  },
  zeroForOne: true,  // WMON -> YES
  exactAmount: parseEther('10'), // Spend 10 WMON
  hookData: '0x',
});

console.log('Buy 10 WMON worth of YES tokens:');
console.log('  Expected YES tokens:', formatEther(buyYesQuote.amountOut));

// Execute swap via Universal Router
// (See Doppler docs for swap execution)
`;

  console.log(tradingCode);

  // ============================================================
  // STEP 6: Resolution & Redemption
  // ============================================================
  
  console.log('\n🏁 Resolution & Redemption:\n');
  
  const resolutionCode = `
// After the event happens, oracle resolves the market

// Oracle resolves to YES (ETH did hit $10k)
await sdk.resolveMarket(marketAddress, Outcome.YES);

// Check market status
const status = await sdk.getMarketStatus(marketAddress);
console.log('Market resolved:', status.resolved);
console.log('Winning outcome:', status.outcomeName);

// Winners redeem their tokens
const yesBalance = await sdk.getTokenBalance(YES_TOKEN, userAddress);
const redemptionValue = await sdk.getRedemptionValue(marketAddress, yesBalance);

console.log('Your YES tokens:', formatEther(yesBalance));
console.log('Redemption value:', formatEther(redemptionValue), 'WMON');

// Redeem!
await sdk.redeem(marketAddress, yesBalance);
console.log('✅ Tokens redeemed!');
`;

  console.log(resolutionCode);

  // ============================================================
  // Summary
  // ============================================================
  
  console.log('\n' + '='.repeat(50));
  console.log('📚 Summary - How It Works');
  console.log('='.repeat(50));
  
  console.log(`
1. OUTCOME TOKENS
   - YES and NO tokens are launched via Doppler's multicurve auctions
   - Each token has its own bonding curve for price discovery
   - Traders buy tokens based on their predictions

2. PRICE DYNAMICS
   - If more people think YES → YES token price goes up
   - If more people think NO → NO token price goes up
   - Prices reflect market consensus probability

3. RESOLUTION
   - After the event, oracle resolves to YES, NO, or INVALID
   - Winning token holders can redeem for collateral
   - Losing tokens become worthless

4. REDEMPTION
   - Collateral is distributed to winning token holders
   - Rate = Total Collateral / Winning Token Supply

KEY FILES:
- contracts/PredictionMarket.sol     - Market resolution + redemption
- contracts/PredictionMarketFactory.sol - Factory for creating markets
- src/sdk.ts                         - TypeScript SDK

NEXT STEPS:
1. Get WMON from a faucet on Monad testnet
2. Deploy the factory contract
3. Create tokens with Doppler SDK
4. Create your first market!
`);

  console.log('\n✨ Happy predicting on Monad!\n');
}

// Run
main().catch(console.error);
