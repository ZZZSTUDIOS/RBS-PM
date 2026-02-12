/**
 * Trade the NBA All-Star market using viem directly
 * Usage: npx tsx scripts/trade-nba-allstar.ts
 */
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const MARKET = '0xd68a2957c1697131301eaeed6763395fffad4904' as `0x${string}`;
const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as `0x${string}`;
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const RPC_URL = 'https://testnet-rpc.monad.xyz';

if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY env variable');
  process.exit(1);
}

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const LSLMSR_ABI = [
  {
    name: 'getMarketInfo', type: 'function', inputs: [],
    outputs: [
      { name: '_question', type: 'string' },
      { name: '_resolutionTime', type: 'uint256' },
      { name: '_oracle', type: 'address' },
      { name: '_yesPrice', type: 'uint256' },
      { name: '_noPrice', type: 'uint256' },
      { name: '_yesProbability', type: 'uint256' },
      { name: '_noProbability', type: 'uint256' },
      { name: '_yesShares', type: 'uint256' },
      { name: '_noShares', type: 'uint256' },
      { name: '_totalCollateral', type: 'uint256' },
      { name: '_liquidityParam', type: 'uint256' },
      { name: '_priceSum', type: 'uint256' },
      { name: '_resolved', type: 'bool' },
      { name: '_yesWins', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'estimateSharesForPayment', type: 'function',
    inputs: [{ name: 'isYes', type: 'bool' }, { name: 'grossPayment', type: 'uint256' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'buy', type: 'function',
    inputs: [{ name: 'isYes', type: 'bool' }, { name: 'collateralAmount', type: 'uint256' }, { name: 'minShares', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  { name: 'yesToken', type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'noToken', type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

async function main() {
  console.log('=== NBA All-Star Market Trading ===\n');

  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });

  console.log(`Wallet: ${account.address}`);

  // 1. Check balances
  const usdcBalance = await publicClient.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
  }) as bigint;
  const monBalance = await publicClient.getBalance({ address: account.address });
  console.log(`MON: ${formatUnits(monBalance, 18)}`);
  console.log(`USDC: ${formatUnits(usdcBalance, 6)}\n`);

  // 2. Get market info
  console.log('--- Market Info ---');
  const info = await publicClient.readContract({
    address: MARKET, abi: LSLMSR_ABI, functionName: 'getMarketInfo',
  }) as [string, bigint, `0x${string}`, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean];

  const [question, resolutionTime, oracle, yesPrice, noPrice, yesProbability, noProbability, yesShares, noShares, totalCollateral, liquidityParam, priceSum, resolved, yesWins] = info;

  console.log(`Question: ${question}`);
  console.log(`Resolution: ${new Date(Number(resolutionTime) * 1000).toISOString()}`);
  console.log(`YES Price: ${(Number(yesPrice) / 1e18 * 100).toFixed(2)}% (${formatUnits(yesPrice, 18)} USDC)`);
  console.log(`NO Price:  ${(Number(noPrice) / 1e18 * 100).toFixed(2)}% (${formatUnits(noPrice, 18)} USDC)`);
  console.log(`Price Sum: ${(Number(priceSum) / 1e18 * 100).toFixed(2)}% (entropy spread)`);
  console.log(`YES Prob:  ${(Number(yesProbability) / 1e18 * 100).toFixed(2)}% (pure softmax)`);
  console.log(`NO Prob:   ${(Number(noProbability) / 1e18 * 100).toFixed(2)}% (pure softmax)`);
  console.log(`YES Shares: ${formatUnits(yesShares, 18)}`);
  console.log(`NO Shares:  ${formatUnits(noShares, 18)}`);
  console.log(`Total Collateral: ${formatUnits(totalCollateral, 6)} USDC`);
  console.log(`Liquidity (b): ${formatUnits(liquidityParam, 18)}`);
  console.log(`Resolved: ${resolved}\n`);

  // 3. Get buy quote for 1 USDC YES
  console.log('--- Buy Quote: 1 USDC on YES ---');
  const buyAmount = parseUnits('1', 6); // 1 USDC
  const estimatedShares = await publicClient.readContract({
    address: MARKET, abi: LSLMSR_ABI, functionName: 'estimateSharesForPayment', args: [true, buyAmount],
  }) as bigint;
  console.log(`1 USDC → ~${formatUnits(estimatedShares, 18)} YES shares`);
  console.log(`Avg price: ${(1 / (Number(estimatedShares) / 1e18)).toFixed(4)} USDC/share\n`);

  // 4. Approve USDC
  console.log('--- Step 1: Approve USDC ---');
  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [account.address, MARKET],
  }) as bigint;

  if (allowance < buyAmount) {
    const approveTx = await walletClient.writeContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [MARKET, parseUnits('1000', 6)],
    });
    console.log(`Approve TX: ${approveTx}`);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log('Approved!\n');
  } else {
    console.log(`Already approved (${formatUnits(allowance, 6)} USDC)\n`);
  }

  // 5. Execute BUY YES
  console.log('--- Step 2: BUY 1 USDC on YES ---');
  const buyTx = await walletClient.writeContract({
    address: MARKET, abi: LSLMSR_ABI, functionName: 'buy', args: [true, buyAmount, 0n],
  });
  console.log(`Buy TX: ${buyTx}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: buyTx });
  console.log(`Status: ${receipt.status}`);
  console.log(`Gas used: ${receipt.gasUsed.toString()}\n`);

  // 6. Check position after trade
  console.log('--- Position After Trade ---');
  const yesTokenAddr = await publicClient.readContract({ address: MARKET, abi: LSLMSR_ABI, functionName: 'yesToken' }) as `0x${string}`;
  const noTokenAddr = await publicClient.readContract({ address: MARKET, abi: LSLMSR_ABI, functionName: 'noToken' }) as `0x${string}`;

  const yesBalance = await publicClient.readContract({ address: yesTokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  const noBalance = await publicClient.readContract({ address: noTokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }) as bigint;
  console.log(`YES shares: ${formatUnits(yesBalance, 18)}`);
  console.log(`NO shares:  ${formatUnits(noBalance, 18)}\n`);

  // 7. Updated prices
  console.log('--- Updated Prices ---');
  const newInfo = await publicClient.readContract({ address: MARKET, abi: LSLMSR_ABI, functionName: 'getMarketInfo' }) as [string, bigint, `0x${string}`, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean];

  const newYesPrice = newInfo[3];
  const newNoPrice = newInfo[4];
  const newYesProb = newInfo[5];
  const newPriceSum = newInfo[11];

  console.log(`YES Price: ${(Number(newYesPrice) / 1e18 * 100).toFixed(2)}% (was ${(Number(yesPrice) / 1e18 * 100).toFixed(2)}%)`);
  console.log(`NO Price:  ${(Number(newNoPrice) / 1e18 * 100).toFixed(2)}% (was ${(Number(noPrice) / 1e18 * 100).toFixed(2)}%)`);
  console.log(`YES Prob:  ${(Number(newYesProb) / 1e18 * 100).toFixed(2)}% (was ${(Number(yesProbability) / 1e18 * 100).toFixed(2)}%)`);
  console.log(`Price Sum: ${(Number(newPriceSum) / 1e18 * 100).toFixed(2)}%`);

  // 8. USDC balance after
  const newUsdcBalance = await publicClient.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
  }) as bigint;
  console.log(`\nUSDC: ${formatUnits(usdcBalance, 6)} → ${formatUnits(newUsdcBalance, 6)} (spent ${formatUnits(usdcBalance - newUsdcBalance, 6)})`);

  console.log('\n=== Trade Complete ===');
}

main().catch(console.error);
