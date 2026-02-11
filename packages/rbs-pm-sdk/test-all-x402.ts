// Comprehensive test for all x402-protected endpoints
// Run with: npx ts-node test-all-x402.ts

import { createWalletClient, createPublicClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, toHex } from 'viem';

// Test wallet private key (from environment)
if (!process.env.PRIVATE_KEY) {
  console.error('ERROR: Set PRIVATE_KEY environment variable');
  process.exit(1);
}
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Monad testnet
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';
const CHAIN_ID = 10143;

// API base URL
const API_BASE = 'https://qkcytrdhdtemyphsswou.supabase.co/functions/v1';

// Known market to test
const TEST_MARKET = '0x5de4c48946c008d762a979ae3c94ba86e96ec504';

// USDC on Monad Testnet
const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as const;

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

// Setup clients
const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  transport: http(MONAD_RPC),
});
const publicClient = createPublicClient({
  transport: http(MONAD_RPC),
});

console.log('🧪 Testing all x402-protected endpoints');
console.log(`📍 Wallet: ${account.address}`);
console.log(`🎯 Test market: ${TEST_MARKET}\n`);

// Check USDC balance
async function checkBalance(): Promise<string> {
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint;
  return formatUnits(balance, 6);
}

// x402 payment handler
async function makeX402Request(
  url: string,
  method: 'GET' | 'POST' = 'GET',
  body?: object
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  // Make initial request
  const response = await fetch(url, init);

  if (response.status !== 402) {
    const data = await response.json() as { error?: string };
    return { success: response.ok, data, error: response.ok ? undefined : data.error };
  }

  // Get payment requirements
  const paymentRequiredHeader = response.headers.get('payment-required');
  if (!paymentRequiredHeader) {
    return { success: false, error: 'No payment-required header' };
  }

  const paymentRequired: PaymentRequired = JSON.parse(atob(paymentRequiredHeader));
  const accepted = paymentRequired.accepts[0];

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

  // Sign
  const domain = accepted.extra
    ? {
        name: accepted.extra.name,
        version: accepted.extra.version,
        chainId: accepted.extra.chainId,
        verifyingContract: accepted.extra.verifyingContract as `0x${string}`,
      }
    : {
        name: 'USDC',
        version: '2',
        chainId: CHAIN_ID,
        verifyingContract: USDC_ADDRESS,
      };

  const signature = await walletClient.signTypedData({
    account,
    domain,
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

  // Retry with payment
  const newHeaders: Record<string, string> = { 'PAYMENT-SIGNATURE': btoa(JSON.stringify(paymentPayload)) };
  if (body) {
    newHeaders['Content-Type'] = 'application/json';
  }

  const paidResponse = await fetch(url, {
    method,
    headers: newHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await paidResponse.json() as { error?: string };
  return { success: paidResponse.ok, data, error: paidResponse.ok ? undefined : data.error };
}

// Test results tracker
const results: Array<{ endpoint: string; success: boolean; cost: string; note?: string }> = [];

async function testEndpoint(
  name: string,
  url: string,
  method: 'GET' | 'POST' = 'GET',
  body?: object
) {
  console.log(`\n📡 Testing: ${name}`);
  console.log(`   URL: ${url}`);
  if (body) console.log(`   Body: ${JSON.stringify(body)}`);

  try {
    const result = await makeX402Request(url, method, body);

    if (result.success) {
      console.log(`   ✅ Success!`);
      console.log(`   Response:`, JSON.stringify(result.data, null, 2).substring(0, 500));
      results.push({ endpoint: name, success: true, cost: '0.0001 USDC' });
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      console.log(`   Response:`, JSON.stringify(result.data, null, 2).substring(0, 500));
      results.push({ endpoint: name, success: false, cost: '0.0001 USDC', note: result.error });
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err}`);
    results.push({ endpoint: name, success: false, cost: '0', note: String(err) });
  }
}

async function main() {
  // Check initial balance
  const initialBalance = await checkBalance();
  console.log(`💰 Initial USDC Balance: ${initialBalance} USDC`);

  // Test each x402 endpoint
  // 1. x402-markets (already tested, but include for completeness)
  await testEndpoint(
    'x402-markets',
    `${API_BASE}/x402-markets`
  );

  // 2. x402-prices
  await testEndpoint(
    'x402-prices',
    `${API_BASE}/x402-prices?market=${TEST_MARKET}`
  );

  // 3. x402-market-info
  await testEndpoint(
    'x402-market-info',
    `${API_BASE}/x402-market-info?market=${TEST_MARKET}`
  );

  // 4. x402-position
  await testEndpoint(
    'x402-position',
    `${API_BASE}/x402-position?market=${TEST_MARKET}&user=${account.address}`
  );

  // 5. x402-market-data (premium DB data)
  await testEndpoint(
    'x402-market-data',
    `${API_BASE}/x402-market-data?market=${TEST_MARKET}`
  );

  // 6. x402-agent-trade
  await testEndpoint(
    'x402-agent-trade',
    `${API_BASE}/x402-agent-trade`,
    'POST',
    {
      marketAddress: TEST_MARKET,
      traderAddress: account.address,
      direction: 'buy',
      outcome: 'yes',
      amount: '1', // 1 USDC
    }
  );

  // 7. x402-resolve (will fail if market not resolvable, but tests payment flow)
  await testEndpoint(
    'x402-resolve',
    `${API_BASE}/x402-resolve`,
    'POST',
    {
      marketAddress: TEST_MARKET,
      yesWins: true,
      callerAddress: account.address,
    }
  );

  // 8. x402-claim-fees
  await testEndpoint(
    'x402-claim-fees',
    `${API_BASE}/x402-claim-fees`,
    'POST',
    {
      marketAddress: TEST_MARKET,
      callerAddress: account.address,
    }
  );

  // Check final balance
  const finalBalance = await checkBalance();
  console.log(`\n💰 Final USDC Balance: ${finalBalance} USDC`);
  const spent = parseFloat(initialBalance) - parseFloat(finalBalance);
  console.log(`💸 Total spent: ${spent.toFixed(6)} USDC`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));

  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.endpoint.padEnd(25)} ${r.cost}${r.note ? ` (${r.note})` : ''}`);
    if (r.success) passCount++;
    else failCount++;
  }

  console.log('='.repeat(60));
  console.log(`Total: ${passCount} passed, ${failCount} failed out of ${results.length} endpoints`);
  console.log(`Total cost: ~${(results.filter(r => r.success).length * 0.0001).toFixed(4)} USDC`);
}

main().catch(console.error);
