/**
 * Deploy LSLMSR_ERC20 Market (USDC Collateral)
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx scripts/deploy-lslmsr-erc20.ts
 *
 * This script:
 * 1. Deploys the LSLMSR_ERC20 contract
 * 2. Approves USDC for the contract
 * 3. Initializes with liquidity buffer
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Monad Testnet
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'Monad', symbol: 'MON' },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
} as const;

// Contract addresses
const USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address;
const USDC_DECIMALS = 6;

// ERC20 ABI for approve
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// LSLMSR_ERC20 contract bytecode - get this from `forge build` output
// Run: forge build && cat out/LSLMSR_ERC20.sol/LSLMSR_ERC20.json | jq -r '.bytecode.object'
const LSLMSR_ERC20_BYTECODE = '0x'; // TODO: Paste bytecode here after running `forge build`

// LSLMSR_ERC20 constructor ABI
const LSLMSR_ERC20_CONSTRUCTOR_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: '_collateralToken', type: 'address' },
      { name: '_collateralDecimals', type: 'uint8' },
      { name: '_question', type: 'string' },
      { name: '_resolutionTime', type: 'uint256' },
      { name: '_oracle', type: 'address' },
      { name: '_alpha', type: 'uint256' },
      { name: '_minLiquidity', type: 'uint256' },
      { name: '_initialYesShares', type: 'uint256' },
      { name: '_initialNoShares', type: 'uint256' },
      { name: '_yesName', type: 'string' },
      { name: '_yesSymbol', type: 'string' },
      { name: '_noName', type: 'string' },
      { name: '_noSymbol', type: 'string' },
    ],
  },
] as const;

// Initialize function ABI
const INITIALIZE_ABI = [
  {
    name: 'initialize',
    type: 'function',
    inputs: [{ name: '_initialLiquidity', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'yesToken',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'noToken',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
] as const;

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    console.error('PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log('Deployer:', account.address);

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    chain: monadTestnet,
    transport: http(),
    account,
  });

  // Check USDC balance
  const usdcBalance = await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });
  console.log('USDC Balance:', formatUnits(usdcBalance, USDC_DECIMALS), 'USDC');

  if (usdcBalance < parseUnits('10', USDC_DECIMALS)) {
    console.error('Need at least 10 USDC for initial liquidity');
    console.log('Get testnet USDC from: https://faucet.monad.xyz');
    process.exit(1);
  }

  // Market parameters
  const marketParams = {
    collateralToken: USDC,
    collateralDecimals: USDC_DECIMALS,
    question: 'Will Monad mainnet launch by Q2 2025?',
    resolutionTime: BigInt(1751328000), // July 1, 2025
    oracle: account.address,
    alpha: BigInt('30000000000000000'), // 0.03 * 1e18 = 3%
    minLiquidity: BigInt('100000000000000000000'), // 100 * 1e18
    initialYesShares: BigInt('100000000000000000000'), // 100 * 1e18
    initialNoShares: BigInt('100000000000000000000'), // 100 * 1e18
    yesName: 'Monad Q2 2025 YES',
    yesSymbol: 'YES-MONAD',
    noName: 'Monad Q2 2025 NO',
    noSymbol: 'NO-MONAD',
  };

  console.log('\nMarket Parameters:');
  console.log('  Question:', marketParams.question);
  console.log('  Resolution:', new Date(Number(marketParams.resolutionTime) * 1000).toISOString());
  console.log('  Oracle:', marketParams.oracle);

  if (LSLMSR_ERC20_BYTECODE === '0x') {
    console.log('\n⚠️  Bytecode not set! Run these commands first:');
    console.log('1. forge build');
    console.log('2. Copy bytecode from out/LSLMSR_ERC20.sol/LSLMSR_ERC20.json');
    console.log('3. Paste into this script at LSLMSR_ERC20_BYTECODE');
    console.log('\nOr use Foundry deployment script:');
    console.log('forge script script/DeployLSLMSR_ERC20.s.sol:DeployLSLMSR_ERC20Script \\');
    console.log('  --rpc-url https://testnet-rpc.monad.xyz \\');
    console.log('  --private-key $PRIVATE_KEY \\');
    console.log('  --broadcast -vvvv');
    return;
  }

  // Deploy contract
  console.log('\nDeploying LSLMSR_ERC20...');
  // const hash = await walletClient.deployContract({
  //   abi: LSLMSR_ERC20_CONSTRUCTOR_ABI,
  //   bytecode: LSLMSR_ERC20_BYTECODE,
  //   args: [
  //     marketParams.collateralToken,
  //     marketParams.collateralDecimals,
  //     marketParams.question,
  //     marketParams.resolutionTime,
  //     marketParams.oracle,
  //     marketParams.alpha,
  //     marketParams.minLiquidity,
  //     marketParams.initialYesShares,
  //     marketParams.initialNoShares,
  //     marketParams.yesName,
  //     marketParams.yesSymbol,
  //     marketParams.noName,
  //     marketParams.noSymbol,
  //   ],
  // });

  // const receipt = await publicClient.waitForTransactionReceipt({ hash });
  // const marketAddress = receipt.contractAddress!;
  // console.log('Market deployed to:', marketAddress);
}

main().catch(console.error);
