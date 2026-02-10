/**
 * Script to claim creator fees from all markets
 *
 * Usage: npx tsx scripts/claim-all-fees.ts
 *
 * This script will:
 * 1. Load all markets from the provided list
 * 2. Check pending creator fees for each market
 * 3. Claim fees from each market where fees > 0
 *
 * Requirements:
 * - Set PRIVATE_KEY environment variable for the market creator wallet
 * - Markets must have the connected wallet as marketCreator
 * - Market must be resolved or past resolution time to claim fees
 *
 * Note: Trading fee is 0.5% and goes 100% to market creator (no protocol fee)
 */

import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Monad Testnet configuration
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    name: 'MON',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
} as const;

// LS-LMSR ABI (minimal for fee claiming)
const LSLMSR_ABI = [
  {
    name: 'getFeeInfo',
    type: 'function',
    inputs: [],
    outputs: [{ name: 'pendingCreatorFees', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'claimCreatorFees',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'marketCreator',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'resolved',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'resolutionTime',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Add your market addresses here, or they will be loaded from localStorage backup
const MARKET_ADDRESSES: `0x${string}`[] = [
  // Add market addresses here, e.g.:
  // '0x1234567890123456789012345678901234567890',
];

async function main() {
  // Check for private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY environment variable not set');
    console.log('\nUsage: PRIVATE_KEY=0x... npx tsx scripts/claim-all-fees.ts');
    process.exit(1);
  }

  // Create clients
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`\n🔑 Using wallet: ${account.address}`);

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  // Get markets to check
  let markets = [...MARKET_ADDRESSES];

  if (markets.length === 0) {
    console.log('\n⚠ No market addresses provided in script. Add them to MARKET_ADDRESSES array.');
    process.exit(0);
  }

  console.log(`\n📊 Checking ${markets.length} markets for claimable creator fees...\n`);
  console.log(`ℹ️  Note: 0.5% trading fee goes 100% to market creator (no protocol fee)\n`);

  let totalCreatorFees = 0n;
  let claimedCreator = 0n;
  const now = BigInt(Math.floor(Date.now() / 1000));

  for (const marketAddress of markets) {
    try {
      // Get fee info and market state
      const [pendingFees, marketCreator, resolved, resolutionTime] = await Promise.all([
        publicClient.readContract({
          address: marketAddress,
          abi: LSLMSR_ABI,
          functionName: 'getFeeInfo',
        }) as Promise<bigint>,
        publicClient.readContract({
          address: marketAddress,
          abi: LSLMSR_ABI,
          functionName: 'marketCreator',
        }) as Promise<`0x${string}`>,
        publicClient.readContract({
          address: marketAddress,
          abi: LSLMSR_ABI,
          functionName: 'resolved',
        }) as Promise<boolean>,
        publicClient.readContract({
          address: marketAddress,
          abi: LSLMSR_ABI,
          functionName: 'resolutionTime',
        }) as Promise<bigint>,
      ]);

      totalCreatorFees += pendingFees;

      const isCreator = account.address.toLowerCase() === marketCreator.toLowerCase();
      const canClaim = isCreator && (resolved || now >= resolutionTime);

      console.log(`📍 Market: ${marketAddress}`);
      console.log(`   Creator fees: ${formatEther(pendingFees)} MON ${isCreator ? (canClaim ? '(can claim)' : '(market not resolved)') : ''}`);

      // Claim creator fees if eligible
      if (canClaim && pendingFees > 0n) {
        console.log(`   ⏳ Claiming creator fees...`);
        try {
          const hash = await walletClient.writeContract({
            address: marketAddress,
            abi: LSLMSR_ABI,
            functionName: 'claimCreatorFees',
          });
          await publicClient.waitForTransactionReceipt({ hash });
          console.log(`   ✅ Claimed ${formatEther(pendingFees)} MON (tx: ${hash.slice(0, 10)}...)`);
          claimedCreator += pendingFees;
        } catch (err: any) {
          console.log(`   ❌ Failed: ${err.shortMessage || err.message}`);
        }
      }

      console.log('');
    } catch (err: any) {
      console.log(`❌ Error checking ${marketAddress}: ${err.message}\n`);
    }
  }

  console.log('\n📈 Summary:');
  console.log(`   Total creator fees found: ${formatEther(totalCreatorFees)} MON`);
  console.log(`   Creator fees claimed: ${formatEther(claimedCreator)} MON`);
}

main().catch(console.error);
