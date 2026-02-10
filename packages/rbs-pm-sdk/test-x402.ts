// Test x402 payment flow for markets endpoint
// Run with: npx ts-node test-x402.ts

import { createWalletClient, createPublicClient, http, encodeFunctionData, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';

// ========== CONFIGURATION ==========
// Set your private key here (with 0x prefix)
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` || '0x...YOUR_PRIVATE_KEY_HERE...';

const API_BASE = 'https://qkcytrdhdtemyphsswou.supabase.co';
const API_KEY = 'sb_publishable_mKTNqXht6ek37VkHAGWoUQ_TMzoC3wp';
const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3';
const RECIPIENT = '0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE';
const AMOUNT = '100'; // 0.0001 USDC

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

const USDC_DOMAIN = {
  name: 'USDC',
  version: '2',
  chainId: 10143,
  verifyingContract: USDC_ADDRESS as `0x${string}`,
} as const;

async function testX402Markets() {
  console.log('🔐 Setting up wallet...');

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`   Wallet address: ${account.address}`);

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http('https://testnet-rpc.monad.xyz'),
  });

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http('https://testnet-rpc.monad.xyz'),
  });

  // Check USDC balance
  const usdcAbi = [
    { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  ] as const;

  const balance = await publicClient.readContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [account.address],
  });

  console.log(`   USDC Balance: ${Number(balance) / 1e6} USDC`);

  if (balance < BigInt(AMOUNT)) {
    console.error('❌ Insufficient USDC balance! Need at least 0.0001 USDC');
    process.exit(1);
  }

  // Step 1: Get payment requirements from 402 response
  console.log('\n📋 Step 1: Getting payment requirements...');

  const initialResponse = await fetch(`${API_BASE}/functions/v1/x402-markets`, {
    headers: { 'apikey': API_KEY },
  });

  if (initialResponse.status !== 402) {
    console.log('   Unexpected status:', initialResponse.status);
    const body = await initialResponse.text();
    console.log('   Response:', body);
    return;
  }

  const paymentRequired = initialResponse.headers.get('payment-required');
  if (!paymentRequired) {
    console.error('❌ No payment-required header found!');
    process.exit(1);
  }

  const paymentDetails = JSON.parse(atob(paymentRequired));
  console.log('   Payment required:', paymentDetails);

  // Step 2: Create and sign the payment
  console.log('\n✍️  Step 2: Signing payment authorization...');

  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60; // Valid from 1 minute ago
  const validBefore = now + 3600; // Valid for 1 hour
  const nonce = keccak256(toHex(`${account.address}-${Date.now()}-${Math.random()}`));

  const message = {
    from: account.address,
    to: RECIPIENT as `0x${string}`,
    value: BigInt(AMOUNT),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: nonce,
  };

  console.log('   Message to sign:', {
    from: message.from,
    to: message.to,
    value: message.value.toString(),
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
  });

  const signature = await walletClient.signTypedData({
    account,
    domain: USDC_DOMAIN,
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization',
    message,
  });

  console.log('   Signature:', signature);

  // Step 3: Create payment payload
  console.log('\n📦 Step 3: Creating payment payload...');

  // The accepted field mirrors what the server specified in the 402 response
  const accepted = paymentDetails.accepts[0];

  const paymentPayload = {
    x402Version: 2,
    scheme: 'exact',
    network: 'eip155:10143',
    payload: {
      signature,
      authorization: {
        from: message.from,
        to: message.to,
        value: message.value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
      },
    },
    // Include the accepted payment requirements
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

  console.log('   Payment payload structure:', Object.keys(paymentPayload));
  const paymentSignature = btoa(JSON.stringify(paymentPayload));
  console.log('   Payment signature (base64):', paymentSignature.substring(0, 50) + '...');

  // Step 4: Make the paid request
  console.log('\n🚀 Step 4: Making paid request to x402-markets...');

  const paidResponse = await fetch(`${API_BASE}/functions/v1/x402-markets`, {
    headers: {
      'apikey': API_KEY,
      'PAYMENT-SIGNATURE': paymentSignature,
    },
  });

  console.log('   Response status:', paidResponse.status);

  const responseBody = await paidResponse.json() as {
    success?: boolean;
    count?: number;
    markets?: unknown[];
    payment?: { amountFormatted?: string; payer?: string };
    error?: string;
  };
  console.log('\n📊 Response:');
  console.log(JSON.stringify(responseBody, null, 2));

  if (paidResponse.ok) {
    console.log('\n✅ SUCCESS! x402 payment worked!');
    console.log(`   Markets returned: ${responseBody.count || 0}`);
    console.log(`   Payment amount: ${responseBody.payment?.amountFormatted || 'N/A'}`);
    console.log(`   Payer: ${responseBody.payment?.payer || 'N/A'}`);
  } else {
    console.log('\n❌ Request failed');
    console.log(`   Error: ${responseBody.error || 'Unknown'}`);
  }
}

testX402Markets().catch(console.error);
