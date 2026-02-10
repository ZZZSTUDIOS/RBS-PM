// RBS Prediction Market SDK Constants
// Contract addresses and ABIs for Monad Testnet

// Monad Testnet Configuration
export const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  explorer: 'https://testnet.monadexplorer.com',
} as const;

// Contract Addresses
export const ADDRESSES = {
  // Prediction Market Factory
  PREDICTION_FACTORY: '0xc4546422291F1860bbCe379075a077563B0e0777' as `0x${string}`,

  // Wrapped MON
  WMON: '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541' as `0x${string}`,

  // USDC (for x402 payments)
  USDC: '0x534b2f3A21130d7a60830c2Df862319e593943A3' as `0x${string}`,

  // ERC-8004 Agent Registry
  AGENT_REGISTRY: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`,
  REPUTATION_REGISTRY: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as `0x${string}`,

  // Protocol Fee Recipient
  PROTOCOL_FEE_RECIPIENT: '0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE' as `0x${string}`,
} as const;

// API Endpoints
export const API_ENDPOINTS = {
  base: 'https://qkcytrdhdtemyphsswou.supabase.co',
  markets: '/rest/v1/markets?select=*',
  authMoltbook: '/functions/v1/auth-moltbook',
  x402MarketData: '/functions/v1/x402-market-data',
  x402CreateMarket: '/functions/v1/x402-create-market',
  x402AgentTrade: '/functions/v1/x402-agent-trade',
} as const;

// x402 Payment Configuration
export const X402_CONFIG = {
  network: 'eip155:10143',
  facilitator: 'https://x402-facilitator.molandak.org',
  recipient: ADDRESSES.PROTOCOL_FEE_RECIPIENT,
  prices: {
    marketData: '10000',     // 0.01 USDC
    createMarket: '100000',  // 0.10 USDC
    agentTrade: '0',         // FREE - no charge for trade instructions
  },
} as const;

// LS-LMSR ERC-20 Market ABI (uses USDC as collateral)
export const LSLMSR_ABI = [
  // Read functions
  {
    name: 'getMarketInfo',
    type: 'function',
    inputs: [],
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
    name: 'getCollateralInfo',
    type: 'function',
    inputs: [],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'decimals', type: 'uint8' },
      { name: 'symbol', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getYesPrice',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getNoPrice',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getCostInCollateral',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'shares', type: 'uint256' },
    ],
    outputs: [{ name: 'cost', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getPayoutForSellInCollateral',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'shares', type: 'uint256' },
    ],
    outputs: [{ name: 'payout', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'estimateSharesForPayment',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'grossPayment', type: 'uint256' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
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
    name: 'collateralToken',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'collateralDecimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  // Write functions (ERC-20 collateral - no payable)
  {
    name: 'buy',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'minShares', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'sell',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'shares', type: 'uint256' },
      { name: 'minPayout', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'redeem',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Events
  {
    type: 'event',
    name: 'SharesPurchased',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
      { name: 'cost', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SharesSold',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
    ],
  },
] as const;

// ERC-20 ABI (minimal)
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
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
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
