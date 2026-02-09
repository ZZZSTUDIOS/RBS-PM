/**
 * Script to claim protocol fees from all markets
 *
 * Usage: npx tsx scripts/claim-all-fees.ts
 *
 * This script will:
 * 1. Load all markets from localStorage or the provided list
 * 2. Check pending protocol fees for each market
 * 3. Claim fees from each market where fees > 0
 *
 * Requirements:
 * - Set PRIVATE_KEY environment variable for the protocol fee recipient wallet
 * - Markets must have the connected wallet as protocolFeeRecipient
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
    name: 'getPendingFees',
    type: 'function',
    inputs: [],
    outputs: [
      { name: 'protocolFees', type: 'uint256' },
      { name: 'creatorFees', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'protocolFeeRecipient',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'claimProtocolFees',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
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
] as const;

// Default protocol fee recipient
const PROTOCOL_FEE_RECIPIENT = '0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE';

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

  console.log(`\n📊 Checking ${markets.length} markets for claimable fees...\n`);

  let totalProtocolFees = 0n;
  let totalCreatorFees = 0n;
  let claimedProtocol = 0n;
  let claimedCreator = 0n;

  for (const marketAddress of markets) {
    try {
      // Get pending fees
      const [pendingFees, protocolRecipient, marketCreator] = await Promise.all([
        publicClient.readContract({
          address: marketAddress,
          abi: LSLMSR_ABI,
          functionName: 'getPendingFees',
        }),
        publicClient.readContract({
          address: marketAddress,
          abi: LSLMSR_ABI,
          functionName: 'protocolFeeRecipient',
        }),
        publicClient.readContract({
          address: marketAddress,
          abi: LSLMSR_ABI,
          functionName: 'marketCreator',
        }),
      ]);

      const protocolFees = pendingFees[0];
      const creatorFees = pendingFees[1];

      totalProtocolFees += protocolFees;
      totalCreatorFees += creatorFees;

      const isProtocolRecipient = account.address.toLowerCase() === protocolRecipient.toLowerCase();
      const isCreator = account.address.toLowerCase() === marketCreator.toLowerCase();

      console.log(`📍 Market: ${marketAddress}`);
      console.log(`   Protocol fees: ${formatEther(protocolFees)} MON ${isProtocolRecipient ? '(can claim)' : ''}`);
      console.log(`   Creator fees: ${formatEther(creatorFees)} MON ${isCreator ? '(can claim)' : ''}`);

      // Claim protocol fees if eligible
      if (isProtocolRecipient && protocolFees > 0n) {
        console.log(`   ⏳ Claiming protocol fees...`);
        try {
          const hash = await walletClient.writeContract({
            address: marketAddress,
            abi: LSLMSR_ABI,
            functionName: 'claimProtocolFees',
          });
          await publicClient.waitForTransactionReceipt({ hash });
          console.log(`   ✅ Claimed ${formatEther(protocolFees)} MON (tx: ${hash.slice(0, 10)}...)`);
          claimedProtocol += protocolFees;
        } catch (err: any) {
          console.log(`   ❌ Failed: ${err.shortMessage || err.message}`);
        }
      }

      // Claim creator fees if eligible
      if (isCreator && creatorFees > 0n) {
        console.log(`   ⏳ Claiming creator fees...`);
        try {
          const hash = await walletClient.writeContract({
            address: marketAddress,
            abi: LSLMSR_ABI,
            functionName: 'claimCreatorFees',
          });
          await publicClient.waitForTransactionReceipt({ hash });
          console.log(`   ✅ Claimed ${formatEther(creatorFees)} MON (tx: ${hash.slice(0, 10)}...)`);
          claimedCreator += creatorFees;
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
  console.log(`   Total protocol fees found: ${formatEther(totalProtocolFees)} MON`);
  console.log(`   Total creator fees found: ${formatEther(totalCreatorFees)} MON`);
  console.log(`   Protocol fees claimed: ${formatEther(claimedProtocol)} MON`);
  console.log(`   Creator fees claimed: ${formatEther(claimedCreator)} MON`);
}

main().catch(console.error);
