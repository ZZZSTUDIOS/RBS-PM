import { http, createConfig, createStorage } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { monadTestnet } from 'viem/chains';

// Re-export monadTestnet for use in other files
export { monadTestnet };

// x402 Payment Configuration - Monad Testnet
export const X402_CONFIG = {
  // Network identifier for x402
  network: 'eip155:10143' as const,
  // USDC on Monad Testnet (used for micropayments)
  usdc: '0x534b2f3A21130d7a60830c2Df862319e593943A3' as `0x${string}`,
  // x402 Facilitator URL for Monad
  facilitator: 'https://x402-facilitator.molandak.org',
  // Pricing for different endpoints (in USDC base units, 6 decimals)
  prices: {
    marketData: '10000',    // 0.01 USDC - premium market data
    createMarket: '100000', // 0.10 USDC - market creation listing fee
    agentTrade: '100000',   // 0.10 USDC - agent trade execution
    analytics: '50000',     // 0.05 USDC - market analytics
  },
} as const;

// Contract addresses - Monad Testnet (10143)
export const ADDRESSES = {
  // Wrapped MON on Monad Testnet
  WMON: '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541' as `0x${string}`,

  // USDC on Monad Testnet (6 decimals) - used as collateral for prediction markets
  USDC: '0x534b2f3A21130d7a60830c2Df862319e593943A3' as `0x${string}`,
  USDC_DECIMALS: 6,
  
  // Doppler V4 addresses on Monad Testnet
  DOPPLER: {
    // Core
    airlock: '0xDe3599a2eC440B296373a983C85C365DA55d9dFA' as `0x${string}`,
    bundler: '0xf6023127f6E937091D5B605680056A6D27524bad' as `0x${string}`,
    deployer: '0xb35469ee64A87Afd19B31615094fE3962d73e421' as `0x${string}`,
    quoter: '0x2F2BAcd46d3F5c9EE052Ab392b73711dB89129DB' as `0x${string}`,

    // Token Factory
    tokenFactory: '0x8AF018e28c273826e6b2d5a99e81c8fB63729b07' as `0x${string}`,
    tokenFactory80: '0xf0B5141dD9096254B2ca624dff26024f46087229' as `0x${string}`,

    // UniswapV4 Initializer (single curve)
    uniswapV4Initializer: '0x53b4c21a6Cb61D64F636ABBfa6E8E90E6558e8ad' as `0x${string}`,

    // Multicurve Initializer (for bonding curves)
    multicurveInitializer: '0xA3C847eAb58eAa9cbc215C785c9cfBc19CDABD5f' as `0x${string}`,
    multicurveInitializerHook: '0xFaF16d11737E6552156DD328cD26C530e1da2D40' as `0x${string}`,

    // UniswapV4 Migrator
    uniswapV4Migrator: '0x4B0EC16Eb40318Ca5A4346f20F04A2285C19675B' as `0x${string}`,
    uniswapV4MigratorHook: '0x76E1f507592d9856B48482c599732d129eD6a500' as `0x${string}`,

    // Governance
    governanceFactory: '0x014E1c0bd34f3B10546E554CB33B3293fECDD056' as `0x${string}`,
    noOpGovernanceFactory: '0x094D926A969B3024ca46D2186BF13FD5CDBA9CE2' as `0x${string}`,

    // No-Op Migrator
    noOpMigrator: '0x5CadB034267751a364dDD4d321C99E07A307f915' as `0x${string}`,

    // Other
    timelockFactory: '0xB544F6fFF61F601F638C3930F6Aec4bbD7DA42b9' as `0x${string}`,
    streamableFeesLocker: '0x0d2f38d807bfAd5C18e430516e10ab560D300caF' as `0x${string}`,
  },
  
  // Canonical Monad contracts
  MULTICALL3: '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`,
  PERMIT2: '0x000000000022d473030f116ddee9f6b43ac78ba3' as `0x${string}`,
  
  // Your deployed prediction market factory (uses native MON)
  PREDICTION_FACTORY: '0xc4546422291F1860bbCe379075a077563B0e0777' as `0x${string}`,

  // LS-LMSR with USDC collateral (ERC-20 version)
  LSLMSR_ERC20_SAMPLE: '0x6E2f4B22042c7807a07af0801a7076D2C9F7854F' as `0x${string}`,
} as const;

// Wagmi config
export const config = createConfig({
  chains: [monadTestnet],
  connectors: [
    injected(),
    // Add WalletConnect if you have a project ID
    // walletConnect({ projectId: 'YOUR_PROJECT_ID' }),
  ],
  storage: createStorage({ storage: typeof window !== 'undefined' ? window.localStorage : undefined }),
  transports: {
    [monadTestnet.id]: http('https://testnet-rpc.monad.xyz'),
  },
});

// ABIs
export const ERC20_ABI = [
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
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'totalSupply',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export const PREDICTION_MARKET_ABI = [
  {
    name: 'resolve',
    type: 'function',
    inputs: [{ name: '_outcome', type: 'uint8' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'redeem',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'depositCollateral',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    name: 'getCollateralBalance',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'outcome',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
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
    name: 'question',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
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
  {
    name: 'collateralPerWinningToken',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getRedemptionValue',
    type: 'function',
    inputs: [{ name: 'tokenAmount', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export const PREDICTION_FACTORY_ABI = [
  {
    name: 'createMarket',
    type: 'function',
    inputs: [
      { name: 'yesToken', type: 'address' },
      { name: 'noToken', type: 'address' },
      { name: 'question', type: 'string' },
      { name: 'resolutionTime', type: 'uint256' },
      { name: 'oracle', type: 'address' },
    ],
    outputs: [{ name: 'market', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'markets',
    type: 'function',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'getMarketsCount',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'isMarket',
    type: 'function',
    inputs: [{ name: 'market', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'market', type: 'address', indexed: true },
      { name: 'yesToken', type: 'address', indexed: false },
      { name: 'noToken', type: 'address', indexed: false },
      { name: 'question', type: 'string', indexed: false },
      { name: 'resolutionTime', type: 'uint256', indexed: false },
      { name: 'creator', type: 'address', indexed: true },
    ],
  },
] as const;

export default config;
