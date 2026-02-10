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
  cost: bigint;
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

/** x402 price configuration */
export interface X402Prices {
  marketData: { raw: string; formatted: string };
  createMarket: { raw: string; formatted: string };
  agentTrade: { raw: string; formatted: string };
}
