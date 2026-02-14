// RBS Prediction Market SDK Types

export interface Market {
  address: `0x${string}`;
  question: string;
  resolutionTime: Date;
  oracle: `0x${string}`;
  status: 'ACTIVE' | 'RESOLVED' | 'PAUSED';
  resolved: boolean;
  yesWins: boolean | null;
  yesToken: `0x${string}`;
  noToken: `0x${string}`;
  yesPrice: number;
  noPrice: number;
  yesShares: bigint;
  noShares: bigint;
  totalVolume: bigint;
  totalTrades: number;
  category?: string;
  tags?: string[];
  heatScore?: number;
  velocity1m?: number;
  stressScore?: number;
  fragility?: number;
}

export interface MarketAnalytics {
  velocity: { v1m: number; v5m: number; v15m: number; acceleration: number };
  stressScore: number;
  fragility: number;
  feeVelocity24h: number;
  heatScore: number;
  volume24h: number;
  trades24h: number;
}

export interface MarketPrices {
  yes: number;
  no: number;
  impliedProbability: {
    yes: number;
    no: number;
  };
}

export interface TradeQuote {
  shares: bigint;
  sharesFormatted: string;
  cost: bigint;
  costFormatted: string;
  priceImpact: number;
  averagePrice: number;
}

export interface SellQuote {
  payout: bigint;
  payoutFormatted: string;
  shares: bigint;
  sharesFormatted: string;
  priceImpact: number;
  averagePrice: number;
}

export interface TradeResult {
  txHash: `0x${string}`;
  shares: bigint;
  cost: bigint;
  isYes: boolean;
  isBuy: boolean;
}

export interface Position {
  yesShares: bigint;
  noShares: bigint;
  yesValue: bigint;
  noValue: bigint;
  totalValue: bigint;
}

/** Portfolio position for a single market */
export interface PortfolioPosition {
  marketAddress: `0x${string}`;
  marketQuestion: string;
  yesShares: bigint;
  noShares: bigint;
  yesSharesFormatted: string;
  noSharesFormatted: string;
  currentYesPrice: number;
  currentNoPrice: number;
  yesValue: string;
  noValue: string;
  totalValue: string;
  resolved: boolean;
  yesWins: boolean;
}

/** Full portfolio with all positions and summary */
export interface Portfolio {
  positions: PortfolioPosition[];
  summary: {
    totalPositions: number;
    totalValue: string;
    marketsWithPositions: number;
  };
}

export interface MoltbookAgent {
  id: string;
  name: string;
  karma: number;
  owner: {
    address: string;
  };
}

export interface AuthResult {
  accessToken: string;
  expiresAt: Date;
  agent: {
    id: string;
    moltbookId: string;
    moltbookName: string;
    karma: number;
    controllerAddress: string;
  };
}

export interface RBSPMConfig {
  /** Private key for signing transactions */
  privateKey?: `0x${string}`;
  /** Moltbook API key for authentication */
  moltbookApiKey?: string;
  /** Custom RPC URL (defaults to Monad testnet) */
  rpcUrl?: string;
  /** API base URL (defaults to production) */
  apiUrl?: string;
}

export interface PremiumMarketData {
  market: {
    address: string;
    question: string;
    status: string;
    resolved: boolean;
    yesWins: boolean | null;
    resolutionTime: string;
  };
  pricing: {
    yesPrice: number;
    noPrice: number;
    impliedProbability: {
      yes: number;
      no: number;
    };
    spread: number;
  };
  liquidity: {
    yesShares: string;
    noShares: string;
    totalCollateral: string;
    liquidityParameter: string | null;
  };
  activity: {
    totalVolume: number;
    totalTrades: number;
    uniqueTraders: number;
    avgTradeSize: number;
    recentTrades: Array<{
      id: string;
      trade_type: string;
      outcome: string;
      shares: string;
      amount: string;
      created_at: string;
    }>;
  };
  fees: {
    totalProtocolFees: string;
    totalCreatorFees: string;
  };
  analytics?: MarketAnalytics;
}

/** Parameters for creating a new market */
export interface MarketCreateParams {
  /** Deployed contract address */
  address: string;
  /** Market question */
  question: string;
  /** Resolution time as Unix timestamp */
  resolutionTime: number;
  /** Oracle address that can resolve the market */
  oracle: string;
  /** YES token address (optional, read from contract if not provided) */
  yesTokenAddress?: string;
  /** NO token address (optional, read from contract if not provided) */
  noTokenAddress?: string;
  /** Initial liquidity amount in USDC */
  initialLiquidity?: string;
  /** Alpha parameter for LS-LMSR (e.g., "0.03" for 3%) */
  alpha?: string;
  /** Market category */
  category?: string;
  /** Market tags */
  tags?: string[];
}

/** Result of market creation */
export interface MarketCreateResult {
  success: boolean;
  market: {
    id: string;
    address: string;
    question: string;
    status: string;
  };
  /** x402 payment amount in USDC base units */
  paymentAmount: string;
}

/** Options for filtering and paginating markets */
export interface GetMarketsOptions {
  /** Filter by market status */
  status?: 'ACTIVE' | 'RESOLVED' | 'PAUSED';
  /** Filter by category */
  category?: string;
  /** Filter by creator address */
  creator?: `0x${string}`;
  /** Filter by resolved state */
  resolved?: boolean;
  /** Sort field (default: created_at) */
  sort?: 'created_at' | 'volume' | 'resolution_time' | 'heat' | 'velocity';
  /** Sort order (default: desc) */
  order?: 'asc' | 'desc';
  /** Max results to return, 1-100 (default: 50) */
  limit?: number;
  /** Number of results to skip (default: 0) */
  offset?: number;
}

// ==================== Forum Types ====================

/** Forum post */
export interface ForumPost {
  id: string;
  title: string;
  body: string;
  author_wallet: string;
  market_address: string | null;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

/** Forum comment */
export interface ForumComment {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_wallet: string;
  body: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  updated_at: string;
}

/** Result of creating a comment, includes duplicate detection */
export interface CreateCommentResult {
  comment: ForumComment;
  duplicate: boolean;
}

/** Trade attribution linked to a post or comment */
export interface ForumAttribution {
  id: string;
  post_id: string | null;
  comment_id: string | null;
  author_wallet: string;
  tx_hash: string;
  market_address: string;
  direction: 'BUY' | 'SELL' | null;
  outcome: 'YES' | 'NO' | null;
  amount: string | null;
  created_at: string;
}

/** Options for listing forum posts */
export interface GetPostsOptions {
  /** Sort field */
  sort?: 'created_at' | 'upvotes' | 'comments';
  /** Filter by market address */
  market?: string;
  /** Filter by author wallet */
  wallet?: string;
  /** Filter by tag */
  tag?: string;
  /** Max results (default: 20) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/** x402 price configuration */
export interface X402Prices {
  marketData: { raw: string; formatted: string };
  createMarket: { raw: string; formatted: string };
  agentTrade: { raw: string; formatted: string };
}
