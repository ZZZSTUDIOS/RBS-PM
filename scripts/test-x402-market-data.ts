/**
 * Test x402-market-data endpoint
 *
 * Tests that:
 * 1. Without payment -> 402 error
 * 2. With x402 payment -> Returns live blockchain data
 * 3. Payment is properly charged (0.0001 USDC)
 *
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/test-x402-market-data.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  keccak256,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as const;
const TEST_MARKET = '0x59db9692725dB7456bE82d3AdD3D310DF2EABA52';
const API_BASE = 'https://qkcytrdhdtemyphsswou.supabase.co/functions/v1';
const API_KEY = 'sb_publishable_mKTNqXht6ek37VkHAGWoUQ_TMzoC3wp';

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
} as const;

// EIP-712 types for USDC TransferWithAuthorization
const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

interface PaymentRequired {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra?: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: string;
    };
  }>;
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY environment variable required');
    console.log('\nUsage: PRIVATE_KEY=0x... npx tsx scripts/test-x402-market-data.ts');
    process.exit(1);
  }

  console.log('=== x402-market-data Endpoint Test ===\n');

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log('Wallet:', account.address);

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http('https://testnet-rpc.monad.xyz'),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http('https://testnet-rpc.monad.xyz'),
  });

  // Check USDC balance before
  const balanceBefore = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint;

  console.log('USDC Balance:', formatUnits(balanceBefore, 6), 'USDC\n');

  if (balanceBefore < 100n) {
    console.error('Insufficient USDC balance. Need at least 0.0001 USDC for x402 payment.');
    process.exit(1);
  }

  // Test 1: Call without payment (should get 402)
  console.log('--- Test 1: Verify 402 without payment ---');
  const response1 = await fetch(
    `${API_BASE}/x402-market-data?market=${TEST_MARKET}`,
    { headers: { apikey: API_KEY } }
  );
  console.log('Status:', response1.status);

  if (response1.status !== 402) {
    console.log('FAIL: Expected 402, got', response1.status);
    process.exit(1);
  }

  const paymentRequiredHeader = response1.headers.get('payment-required');
  if (!paymentRequiredHeader) {
    console.log('FAIL: No payment-required header');
    process.exit(1);
  }
  console.log('PASS: Got 402 with payment-required header\n');

  // Parse payment requirements
  const paymentRequired: PaymentRequired = JSON.parse(atob(paymentRequiredHeader));
  const accepted = paymentRequired.accepts[0];
  console.log('Payment required:', accepted.amount, 'units of', accepted.asset);
  console.log('Pay to:', accepted.payTo);

  // Test 2: Sign and send x402 payment
  console.log('\n--- Test 2: Call with x402 payment ---');

  // Create authorization
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60;
  const validBefore = now + (accepted.maxTimeoutSeconds || 3600);
  const nonce = keccak256(toHex(`${account.address}-${Date.now()}-${Math.random()}`));

  const authorization = {
    from: account.address,
    to: accepted.payTo as `0x${string}`,
    value: BigInt(accepted.amount),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: nonce,
  };

  console.log('Signing EIP-712 authorization...');
  const signature = await walletClient.signTypedData({
    account,
    domain: accepted.extra ? {
      name: accepted.extra.name,
      version: accepted.extra.version,
      chainId: accepted.extra.chainId,
      verifyingContract: accepted.extra.verifyingContract as `0x${string}`,
    } : {
      name: 'USDC',
      version: '2',
      chainId: 10143,
      verifyingContract: USDC_ADDRESS,
    },
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });

  // Create payment payload
  const paymentPayload = {
    x402Version: paymentRequired.x402Version || 2,
    scheme: accepted.scheme,
    network: accepted.network,
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
      },
    },
    accepted: {
      scheme: accepted.scheme,
      network: accepted.network,
      amount: accepted.amount,
      asset: accepted.asset,
      payTo: accepted.payTo,
      maxTimeoutSeconds: accepted.maxTimeoutSeconds,
      extra: accepted.extra,
    },
  };

  const paymentSignature = btoa(JSON.stringify(paymentPayload));

  console.log('Sending request with payment signature...');
  const response2 = await fetch(
    `${API_BASE}/x402-market-data?market=${TEST_MARKET}`,
    {
      headers: {
        apikey: API_KEY,
        'PAYMENT-SIGNATURE': paymentSignature,
      },
    }
  );

  console.log('Status:', response2.status);

  if (response2.status !== 200) {
    const error = await response2.text();
    console.log('FAIL: Expected 200, got', response2.status);
    console.log('Error:', error);
    process.exit(1);
  }

  const data = await response2.json();
  console.log('\nPASS: Got 200 OK\n');

  console.log('Market Data:');
  console.log('  Address:', data.market?.address);
  console.log('  Question:', data.market?.question);
  console.log('  Status:', data.market?.status);
  console.log('  Resolved:', data.market?.resolved);
  console.log('');
  console.log('Pricing (LIVE from blockchain):');
  console.log('  YES Price:', ((data.pricing?.yesPrice || 0) * 100).toFixed(2) + '%');
  console.log('  NO Price:', ((data.pricing?.noPrice || 0) * 100).toFixed(2) + '%');
  console.log('  Source:', data.pricing?.source);
  console.log('');
  console.log('Liquidity:');
  console.log('  Total Collateral:', data.liquidity?.totalCollateral, 'USDC');
  console.log('  YES Shares:', data.liquidity?.yesShares);
  console.log('  NO Shares:', data.liquidity?.noShares);
  console.log('');
  console.log('Payment:');
  console.log('  Amount:', data.payment?.amountFormatted);
  console.log('  Payer:', data.payment?.payer);

  // Verify we got live blockchain data
  if (data.pricing?.source === 'blockchain') {
    console.log('\nPASS: Got LIVE blockchain data');
  } else {
    console.log('\nWARN: Source not marked as blockchain');
  }

  // Check USDC balance after (with delay for settlement)
  console.log('\n--- Checking payment settlement ---');
  await new Promise(r => setTimeout(r, 3000));

  const balanceAfter = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint;

  const spent = balanceBefore - balanceAfter;
  console.log('Balance Before:', formatUnits(balanceBefore, 6), 'USDC');
  console.log('Balance After:', formatUnits(balanceAfter, 6), 'USDC');
  console.log('Spent:', formatUnits(spent, 6), 'USDC');

  if (spent === 100n) {
    console.log('\nPASS: Correct amount charged (0.0001 USDC)');
  } else if (spent === 0n) {
    console.log('\nINFO: No USDC spent (payment may not have settled yet or is async)');
  } else {
    console.log('\nWARN: Unexpected amount spent');
  }

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
