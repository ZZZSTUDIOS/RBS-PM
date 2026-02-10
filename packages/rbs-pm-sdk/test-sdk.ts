// Test the SDK with automatic x402 payments
// Run with: npx ts-node test-sdk.ts

import { RBSPMClient } from './dist/index.js';

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY environment variable');
  process.exit(1);
}

async function main() {
  console.log('🚀 Testing RBS PM SDK with x402 payments\n');

  // Initialize client with private key
  const client = new RBSPMClient({
    privateKey: PRIVATE_KEY,
  });

  console.log(`📍 Wallet: ${client.getAddress()}`);
  console.log(`💰 x402 payment capability: ${client.hasPaymentCapability()}\n`);

  // Check USDC balance
  const balance = await client.getUSDCBalance();
  console.log(`💵 USDC Balance: ${balance} USDC\n`);

  // Test: Get markets (x402 protected - 0.0001 USDC)
  console.log('📊 Fetching markets (costs 0.0001 USDC)...');
  try {
    const markets = await client.getMarkets();
    console.log(`✅ Found ${markets.length} markets:`);
    for (const market of markets) {
      // API returns snake_case from database
      const m = market as unknown as { question: string; address: string; yes_price: number; no_price: number };
      console.log(`   - ${m.question}`);
      console.log(`     Address: ${m.address}`);
      console.log(`     YES: ${(m.yes_price * 100).toFixed(1)}% | NO: ${(m.no_price * 100).toFixed(1)}%`);
    }
  } catch (err) {
    console.error('❌ Failed:', err);
  }

  console.log('\n✨ Test complete!');
}

main().catch(console.error);
