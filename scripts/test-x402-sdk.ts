/**
 * Test all x402 SDK endpoints end-to-end
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/test-x402-sdk.ts
 */
import { createPublicClient, createWalletClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Inline the x402 fetch logic from SDK
import { keccak256, toHex } from 'viem';

const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as `0x${string}`;
const API_BASE = 'https://qkcytrdhdtemyphsswou.supabase.co';
const MARKET = '0xd68a2957c1697131301eaeed6763395fffad4904' as `0x${string}`;
const RPC_URL = 'https://testnet-rpc.monad.xyz';

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

const monadTestnet = {
  id: 10143, name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const account = privateKeyToAccount(PRIVATE_KEY);
const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });

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
  name: 'USDC', version: '2', chainId: 10143,
  verifyingContract: USDC_ADDRESS,
} as const;

// x402 payment fetch wrapper
async function x402Fetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 402) return response;

  const paymentRequiredHeader = response.headers.get('payment-required');
  if (!paymentRequiredHeader) return response;

  const paymentRequired = JSON.parse(atob(paymentRequiredHeader));
  const accepted = paymentRequired.accepts[0];

  const now = Math.floor(Date.now() / 1000);
  const nonce = keccak256(toHex(`${account.address}-${Date.now()}-${Math.random()}`));

  const authorization = {
    from: account.address,
    to: accepted.payTo as `0x${string}`,
    value: BigInt(accepted.amount),
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + (accepted.maxTimeoutSeconds || 3600)),
    nonce,
  };

  const signature = await walletClient.signTypedData({
    account,
    domain: accepted.extra ? {
      name: accepted.extra.name,
      version: accepted.extra.version,
      chainId: accepted.extra.chainId,
      verifyingContract: accepted.extra.verifyingContract as `0x${string}`,
    } : USDC_DOMAIN,
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });

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
        validAfter: (now - 60).toString(),
        validBefore: (now + (accepted.maxTimeoutSeconds || 3600)).toString(),
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

  const newHeaders = new Headers(init?.headers);
  newHeaders.set('PAYMENT-SIGNATURE', btoa(JSON.stringify(paymentPayload)));
  return fetch(url, { ...init, headers: newHeaders });
}

// Test helpers
let totalCost = 0;
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    passed++;
    console.log('✅');
  } catch (err: any) {
    failed++;
    console.log(`❌ ${err.message}`);
  }
}

async function main() {
  console.log('=== x402 SDK Endpoint Tests ===\n');
  console.log(`Wallet: ${account.address}`);

  // Check USDC balance first
  const usdcBal = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint;
  console.log(`USDC Balance: ${formatUnits(usdcBal, 6)}`);
  console.log(`Market: ${MARKET}\n`);

  // ==========================================
  // 1. MARKET DISCOVERY ENDPOINTS
  // ==========================================
  console.log('--- 1. Market Discovery ---');

  let marketsData: any;
  await test('getMarkets (x402-markets)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-markets`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    marketsData = await res.json();
    if (!marketsData.success) throw new Error(marketsData.error);
    totalCost += 0.0001;
    console.log(`(${marketsData.markets?.length || 0} markets) `);
  });

  let pricesData: any;
  await test('getPrices (x402-prices)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-prices?market=${MARKET}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pricesData = await res.json();
    if (!pricesData.success) throw new Error(pricesData.error);
    totalCost += 0.0001;
    console.log(`(YES: ${(pricesData.prices.yes * 100).toFixed(1)}%, NO: ${(pricesData.prices.no * 100).toFixed(1)}%) `);
  });

  let marketInfoData: any;
  await test('getMarketInfo (x402-market-info)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-market-info?market=${MARKET}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    marketInfoData = await res.json();
    if (!marketInfoData.success) throw new Error(marketInfoData.error);
    totalCost += 0.0001;
    console.log(`("${marketInfoData.market?.question?.substring(0, 40)}...") `);
  });

  await test('getPremiumMarketData (x402-market-data)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-market-data?market=${MARKET}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    totalCost += 0.0001;
    console.log(`(volume: ${data.analytics?.totalVolume || data.volume || '?'}) `);
  });

  // ==========================================
  // 2. PORTFOLIO MANAGEMENT ENDPOINTS
  // ==========================================
  console.log('\n--- 2. Portfolio Management ---');

  await test('getPosition (x402-position)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-position?market=${MARKET}&user=${account.address}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    totalCost += 0.0001;
    console.log(`(YES: ${data.position?.yesSharesFormatted || '0'}, NO: ${data.position?.noSharesFormatted || '0'}) `);
  });

  await test('getPortfolio (x402-portfolio)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-portfolio?user=${account.address}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    totalCost += 0.0001;
    console.log(`(${data.summary?.totalPositions || 0} positions, value: ${data.summary?.totalValue || '0'} USDC) `);
  });

  // ==========================================
  // 3. TRADING ENDPOINTS
  // ==========================================
  console.log('\n--- 3. Trading ---');

  let tradeInstructions: any;
  await test('getTradeInstructions BUY (x402-agent-trade)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-agent-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress: MARKET,
        traderAddress: account.address,
        direction: 'buy',
        outcome: 'yes',
        amount: '0.5',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tradeInstructions = await res.json();
    if (!tradeInstructions.success) throw new Error(tradeInstructions.error);
    totalCost += 0.0001;
    const hasApproval = tradeInstructions.instructions?.approval ? 'yes' : 'no';
    console.log(`(approval: ${hasApproval}, trade.to: ${tradeInstructions.instructions?.trade?.to?.substring(0, 10)}...) `);
  });

  await test('getTradeInstructions SELL (x402-agent-trade)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-agent-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress: MARKET,
        traderAddress: account.address,
        direction: 'sell',
        outcome: 'yes',
        amount: '0.1',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    totalCost += 0.0001;
    console.log(`(trade.to: ${data.instructions?.trade?.to?.substring(0, 10)}...) `);
  });

  // ==========================================
  // 4. RESOLUTION ENDPOINTS
  // ==========================================
  console.log('\n--- 4. Resolution & Fees ---');

  await test('getResolveInstructions (x402-resolve)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress: MARKET,
        yesWins: true,
        callerAddress: account.address,
      }),
    });
    if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // May fail if market isn't ready to resolve - that's OK, endpoint works
    totalCost += 0.0001;
    if (data.error) {
      console.log(`(expected: ${data.error.substring(0, 50)}) `);
    } else {
      console.log(`(tx ready) `);
    }
  });

  await test('getRedeemInstructions (x402-redeem)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress: MARKET,
        userAddress: account.address,
      }),
    });
    if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    totalCost += 0.0001;
    if (data.error) {
      console.log(`(expected: ${data.error.substring(0, 50)}) `);
    } else {
      console.log(`(tx ready) `);
    }
  });

  await test('getFeeInfo (x402-claim-fees)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-claim-fees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress: MARKET,
        callerAddress: account.address,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    totalCost += 0.0001;
    console.log(`(pending: ${data.fees?.pendingFormatted || '0'}, creator: ${data.isCreator}) `);
  });

  // ==========================================
  // 5. MARKET CREATION ENDPOINTS
  // ==========================================
  console.log('\n--- 5. Market Creation ---');

  await test('getDeployInstructions (x402-deploy-market)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-deploy-market`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Test: Will it rain tomorrow?',
        resolutionTime: Math.floor(Date.now() / 1000) + 86400,
        oracle: account.address,
        callerAddress: account.address,
        initialLiquidity: '5',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    totalCost += 0.0001;
    console.log(`(factory: ${data.factory?.substring(0, 10)}..., ${data.transactions?.length || 0} txs) `);
  });

  await test('getInitializeInstructions (x402-initialize)', async () => {
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress: MARKET,
        initialLiquidity: '5',
        callerAddress: account.address,
      }),
    });
    // May return error if already initialized - that's expected
    const data = await res.json();
    totalCost += 0.0001;
    if (data.error) {
      console.log(`(expected: ${data.error.substring(0, 50)}) `);
    } else {
      console.log(`(${data.transactions?.length || 0} txs) `);
    }
  });

  // ==========================================
  // 6. EXECUTE A LIVE TRADE (BUY 0.5 USDC YES)
  // ==========================================
  console.log('\n--- 6. Live Trade Execution ---');

  let lastTradeTxHash: string | null = null;

  await test('Execute BUY 0.5 USDC on YES (full x402 flow)', async () => {
    // Step 1: Get trade instructions via x402
    const instrRes = await x402Fetch(`${API_BASE}/functions/v1/x402-agent-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress: MARKET,
        traderAddress: account.address,
        direction: 'buy',
        outcome: 'yes',
        amount: '0.5',
      }),
    });
    if (!instrRes.ok) throw new Error(`Instructions HTTP ${instrRes.status}`);
    const instrData = await instrRes.json() as any;
    if (!instrData.success) throw new Error(instrData.error);
    totalCost += 0.0001;

    // Step 2: Execute approval if needed
    if (instrData.instructions?.approval) {
      const approvalTo = instrData.instructions.approval.to.toLowerCase();
      if (approvalTo !== USDC_ADDRESS.toLowerCase()) {
        throw new Error(`Bad approval target: ${approvalTo}`);
      }
      const approveTx = await walletClient.sendTransaction({
        account, chain: monadTestnet,
        to: instrData.instructions.approval.to as `0x${string}`,
        data: instrData.instructions.approval.data as `0x${string}`,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    // Step 3: Validate and execute trade
    const tradeTo = instrData.instructions.trade.to.toLowerCase();
    if (tradeTo !== MARKET.toLowerCase()) {
      throw new Error(`Bad trade target: ${tradeTo}`);
    }
    const buyTx = await walletClient.sendTransaction({
      account, chain: monadTestnet,
      to: instrData.instructions.trade.to as `0x${string}`,
      data: instrData.instructions.trade.data as `0x${string}`,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: buyTx });
    if (receipt.status !== 'success') throw new Error('Trade reverted');
    lastTradeTxHash = buyTx;
    console.log(`(tx: ${buyTx.substring(0, 14)}..., gas: ${receipt.gasUsed}) `);
  });

  // ==========================================
  // 7. CONFIRM TRADE (x402-confirm-trade)
  // ==========================================
  console.log('\n--- 7. Confirm Trade ---');

  await test('confirmTrade (x402-confirm-trade)', async () => {
    if (!lastTradeTxHash) throw new Error('No trade tx hash from previous step');
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-confirm-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txHash: lastTradeTxHash,
        marketAddress: MARKET,
      }),
    });
    if (!res.ok) {
      const errData = await res.json() as any;
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    const data = await res.json() as any;
    if (!data.success) throw new Error(data.error || 'confirm-trade failed');
    totalCost += 0.0001;
    console.log(`(${data.trade?.tradeType} ${data.trade?.outcome}: ${data.trade?.shares?.substring(0, 8)}... shares, ${data.trade?.amount} USDC) `);
  });

  await test('confirmTrade idempotent (re-confirm same tx)', async () => {
    if (!lastTradeTxHash) throw new Error('No trade tx hash');
    const res = await x402Fetch(`${API_BASE}/functions/v1/x402-confirm-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txHash: lastTradeTxHash,
        marketAddress: MARKET,
      }),
    });
    if (!res.ok) {
      const errData = await res.json() as any;
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    const data = await res.json() as any;
    if (!data.success) throw new Error(data.error || 'idempotent confirm failed');
    totalCost += 0.0001;
    console.log(`(idempotent OK) `);
  });

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log(`Total x402 cost: ~${totalCost.toFixed(4)} USDC`);

  // Check final balance
  const finalBal = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint;
  console.log(`USDC: ${formatUnits(usdcBal, 6)} → ${formatUnits(finalBal, 6)} (delta: ${formatUnits(finalBal - usdcBal, 6)})`);
  console.log('========================================');
}

main().catch(console.error);
