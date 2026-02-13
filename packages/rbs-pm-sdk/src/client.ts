// RBS Prediction Market SDK Client
// Main entry point for AI agents to interact with prediction markets

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  decodeEventLog,
  type PublicClient,
  type WalletClient,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createX402Fetch } from './x402';
import { MONAD_TESTNET, ADDRESSES, API_ENDPOINTS, API_CONFIG, X402_CONFIG, LSLMSR_ABI, ERC20_ABI, MARKET_FACTORY_ABI } from './constants';
import type {
  RBSPMConfig,
  Market,
  MarketPrices,
  TradeQuote,
  TradeResult,
  Position,
  Portfolio,
  PortfolioPosition,
  AuthResult,
  PremiumMarketData,
  MarketCreateParams,
  MarketCreateResult,
  GetMarketsOptions,
  SellQuote,
} from './types';

// USDC decimals
const USDC_DECIMALS = 6;

// Input validation helpers
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

function validateAddress(address: string, name: string): void {
  if (!address || !ADDRESS_REGEX.test(address)) {
    throw new Error(`Invalid ${name}: must be a 42-character hex address (got "${address}")`);
  }
}

function validatePositiveAmount(amount: string, name: string): void {
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new Error(`Invalid ${name}: must be a positive number (got "${amount}")`);
  }
}

// Define Monad Testnet chain
const monadTestnet = {
  id: MONAD_TESTNET.id,
  name: MONAD_TESTNET.name,
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [MONAD_TESTNET.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: MONAD_TESTNET.explorer },
  },
} as const;

export class RBSPMClient {
  private publicClient: PublicClient;
  private walletClient: WalletClient | null = null;
  private account: Account | null = null;
  private accessToken: string | null = null;
  private apiUrl: string;
  private x402PaymentFetch: typeof fetch | null = null;
  private x402Queue: Promise<unknown> = Promise.resolve();

  constructor(config: RBSPMConfig = {}) {
    const rpcUrl = config.rpcUrl || MONAD_TESTNET.rpcUrl;
    this.apiUrl = config.apiUrl || API_ENDPOINTS.base;

    // Create public client for reading
    this.publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(rpcUrl),
    });

    // Create wallet client if private key provided
    if (config.privateKey) {
      this.account = privateKeyToAccount(config.privateKey);
      this.walletClient = createWalletClient({
        account: this.account,
        chain: monadTestnet,
        transport: http(rpcUrl),
      });

      // Initialize x402 client for micropayments
      this.initX402Client();
    }
  }

  /**
   * Initialize x402 client for automatic payment handling.
   * Wraps fetch in a sequential queue to prevent parallel x402 calls
   * from overwhelming the facilitator.
   */
  private initX402Client(): void {
    if (!this.walletClient || !this.account) return;

    const rawFetch = createX402Fetch(this.walletClient, this.account);

    // Wrap in sequential queue — each call waits for the previous one to finish
    this.x402PaymentFetch = ((...args: Parameters<typeof fetch>) => {
      const call = this.x402Queue.then(() => rawFetch(...args));
      this.x402Queue = call.then(() => {}, () => {}); // swallow errors to keep queue moving
      return call;
    }) as typeof fetch;
  }

  // ==================== Authentication ====================

  /**
   * Authenticate with Moltbook API key
   */
  async authenticateWithMoltbook(apiKey: string): Promise<AuthResult> {
    // First, get identity token from Moltbook
    const tokenResponse = await fetch('https://moltbook.com/api/v1/agents/me/identity-token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audience: 'prediction-market-rbs',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get Moltbook identity token: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json() as { identity_token: string };

    // Verify with our API
    const authResponse = await fetch(`${this.apiUrl}${API_ENDPOINTS.authMoltbook}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity_token: tokenData.identity_token,
        audience: 'prediction-market-rbs',
      }),
    });

    if (!authResponse.ok) {
      const errorData = await authResponse.json() as { error?: string };
      throw new Error(errorData.error || 'Authentication failed');
    }

    const data = await authResponse.json() as {
      access_token: string;
      expires_at: string;
      agent: {
        id: string;
        moltbook_id: string;
        moltbook_name: string;
        moltbook_karma: number;
        controller_address: string;
      };
    };
    this.accessToken = data.access_token;

    return {
      accessToken: data.access_token,
      expiresAt: new Date(data.expires_at),
      agent: {
        id: data.agent.id,
        moltbookId: data.agent.moltbook_id,
        moltbookName: data.agent.moltbook_name,
        karma: data.agent.moltbook_karma,
        controllerAddress: data.agent.controller_address,
      },
    };
  }

  // ==================== x402 Payment ====================

  /**
   * Check if x402 payments are available
   */
  hasPaymentCapability(): boolean {
    return this.x402PaymentFetch !== null;
  }

  /**
   * Get the fetch function with x402 payment capability
   */
  getPaymentFetch(): typeof fetch {
    if (!this.x402PaymentFetch) {
      throw new Error('x402 payments not configured. Provide privateKey in constructor.');
    }
    return this.x402PaymentFetch;
  }

  // ==================== Market Discovery ====================

  /**
   * Get markets with optional filtering and pagination (requires x402 payment - 0.01 USDC)
   *
   * @example
   * ```typescript
   * // Get all markets (default)
   * const all = await client.getMarkets();
   *
   * // Get active markets sorted by volume
   * const active = await client.getMarkets({ status: 'ACTIVE', sort: 'volume' });
   *
   * // Paginate through results
   * const page2 = await client.getMarkets({ limit: 10, offset: 10 });
   * ```
   */
  async getMarkets(options?: GetMarketsOptions): Promise<Market[]> {
    const paymentFetch = this.getPaymentFetch();

    // Build query string from options
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.category) params.set('category', options.category);
    if (options?.creator) params.set('creator', options.creator);
    if (options?.resolved !== undefined) params.set('resolved', String(options.resolved));
    if (options?.sort) params.set('sort', options.sort);
    if (options?.order) params.set('order', options.order);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.offset !== undefined) params.set('offset', String(options.offset));

    const qs = params.toString();
    const url = `${this.apiUrl}${API_ENDPOINTS.x402Markets}${qs ? `?${qs}` : ''}`;

    const response = await paymentFetch(url, {
      method: 'GET',
    });

    if (response.status === 402) {
      throw new Error('Payment required for market list (0.01 USDC)');
    }

    if (!response.ok) {
      throw new Error('Failed to fetch markets');
    }

    const data = await response.json() as { success: boolean; markets: Array<Record<string, unknown>> };
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const BROKEN_MARKETS = new Set([
      '0x3f9498ef0a9cc5a88678d4d4a900ec16875a1f9f',
      '0x6e2f4b22042c7807a07af0801a7076d2c9f7854f',
      '0x15e9094b5db262d09439fba90ef27039c6c62900',
      '0xc291a0d35be092871e8d08db071c8d3e54fa6e35',
    ]);
    const seen = new Set<string>();

    return (data.markets || [])
      .filter((m) => {
        const addr = (m.address as string || '').toLowerCase();
        // Filter out zero-address, broken, and duplicate markets
        if (!addr || addr === ZERO_ADDRESS.toLowerCase()) return false;
        if (BROKEN_MARKETS.has(addr)) return false;
        if (seen.has(addr)) return false;
        seen.add(addr);
        return true;
      })
      .map((m) => ({
        address: (m.address as string) as `0x${string}`,
        question: m.question as string,
        resolutionTime: m.resolution_time ? new Date(m.resolution_time as string) : new Date(),
        oracle: (m.oracle_address as string || '') as `0x${string}`,
        status: (m.status as 'ACTIVE' | 'RESOLVED' | 'PAUSED') || 'ACTIVE',
        resolved: (m.resolved as boolean) || false,
        yesWins: (m.yes_wins as boolean | null) ?? null,
        yesToken: (m.yes_token_address as string || '') as `0x${string}`,
        noToken: (m.no_token_address as string || '') as `0x${string}`,
        yesPrice: Number(m.yes_price) || 0.5,
        noPrice: Number(m.no_price) || 0.5,
        yesShares: BigInt(0),
        noShares: BigInt(0),
        totalVolume: BigInt(0),
        totalTrades: Number(m.total_trades) || 0,
        category: m.category as string | undefined,
        tags: m.tags as string[] | undefined,
        heatScore: Number(m.heat_score) || 0,
        velocity1m: Number(m.velocity_1m) || 0,
        stressScore: Number(m.stress_score) || 0,
        fragility: Number(m.fragility) || 0,
      }));
  }

  /**
   * Get premium market data (requires x402 payment - 0.01 USDC)
   */
  async getPremiumMarketData(marketAddress: `0x${string}`): Promise<PremiumMarketData> {
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(
      `${this.apiUrl}${API_ENDPOINTS.x402MarketData}?market=${marketAddress}`,
      { method: 'GET' }
    );

    if (response.status === 402) {
      throw new Error('Payment required for premium market data (0.01 USDC)');
    }

    if (!response.ok) {
      const errorData = await response.json() as { error?: string };
      throw new Error(errorData.error || 'Failed to fetch premium market data');
    }

    return response.json() as Promise<PremiumMarketData>;
  }

  // ==================== Market Listing ====================

  /**
   * List a deployed market in the discovery index (requires 0.01 USDC x402 payment)
   *
   * After deploying a market contract on-chain, call this method to make it
   * discoverable by other agents. The listing fee (0.01 USDC) is paid via x402.
   *
   * @example
   * ```typescript
   * // After deploying market contract...
   * const result = await client.listMarket({
   *   address: deployedMarketAddress,
   *   question: 'Will ETH reach $10k in 2025?',
   *   resolutionTime: 1735689600, // Unix timestamp
   *   oracle: oracleAddress,
   *   category: 'crypto',
   *   tags: ['ethereum', 'price'],
   * });
   * console.log('Market listed! ID:', result.market.id);
   * ```
   */
  async listMarket(params: MarketCreateParams): Promise<MarketCreateResult> {
    const paymentFetch = this.getPaymentFetch();

    console.log(`Listing market at ${params.address}...`);
    console.log('This will cost 0.01 USDC (paid via x402)');

    const response = await paymentFetch(`${this.apiUrl}${API_ENDPOINTS.x402CreateMarket}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: params.address,
        question: params.question,
        resolutionTime: params.resolutionTime,
        oracle: params.oracle,
        yesTokenAddress: params.yesTokenAddress,
        noTokenAddress: params.noTokenAddress,
        initialLiquidity: params.initialLiquidity,
        alpha: params.alpha,
        category: params.category,
        tags: params.tags,
      }),
    });

    if (response.status === 402) {
      const challenge = await response.json();
      throw new Error(`Payment required: 0.01 USDC listing fee. Challenge: ${JSON.stringify(challenge)}`);
    }

    const data = await response.json() as {
      error?: string;
      success?: boolean;
      market?: { id: string; address: string; question: string; status: string };
      payment?: { amount: string; amountFormatted: string; txHash?: string; settled: boolean };
    };

    if (!response.ok) {
      throw new Error(data.error || 'Failed to list market');
    }

    console.log('Market listed successfully!');
    if (data.payment?.txHash) {
      console.log('Payment tx:', data.payment.txHash);
    }

    return {
      success: true,
      market: data.market!,
      paymentAmount: X402_CONFIG.prices.createMarket,
    };
  }

  /**
   * Alias for listMarket - for backwards compatibility
   */
  async createMarket(params: MarketCreateParams): Promise<MarketCreateResult> {
    return this.listMarket(params);
  }

  /**
   * Deploy a new prediction market via the Factory contract
   *
   * This is the complete market creation flow:
   * 1. Deploy market via Factory (this method)
   * 2. Initialize with liquidity
   * 3. List in discovery index
   *
   * Requires x402 payment (0.01 USDC) + gas for deployment
   *
   * @example
   * ```typescript
   * // Deploy a new market
   * const result = await client.deployMarket({
   *   question: 'Will BTC hit $100k by March 2026?',
   *   resolutionTime: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
   *   initialLiquidity: '2.5', // 2.5 USDC
   * });
   *
   * console.log('Market deployed:', result.marketAddress);
   * console.log('Initialize tx:', result.initializeTxHash);
   * ```
   */
  async deployMarket(params: {
    question: string;
    resolutionTime: number;
    initialLiquidity: string;
    oracle?: `0x${string}`;
    yesSymbol?: string;
    noSymbol?: string;
    category?: string;
    tags?: string[];
  }): Promise<{
    marketAddress: `0x${string}`;
    deployTxHash: `0x${string}`;
    initializeTxHash: `0x${string}`;
    listingId?: string;
  }> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    const paymentFetch = this.getPaymentFetch();

    console.log('Deploying market via Factory...');
    console.log(`Question: "${params.question}"`);
    console.log(`Resolution: ${new Date(params.resolutionTime * 1000).toISOString()}`);
    console.log(`Initial liquidity: ${params.initialLiquidity} USDC`);

    // Get deploy instructions from x402 endpoint
    const response = await paymentFetch(`${this.apiUrl}${API_ENDPOINTS.x402DeployMarket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: params.question,
        resolutionTime: params.resolutionTime,
        oracle: params.oracle || this.account.address,
        yesSymbol: params.yesSymbol,
        noSymbol: params.noSymbol,
        initialLiquidity: params.initialLiquidity,
        callerAddress: this.account.address,
        category: params.category,
        tags: params.tags,
      }),
    });

    if (response.status === 402) {
      throw new Error('Payment required for market deployment (0.01 USDC)');
    }

    const data = await response.json() as {
      success: boolean;
      error?: string;
      factory: string;
      transactions: Array<{ to: string; data: string; type: string }>;
      params: {
        question: string;
        yesSymbol: string;
        noSymbol: string;
        oracle: string;
      };
    };

    if (!data.success) {
      throw new Error(data.error || 'Failed to get deploy instructions');
    }

    // Check if factory is deployed
    if (data.factory === '0x0000000000000000000000000000000000000000') {
      throw new Error('MarketFactory not yet deployed. Contact admin.');
    }

    // Execute factory call to deploy market
    const createTx = data.transactions.find(tx => tx.type === 'createMarket');
    if (!createTx) {
      throw new Error('No createMarket transaction in response');
    }

    console.log('Executing factory deployment...');
    const deployHash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: createTx.to as `0x${string}`,
      data: createTx.data as `0x${string}`,
    });

    const deployReceipt = await this.publicClient.waitForTransactionReceipt({ hash: deployHash });
    console.log('Deploy tx confirmed:', deployHash);

    // Parse MarketCreated event to get market address
    const marketCreatedLog = deployReceipt.logs.find(log => {
      // MarketCreated event topic
      return log.topics[0] === '0x' + 'MarketCreated'.padEnd(64, '0'); // Simplified - would need actual topic
    });

    // For now, we'll need to get the market address from the factory
    // This is a workaround - ideally parse from event
    let marketAddress: `0x${string}`;

    // Read the latest market from factory
    try {
      const factoryAddress = data.factory as `0x${string}`;
      const marketsCount = await this.publicClient.readContract({
        address: factoryAddress,
        abi: [{ name: 'getMarketsCount', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
        functionName: 'getMarketsCount',
      }) as bigint;

      const markets = await this.publicClient.readContract({
        address: factoryAddress,
        abi: [{ name: 'markets', type: 'function', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' }],
        functionName: 'markets',
        args: [marketsCount - 1n],
      }) as `0x${string}`;

      marketAddress = markets;
    } catch {
      throw new Error('Failed to get deployed market address. Check transaction: ' + deployHash);
    }

    console.log('Market deployed at:', marketAddress);

    // Read token addresses from deployed contract
    const [yesTokenAddress, noTokenAddress] = await Promise.all([
      this.publicClient.readContract({
        address: marketAddress,
        abi: LSLMSR_ABI,
        functionName: 'yesToken',
      }) as Promise<`0x${string}`>,
      this.publicClient.readContract({
        address: marketAddress,
        abi: LSLMSR_ABI,
        functionName: 'noToken',
      }) as Promise<`0x${string}`>,
    ]);
    console.log('YES token:', yesTokenAddress);
    console.log('NO token:', noTokenAddress);

    // Initialize with liquidity
    console.log('Initializing with liquidity...');
    const initTxHash = await this.initializeMarket(marketAddress, params.initialLiquidity);
    console.log('Initialize tx:', initTxHash);

    // List in discovery index
    let listingId: string | undefined;
    try {
      console.log('Listing in discovery index...');
      const listing = await this.listMarket({
        address: marketAddress,
        question: params.question,
        resolutionTime: params.resolutionTime,
        oracle: (params.oracle || this.account.address) as string,
        yesTokenAddress,
        noTokenAddress,
        initialLiquidity: params.initialLiquidity,
        category: params.category,
        tags: params.tags,
      });
      listingId = listing.market.id;
      console.log('Listed with ID:', listingId);
    } catch (listErr) {
      console.warn('Listing failed (market still deployed):', listErr);
    }

    return {
      marketAddress,
      deployTxHash: deployHash,
      initializeTxHash: initTxHash,
      listingId,
    };
  }

  // ==================== Trade Instructions (x402 Protected) ====================

  /**
   * Get encoded trade calldata (requires x402 payment - 0.01 USDC)
   *
   * This endpoint returns the raw calldata for executing trades,
   * useful for agents that want to build their own transactions.
   *
   * @example
   * ```typescript
   * const instructions = await client.getTradeInstructions({
   *   marketAddress: '0x...',
   *   direction: 'buy',
   *   outcome: 'yes',
   *   amount: '10', // 10 USDC
   * });
   *
   * // Execute approval first (for buys)
   * if (instructions.approval) {
   *   await wallet.sendTransaction({
   *     to: instructions.approval.to,
   *     data: instructions.approval.data,
   *   });
   * }
   *
   * // Then execute the trade
   * await wallet.sendTransaction({
   *   to: instructions.trade.to,
   *   data: instructions.trade.data,
   * });
   * ```
   */
  private async getTradeInstructions(params: {
    marketAddress: `0x${string}`;
    direction: 'buy' | 'sell';
    outcome: 'yes' | 'no';
    amount: string;
    minOutput?: string;
  }): Promise<{
    approval?: { to: string; data: string; description: string };
    trade: { to: string; data: string; description: string };
    summary: { direction: string; outcome: string; amount: string; marketAddress: string };
  }> {
    const paymentFetch = this.getPaymentFetch();
    const traderAddress = this.account?.address || '0x0000000000000000000000000000000000000000';

    const response = await paymentFetch(`${this.apiUrl}${API_ENDPOINTS.x402AgentTrade}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress: params.marketAddress,
        traderAddress,
        direction: params.direction,
        outcome: params.outcome,
        amount: params.amount,
        minOutput: params.minOutput,
      }),
    });

    if (response.status === 402) {
      throw new Error('Payment required for trade instructions (0.01 USDC)');
    }

    if (!response.ok) {
      const errorData = await response.json() as { error?: string };
      throw new Error(errorData.error || 'Failed to get trade instructions');
    }

    const data = await response.json() as {
      success: boolean;
      instructions: {
        approval?: { to: string; data: string; description: string };
        trade: { to: string; data: string; description: string };
        summary: { direction: string; outcome: string; amount: string; marketAddress: string };
      };
    };

    return data.instructions;
  }

  // ==================== Price Queries (x402 Protected) ====================

  /**
   * Get current prices for a market (requires x402 payment - 0.01 USDC)
   */
  async getPrices(marketAddress: `0x${string}`): Promise<MarketPrices> {
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(
      `${this.apiUrl}${API_ENDPOINTS.x402Prices}?market=${marketAddress}`,
      { method: 'GET' }
    );

    if (response.status === 402) {
      throw new Error('Payment required for prices (0.01 USDC)');
    }

    if (!response.ok) {
      throw new Error('Failed to fetch prices');
    }

    const data = await response.json() as {
      success: boolean;
      prices: { yes: number; no: number };
      probability: { yes: number; no: number };
    };

    return {
      yes: data.prices.yes,
      no: data.prices.no,
      impliedProbability: data.probability,
    };
  }

  /**
   * Get quote for buying shares with USDC (free — on-chain reads only)
   */
  async getBuyQuote(
    marketAddress: `0x${string}`,
    isYes: boolean,
    usdcAmount: string
  ): Promise<TradeQuote> {
    const amountInUnits = parseUnits(usdcAmount, USDC_DECIMALS);

    // All on-chain reads — no x402 payment needed
    const [shares, yesPrice, noPrice] = await Promise.all([
      this.publicClient.readContract({
        address: marketAddress,
        abi: LSLMSR_ABI,
        functionName: 'estimateSharesForPayment',
        args: [isYes, amountInUnits],
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: marketAddress,
        abi: LSLMSR_ABI,
        functionName: 'getYesPrice',
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: marketAddress,
        abi: LSLMSR_ABI,
        functionName: 'getNoPrice',
      }) as Promise<bigint>,
    ]);

    const sharesNum = Number(shares) / 1e18;
    const costNum = Number(amountInUnits) / 1e6;
    const averagePrice = sharesNum > 0 ? costNum / sharesNum : 0;

    return {
      shares,
      sharesFormatted: sharesNum.toFixed(6),
      cost: amountInUnits,
      costFormatted: costNum.toFixed(6),
      priceImpact: 0,
      averagePrice,
    };
  }

  /**
   * Get quote for selling shares (free — on-chain read only)
   */
  async getSellQuote(
    marketAddress: `0x${string}`,
    isYes: boolean,
    shares: bigint
  ): Promise<SellQuote> {
    const payout = await this.publicClient.readContract({
      address: marketAddress,
      abi: LSLMSR_ABI,
      functionName: 'getPayoutForSellInCollateral',
      args: [isYes, shares],
    }) as bigint;

    const payoutNum = Number(payout) / 1e6;
    const sharesNum = Number(shares) / 1e18;
    const averagePrice = sharesNum > 0 ? payoutNum / sharesNum : 0;

    return {
      payout,
      payoutFormatted: payoutNum.toFixed(6),
      shares,
      sharesFormatted: sharesNum.toFixed(6),
      priceImpact: 0,
      averagePrice,
    };
  }

  // ==================== Trading (USDC Collateral) ====================

  /**
   * Check and approve USDC spending
   */
  private async ensureUSDCAllowance(spender: `0x${string}`, amount: bigint): Promise<void> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured');
    }

    const allowance = await this.publicClient.readContract({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account.address, spender],
    }) as bigint;

    if (allowance < amount) {
      const hash = await this.walletClient.writeContract({
        account: this.account,
        chain: monadTestnet,
        address: ADDRESSES.USDC,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount],
      });
      await this.publicClient.waitForTransactionReceipt({ hash });
    }
  }

  /**
   * Buy shares with USDC
   *
   * IMPORTANT: This method routes through x402-agent-trade endpoint to ensure
   * all trades are tracked. Costs 0.01 USDC for the API call + trade amount.
   */
  async buy(
    marketAddress: `0x${string}`,
    isYes: boolean,
    usdcAmount: string,
    minShares: bigint = 0n
  ): Promise<TradeResult> {
    validateAddress(marketAddress, 'marketAddress');
    validatePositiveAmount(usdcAmount, 'usdcAmount');
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    // MUST go through x402 endpoint for tracking (costs 0.01 USDC)
    const instructions = await this.getTradeInstructions({
      marketAddress,
      direction: 'buy',
      outcome: isYes ? 'yes' : 'no',
      amount: usdcAmount,
      minOutput: minShares.toString(),
    });

    // Validate server-provided calldata before signing
    if (instructions.approval) {
      const approvalTo = (instructions.approval.to as string).toLowerCase();
      if (approvalTo !== ADDRESSES.USDC.toLowerCase()) {
        throw new Error(`Unexpected approval target: ${approvalTo}. Expected USDC: ${ADDRESSES.USDC}`);
      }
      const approvalHash = await this.walletClient.sendTransaction({
        account: this.account,
        chain: monadTestnet,
        to: instructions.approval.to as `0x${string}`,
        data: instructions.approval.data as `0x${string}`,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approvalHash });
    }

    const tradeTo = (instructions.trade.to as string).toLowerCase();
    if (tradeTo !== marketAddress.toLowerCase()) {
      throw new Error(`Unexpected trade target: ${tradeTo}. Expected market: ${marketAddress}`);
    }

    // Execute trade using calldata from x402 endpoint
    // Explicit gas limit needed for LS-LMSR's complex binary search + exp/ln math
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: instructions.trade.to as `0x${string}`,
      data: instructions.trade.data as `0x${string}`,
      gas: 3_000_000n,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      throw new Error('Transaction reverted on-chain');
    }

    // Parse SharesPurchased event to get actual shares and cost
    let shares = parseUnits(usdcAmount, USDC_DECIMALS);
    let cost = shares;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: LSLMSR_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'SharesPurchased') {
          const args = decoded.args as unknown as { shares: bigint; cost: bigint };
          shares = args.shares;
          cost = args.cost;
          break;
        }
      } catch {
        // Not this event
      }
    }

    return {
      txHash: hash,
      shares,
      cost,
      isYes,
      isBuy: true,
    };
  }

  /**
   * Sell shares for USDC
   *
   * IMPORTANT: This method routes through x402-agent-trade endpoint to ensure
   * all trades are tracked. Costs 0.01 USDC for the API call.
   */
  async sell(
    marketAddress: `0x${string}`,
    isYes: boolean,
    shares: bigint,
    minPayout: bigint = 0n
  ): Promise<TradeResult> {
    validateAddress(marketAddress, 'marketAddress');
    if (shares <= 0n) {
      throw new Error('Invalid shares: must be greater than 0');
    }
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    // Convert shares to decimal string (shares have 18 decimals)
    const sharesDecimal = formatUnits(shares, 18);

    // MUST go through x402 endpoint for tracking (costs 0.01 USDC)
    const instructions = await this.getTradeInstructions({
      marketAddress,
      direction: 'sell',
      outcome: isYes ? 'yes' : 'no',
      amount: sharesDecimal,
      minOutput: minPayout.toString(),
    });

    // For sells, we need to approve the share token first
    const tokenAddress = await this.publicClient.readContract({
      address: marketAddress,
      abi: LSLMSR_ABI,
      functionName: isYes ? 'yesToken' : 'noToken',
    }) as `0x${string}`;

    const allowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account.address, marketAddress],
    }) as bigint;

    if (allowance < shares) {
      const approveHash = await this.walletClient.writeContract({
        account: this.account,
        chain: monadTestnet,
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [marketAddress, shares],
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    // Validate server-provided trade calldata target
    const tradeTo = (instructions.trade.to as string).toLowerCase();
    if (tradeTo !== marketAddress.toLowerCase()) {
      throw new Error(`Unexpected trade target: ${tradeTo}. Expected market: ${marketAddress}`);
    }

    // Execute trade using calldata from x402 endpoint
    // Explicit gas limit needed for LS-LMSR's complex binary search + exp/ln math
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: instructions.trade.to as `0x${string}`,
      data: instructions.trade.data as `0x${string}`,
      gas: 3_000_000n,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      throw new Error('Transaction reverted on-chain');
    }

    // Parse SharesSold event to get actual shares sold and payout
    let actualShares = shares;
    let payout = 0n;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: LSLMSR_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'SharesSold') {
          const args = decoded.args as unknown as { shares: bigint; payout: bigint };
          actualShares = args.shares;
          payout = args.payout;
          break;
        }
      } catch {
        // Not this event
      }
    }

    return {
      txHash: hash,
      shares: actualShares,
      cost: payout,
      isYes,
      isBuy: false,
    };
  }

  /**
   * Redeem winning shares after resolution
   *
   * IMPORTANT: Routes through x402-redeem endpoint for tracking (0.01 USDC)
   */
  async redeem(marketAddress: `0x${string}`): Promise<`0x${string}`> {
    validateAddress(marketAddress, 'marketAddress');
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    // MUST go through x402 endpoint for tracking
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(`${this.apiUrl}${API_ENDPOINTS.x402Redeem}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress,
        userAddress: this.account.address,
      }),
    });

    if (response.status === 402) {
      throw new Error('Payment required for redeem instructions (0.01 USDC)');
    }

    const data = await response.json() as {
      success: boolean;
      error?: string;
      transaction?: { to: string; data: string };
    };

    if (!data.success) {
      throw new Error(data.error || 'Failed to get redeem instructions');
    }

    if (!data.transaction) {
      throw new Error('Server response missing transaction data');
    }

    // Validate the redeem transaction target matches the market
    const redeemTo = data.transaction.to.toLowerCase();
    if (redeemTo !== marketAddress.toLowerCase()) {
      throw new Error(`Unexpected redeem target: ${redeemTo}. Expected market: ${marketAddress}`);
    }

    // Execute the redeem transaction
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: data.transaction.to as `0x${string}`,
      data: data.transaction.data as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ==================== Position Queries (x402 Protected) ====================

  /**
   * Get user's position in a market (requires x402 payment - 0.01 USDC)
   */
  async getPosition(marketAddress: `0x${string}`, userAddress?: `0x${string}`): Promise<Position> {
    const address = userAddress || this.account?.address;
    if (!address) {
      throw new Error('No address provided and no wallet configured');
    }

    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(
      `${this.apiUrl}${API_ENDPOINTS.x402Position}?market=${marketAddress}&user=${address}`,
      { method: 'GET' }
    );

    if (response.status === 402) {
      throw new Error('Payment required for position (0.01 USDC)');
    }

    if (!response.ok) {
      throw new Error('Failed to fetch position');
    }

    const data = await response.json() as {
      success: boolean;
      position: {
        yesShares: string;
        noShares: string;
        yesValue: string;
        noValue: string;
        totalValue: string;
      };
    };

    return {
      yesShares: BigInt(data.position.yesShares),
      noShares: BigInt(data.position.noShares),
      yesValue: BigInt(Math.floor(parseFloat(data.position.yesValue) * 1e6)),
      noValue: BigInt(Math.floor(parseFloat(data.position.noValue) * 1e6)),
      totalValue: BigInt(Math.floor(parseFloat(data.position.totalValue) * 1e6)),
    };
  }

  /**
   * Get full portfolio with all positions across all markets (requires x402 payment - 0.01 USDC)
   *
   * Returns all markets where the user has a position, with current values and P&L.
   * Use this for portfolio health checks and monitoring.
   *
   * @example
   * ```typescript
   * const portfolio = await client.getPortfolio();
   * console.log(`Total positions: ${portfolio.summary.totalPositions}`);
   * console.log(`Total value: $${portfolio.summary.totalValue} USDC`);
   *
   * for (const position of portfolio.positions) {
   *   console.log(`${position.marketQuestion}: ${position.totalValue} USDC`);
   * }
   * ```
   */
  async getPortfolio(userAddress?: `0x${string}`): Promise<Portfolio> {
    const address = userAddress || this.account?.address;
    if (!address) {
      throw new Error('No address provided and no wallet configured');
    }

    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(
      `${this.apiUrl}${API_ENDPOINTS.x402Portfolio}?user=${address}`,
      { method: 'GET' }
    );

    if (response.status === 402) {
      throw new Error('Payment required for portfolio (0.01 USDC)');
    }

    if (!response.ok) {
      throw new Error('Failed to fetch portfolio');
    }

    const data = await response.json() as {
      success: boolean;
      positions: Array<{
        marketAddress: string;
        marketQuestion: string;
        yesShares: string;
        noShares: string;
        yesSharesFormatted: string;
        noSharesFormatted: string;
        currentYesPrice: number;
        currentNoPrice: number;
        yesValue: string;
        noValue: string;
        totalValue: string;
        resolved: boolean;
        yesWins: boolean;
      }>;
      summary: {
        totalPositions: number;
        totalValue: string;
        marketsWithPositions: number;
      };
    };

    return {
      positions: data.positions.map(p => ({
        marketAddress: p.marketAddress as `0x${string}`,
        marketQuestion: p.marketQuestion,
        yesShares: BigInt(p.yesShares),
        noShares: BigInt(p.noShares),
        yesSharesFormatted: p.yesSharesFormatted,
        noSharesFormatted: p.noSharesFormatted,
        currentYesPrice: p.currentYesPrice,
        currentNoPrice: p.currentNoPrice,
        yesValue: p.yesValue,
        noValue: p.noValue,
        totalValue: p.totalValue,
        resolved: p.resolved,
        yesWins: p.yesWins,
      })),
      summary: data.summary,
    };
  }

  /**
   * Get USDC balance
   */
  async getUSDCBalance(userAddress?: `0x${string}`): Promise<string> {
    const address = userAddress || this.account?.address;
    if (!address) {
      throw new Error('No address provided and no wallet configured');
    }

    const balance = await this.publicClient.readContract({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as bigint;

    return formatUnits(balance, USDC_DECIMALS);
  }

  /**
   * Get MON (native token) balance for gas
   */
  async getMONBalance(userAddress?: `0x${string}`): Promise<string> {
    const address = userAddress || this.account?.address;
    if (!address) {
      throw new Error('No address provided and no wallet configured');
    }

    const balance = await this.publicClient.getBalance({ address });
    return formatUnits(balance, 18);
  }

  // ==================== Market Info (x402 Protected) ====================

  /**
   * Get full market information (requires x402 payment - 0.01 USDC)
   */
  async getMarketInfo(marketAddress: `0x${string}`): Promise<{
    question: string;
    resolutionTime: bigint;
    oracle: `0x${string}`;
    yesPrice: number;
    noPrice: number;
    yesProbability: number;
    noProbability: number;
    yesShares: bigint;
    noShares: bigint;
    totalCollateral: bigint;
    liquidityParam: bigint;
    resolved: boolean;
    yesWins: boolean;
    marketCreator: `0x${string}`;
    initialized: boolean;
    canResolve: boolean;
  }> {
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(
      `${this.apiUrl}${API_ENDPOINTS.x402MarketInfo}?market=${marketAddress}`,
      { method: 'GET' }
    );

    if (response.status === 402) {
      throw new Error('Payment required for market info (0.01 USDC)');
    }

    if (!response.ok) {
      throw new Error('Failed to fetch market info');
    }

    const data = await response.json() as {
      success: boolean;
      market: {
        question: string;
        resolutionTime: number;
        oracle: string;
        marketCreator: string;
        initialized: boolean;
        resolved: boolean;
        yesWins: boolean;
        canResolve: boolean;
      };
      prices: { yes: number; no: number };
      probability: { yes: number; no: number };
      shares: { yes: string; no: string };
      liquidity: { totalCollateral: string; liquidityParameter: string };
    };

    return {
      question: data.market.question,
      resolutionTime: BigInt(data.market.resolutionTime),
      oracle: data.market.oracle as `0x${string}`,
      yesPrice: data.prices.yes,
      noPrice: data.prices.no,
      yesProbability: data.probability.yes,
      noProbability: data.probability.no,
      yesShares: BigInt(data.shares.yes),
      noShares: BigInt(data.shares.no),
      totalCollateral: BigInt(data.liquidity.totalCollateral),
      liquidityParam: BigInt(data.liquidity.liquidityParameter),
      resolved: data.market.resolved,
      yesWins: data.market.yesWins,
      marketCreator: data.market.marketCreator as `0x${string}`,
      initialized: data.market.initialized,
      canResolve: data.market.canResolve,
    };
  }

  // ==================== Market Resolution (x402 Protected) ====================

  /**
   * Get resolve calldata and execute (requires x402 payment - 0.01 USDC)
   *
   * @example
   * ```typescript
   * // As the oracle, resolve the market
   * const txHash = await client.resolve('0x...', true); // YES wins
   * console.log('Market resolved:', txHash);
   * ```
   */
  async resolve(marketAddress: `0x${string}`, yesWins: boolean): Promise<`0x${string}`> {
    validateAddress(marketAddress, 'marketAddress');
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(`${this.apiUrl}${API_ENDPOINTS.x402Resolve}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress,
        yesWins,
        callerAddress: this.account.address,
      }),
    });

    if (response.status === 402) {
      throw new Error('Payment required for resolve instructions (0.01 USDC)');
    }

    const data = await response.json() as {
      success: boolean;
      error?: string;
      transaction?: { to: string; data: string };
      oracle?: string;
    };

    if (!data.success) {
      throw new Error(data.error || 'Failed to get resolve instructions');
    }

    if (!data.transaction) {
      throw new Error('Server response missing transaction data');
    }

    const resolveTo = data.transaction.to.toLowerCase();
    if (resolveTo !== marketAddress.toLowerCase()) {
      throw new Error(`Unexpected resolve target: ${resolveTo}. Expected market: ${marketAddress}`);
    }

    // Execute the transaction
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: data.transaction.to as `0x${string}`,
      data: data.transaction.data as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Check if market can be resolved (requires x402 payment - 0.01 USDC for market info)
   */
  async canResolve(marketAddress: `0x${string}`): Promise<{
    canResolve: boolean;
    reason?: string;
    resolutionTime: Date;
    isOracle: boolean;
  }> {
    // Uses getMarketInfo which is already x402 protected
    const info = await this.getMarketInfo(marketAddress);

    const resolutionDate = new Date(Number(info.resolutionTime) * 1000);
    const now = new Date();
    const isOracle = this.account ? info.oracle.toLowerCase() === this.account.address.toLowerCase() : false;

    if (info.resolved) {
      return { canResolve: false, reason: 'Market already resolved', resolutionTime: resolutionDate, isOracle };
    }

    if (now < resolutionDate) {
      return { canResolve: false, reason: `Resolution time not reached (${resolutionDate.toISOString()})`, resolutionTime: resolutionDate, isOracle };
    }

    if (!isOracle) {
      return { canResolve: false, reason: `Not the oracle (oracle is ${info.oracle})`, resolutionTime: resolutionDate, isOracle };
    }

    return { canResolve: true, resolutionTime: resolutionDate, isOracle };
  }

  // ==================== Fee Claiming (x402 Protected) ====================

  /**
   * Get fee information and claim calldata (requires x402 payment - 0.01 USDC)
   * Note: 0.5% trading fee goes 100% to market creator (no protocol fee)
   */
  async getFeeInfo(marketAddress: `0x${string}`): Promise<{
    pendingCreatorFees: bigint;
    pendingCreatorFeesFormatted: string;
    marketCreator: `0x${string}`;
    isCreator: boolean;
    transactions: Array<{ to: string; data: string; description: string; type: string }>;
  }> {
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(`${this.apiUrl}${API_ENDPOINTS.x402ClaimFees}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress,
        callerAddress: this.account?.address,
      }),
    });

    if (response.status === 402) {
      throw new Error('Payment required for fee info (0.01 USDC)');
    }

    if (!response.ok) {
      throw new Error('Failed to fetch fee info');
    }

    const data = await response.json() as {
      success: boolean;
      marketCreator: string;
      isCreator: boolean | null;
      fees: {
        pending: string;
        pendingFormatted: string;
      };
      transactions: Array<{ to: string; data: string; description: string; type: string }>;
    };

    return {
      pendingCreatorFees: BigInt(data.fees.pending),
      pendingCreatorFeesFormatted: data.fees.pendingFormatted.replace(' USDC', ''),
      marketCreator: data.marketCreator as `0x${string}`,
      isCreator: data.isCreator || false,
      transactions: data.transactions,
    };
  }

  /**
   * Claim accumulated creator fees (requires x402 payment - 0.01 USDC)
   *
   * @example
   * ```typescript
   * const feeInfo = await client.getFeeInfo('0x...');
   * console.log('Pending fees:', feeInfo.pendingCreatorFeesFormatted, 'USDC');
   *
   * if (feeInfo.pendingCreatorFees > 0n) {
   *   const txHash = await client.claimCreatorFees('0x...');
   *   console.log('Fees claimed:', txHash);
   * }
   * ```
   */
  async claimCreatorFees(marketAddress: `0x${string}`): Promise<`0x${string}`> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    // Get fee info which includes the claim transaction calldata
    const feeInfo = await this.getFeeInfo(marketAddress);
    const claimTx = feeInfo.transactions.find(tx => tx.type === 'claimCreatorFees');

    if (!claimTx) {
      throw new Error('No fees to claim');
    }

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: claimTx.to as `0x${string}`,
      data: claimTx.data as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Withdraw excess collateral after market resolution (requires x402 payment - 0.01 USDC)
   */
  async withdrawExcessCollateral(marketAddress: `0x${string}`): Promise<`0x${string}`> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    // Get fee info which includes the withdraw transaction calldata
    const feeInfo = await this.getFeeInfo(marketAddress);
    const withdrawTx = feeInfo.transactions.find(tx => tx.type === 'withdrawExcessCollateral');

    if (!withdrawTx) {
      throw new Error('No excess collateral to withdraw (market may not be resolved)');
    }

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: withdrawTx.to as `0x${string}`,
      data: withdrawTx.data as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ==================== Market Initialization ====================

  /**
   * Initialize a deployed market with initial liquidity
   *
   * IMPORTANT: Routes through x402-initialize endpoint for tracking (0.01 USDC)
   *
   * @param marketAddress The deployed market contract address
   * @param usdcAmount Initial liquidity in USDC (e.g., "10" for 10 USDC)
   */
  async initializeMarket(marketAddress: `0x${string}`, usdcAmount: string): Promise<`0x${string}`> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    // MUST go through x402 endpoint for tracking
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(`${this.apiUrl}${API_ENDPOINTS.x402Initialize}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress,
        initialLiquidity: usdcAmount,
        callerAddress: this.account.address,
      }),
    });

    if (response.status === 402) {
      throw new Error('Payment required for initialize instructions (0.01 USDC)');
    }

    const data = await response.json() as {
      success: boolean;
      error?: string;
      transactions?: Array<{ to: string; data: string; type: string }>;
    };

    if (!data.success) {
      throw new Error(data.error || 'Failed to get initialize instructions');
    }

    // Execute approval first
    const approveTx = data.transactions!.find(tx => tx.type === 'approve');
    if (approveTx) {
      const approveHash = await this.walletClient.sendTransaction({
        account: this.account,
        chain: monadTestnet,
        to: approveTx.to as `0x${string}`,
        data: approveTx.data as `0x${string}`,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    // Execute initialize
    const initTx = data.transactions!.find(tx => tx.type === 'initialize');
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: initTx!.to as `0x${string}`,
      data: initTx!.data as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ==================== Utility ====================

  /**
   * Get connected wallet address
   */
  getAddress(): `0x${string}` | null {
    return this.account?.address || null;
  }

  /**
   * Format USDC amount for display
   */
  formatUSDC(amount: bigint): string {
    return formatUnits(amount, USDC_DECIMALS);
  }

  /**
   * Parse USDC amount from string
   */
  parseUSDC(amount: string): bigint {
    return parseUnits(amount, USDC_DECIMALS);
  }

  /**
   * Get x402 pricing info for all endpoints
   */
  getX402Prices() {
    return {
      markets: { raw: X402_CONFIG.prices.markets, formatted: '0.01 USDC', description: 'List all markets' },
      prices: { raw: X402_CONFIG.prices.prices, formatted: '0.01 USDC', description: 'Get market prices' },
      marketInfo: { raw: X402_CONFIG.prices.marketInfo, formatted: '0.01 USDC', description: 'Full market info' },
      position: { raw: X402_CONFIG.prices.position, formatted: '0.01 USDC', description: 'Position in single market' },
      portfolio: { raw: X402_CONFIG.prices.portfolio, formatted: '0.01 USDC', description: 'Full portfolio (all positions)' },
      marketData: { raw: X402_CONFIG.prices.marketData, formatted: '0.01 USDC', description: 'Premium market data' },
      tradeInstructions: { raw: X402_CONFIG.prices.tradeInstructions, formatted: '0.01 USDC', description: 'Get trade calldata' },
      createMarket: { raw: X402_CONFIG.prices.createMarket, formatted: '0.01 USDC', description: 'List market for discovery' },
    };
  }
}

export default RBSPMClient;
