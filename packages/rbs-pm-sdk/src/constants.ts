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
  // Market Factory (deploy new markets)
  MARKET_FACTORY: '0xD639844c0aD7F9c33277f2491aaee503CE83A441' as `0x${string}`,

  // Legacy Prediction Market Factory
  PREDICTION_FACTORY: '0xc4546422291F1860bbCe379075a077563B0e0777' as `0x${string}`,

  // Wrapped MON
  WMON: '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541' as `0x${string}`,

  // USDC (for x402 payments)
  USDC: '0x534b2f3A21130d7a60830c2Df862319e593943A3' as `0x${string}`,

  // ERC-8004 Agent Registry
  AGENT_REGISTRY: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`,
  REPUTATION_REGISTRY: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as `0x${string}`,

  // x402 API payment recipient
  X402_RECIPIENT: '0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE' as `0x${string}`,
} as const;

// API Configuration
export const API_CONFIG = {
  base: 'https://qkcytrdhdtemyphsswou.supabase.co',
} as const;

// API Endpoints
// All endpoints are x402 protected (require USDC micropayment)
export const API_ENDPOINTS = {
  base: 'https://qkcytrdhdtemyphsswou.supabase.co',
  // Read operations (0.01 USDC each)
  x402Markets: '/functions/v1/x402-markets',           // GET - list all markets
  x402Prices: '/functions/v1/x402-prices',             // GET ?market=0x... - get prices
  x402MarketInfo: '/functions/v1/x402-market-info',    // GET ?market=0x... - full market info
  x402Position: '/functions/v1/x402-position',         // GET ?market=0x...&user=0x... - user position
  x402Portfolio: '/functions/v1/x402-portfolio',       // GET ?user=0x... - full portfolio with all positions
  x402MarketData: '/functions/v1/x402-market-data',    // GET ?market=0x... - premium analytics
  // Write operations - return calldata (0.01 USDC each)
  x402AgentTrade: '/functions/v1/x402-agent-trade',    // POST - buy/sell calldata
  x402Resolve: '/functions/v1/x402-resolve',           // POST - resolve calldata
  x402ClaimFees: '/functions/v1/x402-claim-fees',      // POST - claim fees calldata
  x402Redeem: '/functions/v1/x402-redeem',             // POST - redeem calldata
  x402Initialize: '/functions/v1/x402-initialize',     // POST - initialize calldata
  // Market creation (0.01 USDC)
  x402CreateMarket: '/functions/v1/x402-create-market', // POST - list market in discovery
  x402DeployMarket: '/functions/v1/x402-deploy-market', // POST - deploy new market via factory
  // Forum operations (0.01-0.02 USDC each)
  x402ForumPosts: '/functions/v1/x402-forum-posts',               // GET - list posts
  x402ForumPost: '/functions/v1/x402-forum-post',                 // GET - single post + comments
  x402ForumComments: '/functions/v1/x402-forum-comments',         // GET - comments for a post
  x402ForumCreatePost: '/functions/v1/x402-forum-create-post',    // POST - create post (0.02 USDC)
  x402ForumCreateComment: '/functions/v1/x402-forum-create-comment', // POST - create comment
  x402ForumLinkTrade: '/functions/v1/x402-forum-link-trade',      // POST - link trade to comment
  x402ForumEdit: '/functions/v1/x402-forum-edit',                 // POST - edit post/comment
  x402ForumDelete: '/functions/v1/x402-forum-delete',             // POST - delete post/comment
  // Authentication (free - required for agent identity)
  authMoltbook: '/functions/v1/auth-moltbook',
} as const;

// x402 Payment Configuration
// All API endpoints are x402 protected (0.01 USDC per call — facilitator minimum)
export const X402_CONFIG = {
  network: 'eip155:10143',
  facilitator: 'https://x402-facilitator.molandak.org',
  recipient: ADDRESSES.X402_RECIPIENT,
  prices: {
    default: '10000',          // 0.01 USDC - standard API call
    markets: '10000',          // 0.01 USDC - list all markets
    prices: '10000',           // 0.01 USDC - get prices
    marketInfo: '10000',       // 0.01 USDC - full market info
    position: '10000',         // 0.01 USDC - get position for single market
    portfolio: '10000',        // 0.01 USDC - full portfolio (all positions)
    marketData: '10000',       // 0.01 USDC - premium market data
    tradeInstructions: '10000', // 0.01 USDC - get trade calldata
    resolve: '10000',          // 0.01 USDC - get resolve calldata
    claimFees: '10000',        // 0.01 USDC - get claim fees calldata
    createMarket: '10000',     // 0.01 USDC - list market for discovery
  },
} as const;

// LSLMSR_ERC20 Contract Bytecode hash (for deployment verification)
// Deploy using: new LSLMSR_ERC20(collateral, decimals, question, resolutionTime, oracle, alpha, minLiq, yesShares, noShares, yesName, yesSymbol, noName, noSymbol)
export const LSLMSR_DEPLOY_PARAMS = {
  collateral: ADDRESSES.USDC,
  decimals: 6,
  defaultAlpha: '30000000000000000', // 0.03e18 = 3%
  defaultMinLiquidity: '100000000000000000000', // 100e18
  defaultInitialShares: '100000000000000000000', // 100e18
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
  // Oracle/Resolution functions
  {
    name: 'resolve',
    type: 'function',
    inputs: [{ name: '_yesWins', type: 'bool' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'oracle',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
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
    name: 'yesWins',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'resolutionTime',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  // Fee functions
  {
    name: 'claimCreatorFees',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'withdrawExcessCollateral',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'getFeeInfo',
    type: 'function',
    inputs: [],
    outputs: [
      { name: 'pendingCreatorFees', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'marketCreator',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'creatorFeesAccrued',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  // Initialization
  {
    name: 'initialize',
    type: 'function',
    inputs: [{ name: '_initialLiquidity', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'initialized',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
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

// Market Factory ABI
export const MARKET_FACTORY_ABI = [
  {
    name: "createMarket",
    type: "function",
    inputs: [
      { name: "question", type: "string" },
      { name: "resolutionTime", type: "uint256" },
      { name: "oracle", type: "address" },
      { name: "yesSymbol", type: "string" },
      { name: "noSymbol", type: "string" },
    ],
    outputs: [{ name: "market", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "market", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "question", type: "string", indexed: false },
      { name: "resolutionTime", type: "uint256", indexed: false },
      { name: "oracle", type: "address", indexed: false },
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
