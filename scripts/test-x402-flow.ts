// End-to-end test: x402 payment flow against live facilitator
// Tests: 402 challenge → sign → verify → settle → get data

import { createWalletClient, createPublicClient, http, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';

const FACILITATOR_URL = 'https://x402-facilitator.molandak.org';
const API_BASE = 'https://qkcytrdhdtemyphsswou.supabase.co/functions/v1';
const ANON_KEY = 'sb_publishable_mKTNqXht6ek37VkHAGWoUQ_TMzoC3wp';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x39733f3e7a837d5c5a2c0e77c52345ca8016641914c8f8b68621deed2a0ba78a';

const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as const;
const USDC_DOMAIN = {
  name: 'USDC',
  version: '2',
  chainId: 10143,
  verifyingContract: USDC_ADDRESS,
} as const;

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

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

console.log(`Testing x402 flow with wallet: ${account.address}\n`);

// Step 1: Test facilitator /supported
async function testSupported() {
  console.log('--- Step 1: GET /supported ---');
  const res = await fetch(`${FACILITATOR_URL}/supported`);
  const data = await res.json();
  console.log('Networks:', Object.keys(data.signers));
  console.log('Testnet signer:', data.signers['eip155:10143']?.[0]);
  console.log('PASS: Facilitator is reachable\n');
  return data;
}

// Step 2: Get 402 challenge from our endpoint
async function getPaymentChallenge(endpoint: string) {
  console.log(`--- Step 2: GET ${endpoint} (expect 402) ---`);
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { apikey: ANON_KEY },
  });

  if (res.status !== 402) {
    throw new Error(`Expected 402, got ${res.status}: ${await res.text()}`);
  }

  const paymentRequiredHeader = res.headers.get('payment-required');
  if (!paymentRequiredHeader) {
    throw new Error('No PAYMENT-REQUIRED header in 402 response');
  }

  const paymentRequired = JSON.parse(atob(paymentRequiredHeader));
  const accepted = paymentRequired.accepts[0];

  console.log('Payment required:');
  console.log(`  amount: ${accepted.amount} (${parseInt(accepted.amount) / 1e6} USDC)`);
  console.log(`  payTo: ${accepted.payTo}`);
  console.log(`  maxTimeoutSeconds: ${accepted.maxTimeoutSeconds}`);
  console.log(`  extra: ${JSON.stringify(accepted.extra)}`);

  // Verify the fixed format
  if (accepted.extra.chainId || accepted.extra.verifyingContract) {
    console.log('WARN: extra still has chainId/verifyingContract (old format)');
  } else {
    console.log('PASS: extra only has {name, version} (new format)');
  }
  if (accepted.maxTimeoutSeconds === 300) {
    console.log('PASS: maxTimeoutSeconds is 300');
  } else {
    console.log(`WARN: maxTimeoutSeconds is ${accepted.maxTimeoutSeconds}, expected 300`);
  }
  console.log('');

  return { paymentRequired, accepted };
}

// Step 3: Sign authorization and build payment payload
async function signPayment(accepted: any) {
  console.log('--- Step 3: Sign EIP-712 TransferWithAuthorization ---');

  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60;
  const validBefore = now + (accepted.maxTimeoutSeconds || 300);
  const nonce = keccak256(toHex(`${account.address}-${Date.now()}-${Math.random()}`));

  const authorization = {
    from: account.address,
    to: accepted.payTo as `0x${string}`,
    value: BigInt(accepted.amount),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: nonce,
  };

  // Use local USDC_DOMAIN for signing (server extra only has name+version)
  const signingDomain = {
    name: accepted.extra?.name ?? USDC_DOMAIN.name,
    version: accepted.extra?.version ?? USDC_DOMAIN.version,
    chainId: USDC_DOMAIN.chainId,
    verifyingContract: USDC_DOMAIN.verifyingContract,
  };

  const signature = await walletClient.signTypedData({
    account,
    domain: signingDomain,
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });

  console.log(`  Signed by: ${account.address}`);
  console.log(`  Signature: ${signature.substring(0, 20)}...`);

  const paymentPayload = {
    x402Version: 2,
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
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

  console.log('PASS: Payment payload created\n');
  return paymentPayload;
}

// Step 4: Verify directly with facilitator
async function testVerifyDirect(paymentPayload: any) {
  console.log('--- Step 4: POST /verify (direct facilitator test) ---');

  const facilitatorRequest = {
    x402Version: 2,
    payload: paymentPayload.payload,
    resource: {
      url: 'https://rbs-pm.vercel.app/test',
      description: 'Test resource',
      mimeType: 'application/json',
    },
    accepted: paymentPayload.accepted,
  };

  const res = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(facilitatorRequest),
  });

  const data = await res.json();
  console.log(`  HTTP ${res.status}`);
  console.log(`  isValid: ${data.isValid}`);
  if (!data.isValid) {
    console.log(`  invalidReason: ${data.invalidReason}`);
    console.log('FAIL: Facilitator rejected payment\n');
  } else {
    console.log('PASS: Facilitator verified payment\n');
  }
  return data;
}

// Step 5: Send paid request to our endpoint
async function testPaidRequest(endpoint: string, paymentPayload: any) {
  console.log(`--- Step 5: GET ${endpoint} (with payment) ---`);

  const paymentSignature = btoa(JSON.stringify(paymentPayload));

  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      apikey: ANON_KEY,
      'PAYMENT-SIGNATURE': paymentSignature,
    },
  });

  const data = await res.json();
  console.log(`  HTTP ${res.status}`);

  if (res.status === 200) {
    const preview = JSON.stringify(data).substring(0, 200);
    console.log(`  Response: ${preview}...`);
    console.log('PASS: Paid request succeeded\n');
  } else {
    console.log(`  Error: ${JSON.stringify(data)}`);
    console.log('FAIL: Paid request failed\n');
  }

  return { status: res.status, data };
}

// Run all tests
async function main() {
  try {
    await testSupported();
    const { accepted } = await getPaymentChallenge('/x402-markets');
    const paymentPayload = await signPayment(accepted);
    const verifyResult = await testVerifyDirect(paymentPayload);

    if (verifyResult.isValid) {
      // Use a FRESH signature for the actual request (previous one consumed by verify)
      const freshPayload = await signPayment(accepted);
      await testPaidRequest('/x402-markets', freshPayload);
    } else {
      console.log('Skipping paid request test — verification failed');
    }

    console.log('=== Test complete ===');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

main();
