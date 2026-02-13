/**
 * Simulate trades and redemptions for multiple traders on a market
 *
 * This script:
 * 1. Creates a new market with a short resolution time
 * 2. Has 3 traders buy/sell different outcomes
 * 3. Resolves the market
 * 4. Redeems winning shares for each trader
 * (Indexer handles trade/redemption recording automatically)
 *
 * Usage: PRIVATE_KEY=0x... npx tsx scripts/simulate-multi-trader.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  formatEther,
  keccak256,
  toHex,
  type Address,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

// ============ Config ============

const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address;
const MARKET_FACTORY = '0xD639844c0aD7F9c33277f2491aaee503CE83A441' as Address;
const API_BASE = 'https://qkcytrdhdtemyphsswou.supabase.co';
const RPC_URL = 'https://testnet-rpc.monad.xyz';

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('Set PRIVATE_KEY env'); process.exit(1); }

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

// Main deployer account (has USDC + MON)
const deployerAccount = privateKeyToAccount(PRIVATE_KEY);
const deployerWallet = createWalletClient({ account: deployerAccount, chain: monadTestnet, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });

// Generate 2 extra trader accounts (deployer is trader 1)
const trader2Key = generatePrivateKey();
const trader3Key = generatePrivateKey();
const trader2Account = privateKeyToAccount(trader2Key);
const trader3Account = privateKeyToAccount(trader3Key);
const trader2Wallet = createWalletClient({ account: trader2Account, chain: monadTestnet, transport: http(RPC_URL) });
const trader3Wallet = createWalletClient({ account: trader3Account, chain: monadTestnet, transport: http(RPC_URL) });

const traders = [
  { name: 'Trader1 (deployer)', account: deployerAccount, wallet: deployerWallet },
  { name: 'Trader2', account: trader2Account, wallet: trader2Wallet },
  { name: 'Trader3', account: trader3Account, wallet: trader3Wallet },
];

// ============ ABIs ============

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

const LSLMSR_ABI = [
  { name: 'buy', type: 'function', inputs: [{ name: 'isYes', type: 'bool' }, { name: 'collateralAmount', type: 'uint256' }, { name: 'minShares', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'sell', type: 'function', inputs: [{ name: 'isYes', type: 'bool' }, { name: 'shares', type: 'uint256' }, { name: 'minPayout', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'resolve', type: 'function', inputs: [{ name: '_yesWins', type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'redeem', type: 'function', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { name: 'initialize', type: 'function', inputs: [{ name: '_initialLiquidity', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'getMarketInfo', type: 'function', inputs: [], outputs: [
    { name: 'a', type: 'string' }, { name: 'b', type: 'uint256' }, { name: 'c', type: 'address' },
    { name: 'd', type: 'uint256' }, { name: 'e', type: 'uint256' }, { name: 'f', type: 'uint256' },
    { name: 'g', type: 'uint256' }, { name: 'h', type: 'uint256' }, { name: 'i', type: 'uint256' },
    { name: 'j', type: 'uint256' }, { name: 'k', type: 'uint256' }, { name: 'l', type: 'uint256' },
    { name: 'm', type: 'bool' }, { name: 'n', type: 'bool' },
  ], stateMutability: 'view' },
  { name: 'yesToken', type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'noToken', type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'resolved', type: 'function', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
] as const;

const FACTORY_ABI = [
  { name: 'createMarket', type: 'function', inputs: [
    { name: 'question', type: 'string' }, { name: 'resolutionTime', type: 'uint256' },
    { name: 'oracle', type: 'address' }, { name: 'yesSymbol', type: 'string' }, { name: 'noSymbol', type: 'string' },
  ], outputs: [{ name: 'market', type: 'address' }], stateMutability: 'nonpayable' },
  { name: 'getMarketsCount', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'markets', type: 'function', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

// ============ x402 Payment ============

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
  ],
} as const;

const USDC_DOMAIN = {
  name: 'USDC', version: '2', chainId: 10143,
  verifyingContract: USDC_ADDRESS,
} as const;

async function x402Fetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 402) return response;

  const paymentRequiredHeader = response.headers.get('payment-required');
  if (!paymentRequiredHeader) return response;

  const paymentRequired = JSON.parse(atob(paymentRequiredHeader));
  const accepted = paymentRequired.accepts[0];

  const now = Math.floor(Date.now() / 1000);
  const nonce = keccak256(toHex(`${deployerAccount.address}-${Date.now()}-${Math.random()}`));

  const authorization = {
    from: deployerAccount.address,
    to: accepted.payTo as Address,
    value: BigInt(accepted.amount),
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + 3600),
    nonce,
  };

  const signature = await deployerWallet.signTypedData({
    account: deployerAccount,
    domain: accepted.extra || USDC_DOMAIN,
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });

  const paymentPayload = {
    x402Version: paymentRequired.x402Version || 2,
    scheme: accepted.scheme, network: accepted.network,
    payload: { signature, authorization: {
      from: authorization.from, to: authorization.to,
      value: authorization.value.toString(),
      validAfter: (now - 60).toString(), validBefore: (now + 3600).toString(), nonce,
    }},
    accepted: { scheme: accepted.scheme, network: accepted.network, amount: accepted.amount,
      asset: accepted.asset, payTo: accepted.payTo, maxTimeoutSeconds: accepted.maxTimeoutSeconds, extra: accepted.extra },
  };

  const newHeaders = new Headers(init?.headers);
  newHeaders.set('PAYMENT-SIGNATURE', btoa(JSON.stringify(paymentPayload)));
  return fetch(url, { ...init, headers: newHeaders });
}

// ============ Helpers ============

async function listMarket(marketAddress: string, question: string, resolutionTime: number, yesToken: string, noToken: string): Promise<void> {
  console.log('  Listing market in discovery index...');
  const res = await x402Fetch(`${API_BASE}/functions/v1/x402-create-market`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: marketAddress,
      question,
      resolutionTime,
      oracle: deployerAccount.address,
      yesTokenAddress: yesToken,
      noTokenAddress: noToken,
      initialLiquidity: '5',
    }),
  });
  const data = await res.json() as { success?: boolean; error?: string; market?: { id: string } };
  if (data.success) {
    console.log(`  Listed with ID: ${data.market?.id}`);
  } else {
    console.log(`  Listing: ${data.error || 'failed'}`);
  }
}

function printPrices(info: any[]) {
  const yesProb = Number(info[5]) / 1e18;
  const noProb = Number(info[6]) / 1e18;
  console.log(`  YES: ${(yesProb * 100).toFixed(1)}%  NO: ${(noProb * 100).toFixed(1)}%`);
}

// ============ Main ============

async function main() {
  console.log('=== Multi-Trader Simulation ===\n');

  // Check deployer balance
  const usdcBal = await publicClient.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [deployerAccount.address],
  }) as bigint;
  console.log(`Deployer: ${deployerAccount.address}`);
  console.log(`USDC Balance: ${formatUnits(usdcBal, 6)}`);

  if (usdcBal < parseUnits('15', 6)) {
    console.error('Need at least 15 USDC to run simulation');
    process.exit(1);
  }

  // Fund trader2 and trader3 with USDC and MON
  console.log(`\nTrader2: ${trader2Account.address}`);
  console.log(`Trader3: ${trader3Account.address}`);

  console.log('\n--- Step 1: Fund traders ---');
  // Send MON for gas
  for (const trader of [trader2Account, trader3Account]) {
    const monBal = await publicClient.getBalance({ address: trader.address });
    if (monBal < parseUnits('0.5', 18)) {
      const hash = await deployerWallet.sendTransaction({
        account: deployerAccount, chain: monadTestnet,
        to: trader.address, value: parseUnits('1', 18),
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  Sent 1 MON to ${trader.address.slice(0, 10)}...`);
    }
  }

  // Send USDC
  for (const trader of [trader2Account, trader3Account]) {
    const bal = await publicClient.readContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [trader.address],
    }) as bigint;
    if (bal < parseUnits('3', 6)) {
      const hash = await deployerWallet.writeContract({
        account: deployerAccount, chain: monadTestnet,
        address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'transfer',
        args: [trader.address, parseUnits('3', 6)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  Sent 3 USDC to ${trader.address.slice(0, 10)}...`);
    }
  }

  // ============ Step 2: Deploy market ============
  console.log('\n--- Step 2: Deploy market ---');
  const resolutionTime = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now
  const question = `Simulation test market ${Date.now()}`;

  const deployHash = await deployerWallet.writeContract({
    account: deployerAccount, chain: monadTestnet,
    address: MARKET_FACTORY, abi: FACTORY_ABI, functionName: 'createMarket',
    args: [question, BigInt(resolutionTime), deployerAccount.address, 'SIM-YES', 'SIM-NO'],
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  console.log(`  Factory tx: ${deployHash.slice(0, 14)}... (gas: ${deployReceipt.gasUsed})`);

  // Get market address
  const count = await publicClient.readContract({
    address: MARKET_FACTORY, abi: FACTORY_ABI, functionName: 'getMarketsCount',
  }) as bigint;
  const marketAddress = await publicClient.readContract({
    address: MARKET_FACTORY, abi: FACTORY_ABI, functionName: 'markets', args: [count - 1n],
  }) as Address;
  console.log(`  Market: ${marketAddress}`);

  // Initialize with 5 USDC liquidity
  const approveHash = await deployerWallet.writeContract({
    account: deployerAccount, chain: monadTestnet,
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
    args: [marketAddress, parseUnits('5', 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  const initHash = await deployerWallet.writeContract({
    account: deployerAccount, chain: monadTestnet,
    address: marketAddress, abi: LSLMSR_ABI, functionName: 'initialize',
    args: [parseUnits('5', 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash: initHash });
  console.log(`  Initialized with 5 USDC`);

  // Get token addresses and list
  const [yesToken, noToken] = await Promise.all([
    publicClient.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'yesToken' }) as Promise<Address>,
    publicClient.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'noToken' }) as Promise<Address>,
  ]);

  await listMarket(marketAddress, question, resolutionTime, yesToken, noToken);

  // Show initial prices
  let info = await publicClient.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'getMarketInfo' }) as any[];
  console.log('  Initial prices:');
  printPrices(info);

  // ============ Step 3: Execute trades ============
  console.log('\n--- Step 3: Execute trades ---');

  // Trade plan:
  // Trader1: Buy 1 USDC YES
  // Trader2: Buy 2 USDC NO
  // Trader3: Buy 1.5 USDC YES
  // Trader2: Sell half their NO shares
  const trades: Array<{
    name: string;
    wallet: typeof deployerWallet;
    account: typeof deployerAccount;
    action: 'buy' | 'sell';
    isYes: boolean;
    amount: string; // USDC for buy, shares for sell
  }> = [
    { name: 'Trader1', wallet: deployerWallet, account: deployerAccount, action: 'buy', isYes: true, amount: '1' },
    { name: 'Trader2', wallet: trader2Wallet, account: trader2Account, action: 'buy', isYes: false, amount: '2' },
    { name: 'Trader3', wallet: trader3Wallet, account: trader3Account, action: 'buy', isYes: true, amount: '1.5' },
  ];

  for (const trade of trades) {
    console.log(`\n  ${trade.name}: ${trade.action.toUpperCase()} ${trade.isYes ? 'YES' : 'NO'} ${trade.amount} USDC`);

    // Approve USDC
    const approveAmt = parseUnits(trade.amount, 6);
    const appHash = await trade.wallet.writeContract({
      account: trade.account, chain: monadTestnet,
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
      args: [marketAddress, approveAmt],
    });
    await publicClient.waitForTransactionReceipt({ hash: appHash });

    // Buy
    const buyHash = await trade.wallet.writeContract({
      account: trade.account, chain: monadTestnet,
      address: marketAddress, abi: LSLMSR_ABI, functionName: 'buy',
      args: [trade.isYes, approveAmt, 0n],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash });
    console.log(`  tx: ${buyHash.slice(0, 14)}... (gas: ${receipt.gasUsed})`);

    // Show prices after trade
    info = await publicClient.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'getMarketInfo' }) as any[];
    printPrices(info);
  }

  // Trader2 sells half their NO shares
  console.log(`\n  Trader2: SELL half NO shares`);
  const trader2NoBalance = await publicClient.readContract({
    address: noToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [trader2Account.address],
  }) as bigint;
  const sellAmount = trader2NoBalance / 2n;
  console.log(`  NO balance: ${formatEther(trader2NoBalance)}, selling: ${formatEther(sellAmount)}`);

  // Approve share token for market
  const sellApproveHash = await trader2Wallet.writeContract({
    account: trader2Account, chain: monadTestnet,
    address: noToken, abi: ERC20_ABI, functionName: 'approve',
    args: [marketAddress, sellAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: sellApproveHash });

  const sellHash = await trader2Wallet.writeContract({
    account: trader2Account, chain: monadTestnet,
    address: marketAddress, abi: LSLMSR_ABI, functionName: 'sell',
    args: [false, sellAmount, 0n],
  });
  const sellReceipt = await publicClient.waitForTransactionReceipt({ hash: sellHash });
  console.log(`  tx: ${sellHash.slice(0, 14)}... (gas: ${sellReceipt.gasUsed})`);

  info = await publicClient.readContract({ address: marketAddress, abi: LSLMSR_ABI, functionName: 'getMarketInfo' }) as any[];
  console.log('  After all trades:');
  printPrices(info);

  // ============ Step 4: Wait for resolution time ============
  console.log('\n--- Step 4: Wait for resolution time ---');
  const now = Math.floor(Date.now() / 1000);
  const waitSeconds = resolutionTime - now + 5; // +5 buffer
  if (waitSeconds > 0) {
    console.log(`  Waiting ${waitSeconds}s for resolution time...`);
    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
  }

  // ============ Step 5: Resolve market (YES wins) ============
  console.log('\n--- Step 5: Resolve market (YES wins) ---');
  const resolveHash = await deployerWallet.writeContract({
    account: deployerAccount, chain: monadTestnet,
    address: marketAddress, abi: LSLMSR_ABI, functionName: 'resolve',
    args: [true], // YES wins
  });
  await publicClient.waitForTransactionReceipt({ hash: resolveHash });
  console.log(`  Resolved: YES wins (tx: ${resolveHash.slice(0, 14)}...)`);

  // ============ Step 6: Redeem winning shares ============
  console.log('\n--- Step 6: Redeem winning shares ---');

  // Traders with YES shares: Trader1 and Trader3
  for (const trader of [traders[0], traders[2]]) {
    const yesBal = await publicClient.readContract({
      address: yesToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [trader.account.address],
    }) as bigint;

    if (yesBal > 0n) {
      console.log(`\n  ${trader.name}: Redeeming ${formatEther(yesBal)} YES shares`);
      // Approve market to spend YES tokens
      const approveYesHash = await trader.wallet.writeContract({
        account: trader.account, chain: monadTestnet,
        address: yesToken, abi: ERC20_ABI, functionName: 'approve',
        args: [marketAddress, yesBal],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveYesHash });
      const redeemHash = await trader.wallet.writeContract({
        account: trader.account, chain: monadTestnet,
        address: marketAddress, abi: LSLMSR_ABI, functionName: 'redeem', args: [],
      });
      const redeemReceipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash });
      console.log(`  tx: ${redeemHash.slice(0, 14)}... (gas: ${redeemReceipt.gasUsed})`);
    } else {
      console.log(`  ${trader.name}: No YES shares to redeem`);
    }
  }

  // Trader2 has NO shares (losing side) - try redeem to show it returns 0
  const trader2NoBal = await publicClient.readContract({
    address: noToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [trader2Account.address],
  }) as bigint;
  if (trader2NoBal > 0n) {
    console.log(`\n  Trader2: Has ${formatEther(trader2NoBal)} NO shares (losing side)`);
    try {
      // Approve NO tokens (will revert anyway since YES wins)
      const approveNoHash = await trader2Wallet.writeContract({
        account: trader2Account, chain: monadTestnet,
        address: noToken, abi: ERC20_ABI, functionName: 'approve',
        args: [marketAddress, trader2NoBal],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveNoHash });
      const redeemHash = await trader2Wallet.writeContract({
        account: trader2Account, chain: monadTestnet,
        address: marketAddress, abi: LSLMSR_ABI, functionName: 'redeem', args: [],
      });
      const redeemReceipt = await publicClient.waitForTransactionReceipt({ hash: redeemHash });
      console.log(`  tx: ${redeemHash.slice(0, 14)}... (gas: ${redeemReceipt.gasUsed})`);
    } catch (err: any) {
      console.log(`  Redeem reverted (expected for losing side): ${err.message?.slice(0, 80)}`);
    }
  }

  // ============ Summary ============
  console.log('\n========================================');
  console.log('SIMULATION COMPLETE');
  console.log(`Market: ${marketAddress}`);
  console.log(`Question: ${question}`);
  console.log(`Resolution: YES wins`);
  console.log('\nFinal USDC balances:');
  for (const trader of traders) {
    const bal = await publicClient.readContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [trader.account.address],
    }) as bigint;
    console.log(`  ${trader.name}: ${formatUnits(bal, 6)} USDC`);
  }
  console.log('========================================');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
