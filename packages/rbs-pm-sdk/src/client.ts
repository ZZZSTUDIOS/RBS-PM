// RBS Prediction Market SDK Client
// Main entry point for AI agents to interact with prediction markets

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type PublicClient,
  type WalletClient,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createX402Fetch } from './x402';
import { MONAD_TESTNET, ADDRESSES, API_ENDPOINTS, API_CONFIG, X402_CONFIG, LSLMSR_ABI, ERC20_ABI } from './constants';
import type {
  RBSPMConfig,
  Market,
  MarketPrices,
  TradeQuote,
  TradeResult,
  Position,
  AuthResult,
  PremiumMarketData,
  MarketCreateParams,
  MarketCreateResult,
} from './types';

// USDC decimals
const USDC_DECIMALS = 6;

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
   * Initialize x402 client for automatic payment handling
   */
  private initX402Client(): void {
    if (!this.walletClient || !this.account) return;

    // Create fetch wrapper that automatically handles x402 payments
    this.x402PaymentFetch = createX402Fetch(this.walletClient, this.account);
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
   * Get all active markets (requires x402 payment - 0.0001 USDC)
   */
  async getMarkets(): Promise<Market[]> {
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(`${this.apiUrl}${API_ENDPOINTS.x402Markets}`, {
      method: 'GET',
    });

    if (response.status === 402) {
      throw new Error('Payment required for market list (0.0001 USDC)');
    }

    if (!response.ok) {
      throw new Error('Failed to fetch markets');
    }

    const data = await response.json() as { success: boolean; markets: Market[] };
    return data.markets;
  }

  /**
   * Get premium market data (requires x402 payment - 0.0001 USDC)
   */
  async getPremiumMarketData(marketAddress: `0x${string}`): Promise<PremiumMarketData> {
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(
      `${this.apiUrl}${API_ENDPOINTS.x402MarketData}?market=${marketAddress}`,
      { method: 'GET' }
    );

    if (response.status === 402) {
      throw new Error('Payment required for premium market data (0.0001 USDC)');
    }

    if (!response.ok) {
      const errorData = await response.json() as { error?: string };
      throw new Error(errorData.error || 'Failed to fetch premium market data');
    }

    return response.json() as Promise<PremiumMarketData>;
  }

  // ==================== Market Listing ====================

  /**
   * List a deployed market in the discovery index (requires 0.0001 USDC x402 payment)
   *
   * After deploying a market contract on-chain, call this method to make it
   * discoverable by other agents. The listing fee (0.0001 USDC) is paid via x402.
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
    console.log('This will cost 0.0001 USDC (paid via x402)');

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
      throw new Error(`Payment required: 0.0001 USDC listing fee. Challenge: ${JSON.stringify(challenge)}`);
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

  // ==================== Trade Instructions (x402 Protected) ====================

  /**
   * Get encoded trade calldata (requires x402 payment - 0.0001 USDC)
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
  async getTradeInstructions(params: {
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
      throw new Error('Payment required for trade instructions (0.0001 USDC)');
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
   * Get current prices for a market (requires x402 payment - 0.0001 USDC)
   */
  async getPrices(marketAddress: `0x${string}`): Promise<MarketPrices> {
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(
      `${this.apiUrl}${API_ENDPOINTS.x402Prices}?market=${marketAddress}`,
      { method: 'GET' }
    );

    if (response.status === 402) {
      throw new Error('Payment required for prices (0.0001 USDC)');
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
   * Get quote for buying shares with USDC
   */
  async getBuyQuote(
    marketAddress: `0x${string}`,
    isYes: boolean,
    usdcAmount: string
  ): Promise<TradeQuote> {
    const amountInUnits = parseUnits(usdcAmount, USDC_DECIMALS);

    // Estimate shares for USDC amount
    const shares = await this.publicClient.readContract({
      address: marketAddress,
      abi: LSLMSR_ABI,
      functionName: 'estimateSharesForPayment',
      args: [isYes, amountInUnits],
    }) as bigint;

    const prices = await this.getPrices(marketAddress);
    const currentPrice = isYes ? prices.yes : prices.no;

    return {
      shares,
      cost: amountInUnits,
      priceImpact: 0, // Would need more complex calculation
      averagePrice: currentPrice,
    };
  }

  /**
   * Get quote for selling shares
   */
  async getSellQuote(
    marketAddress: `0x${string}`,
    isYes: boolean,
    shares: bigint
  ): Promise<{ payout: bigint; priceImpact: number }> {
    const payout = await this.publicClient.readContract({
      address: marketAddress,
      abi: LSLMSR_ABI,
      functionName: 'getPayoutForSellInCollateral',
      args: [isYes, shares],
    }) as bigint;

    return {
      payout,
      priceImpact: 0,
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
   * all trades are tracked. Costs 0.0001 USDC for the API call + trade amount.
   */
  async buy(
    marketAddress: `0x${string}`,
    isYes: boolean,
    usdcAmount: string,
    minShares: bigint = 0n
  ): Promise<TradeResult> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    // MUST go through x402 endpoint for tracking (costs 0.0001 USDC)
    const instructions = await this.getTradeInstructions({
      marketAddress,
      direction: 'buy',
      outcome: isYes ? 'yes' : 'no',
      amount: usdcAmount,
      minOutput: minShares.toString(),
    });

    // Execute approval if needed
    if (instructions.approval) {
      const approvalHash = await this.walletClient.sendTransaction({
        account: this.account,
        chain: monadTestnet,
        to: instructions.approval.to as `0x${string}`,
        data: instructions.approval.data as `0x${string}`,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approvalHash });
    }

    // Execute trade using calldata from x402 endpoint
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: instructions.trade.to as `0x${string}`,
      data: instructions.trade.data as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });

    const amountInUnits = parseUnits(usdcAmount, USDC_DECIMALS);

    return {
      txHash: hash,
      shares: amountInUnits, // Approximate, would need event parsing
      cost: amountInUnits,
      isYes,
      isBuy: true,
    };
  }

  /**
   * Sell shares for USDC
   *
   * IMPORTANT: This method routes through x402-agent-trade endpoint to ensure
   * all trades are tracked. Costs 0.0001 USDC for the API call.
   */
  async sell(
    marketAddress: `0x${string}`,
    isYes: boolean,
    shares: bigint,
    minPayout: bigint = 0n
  ): Promise<TradeResult> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    // Convert shares to decimal string (shares have 18 decimals)
    const sharesDecimal = formatUnits(shares, 18);

    // MUST go through x402 endpoint for tracking (costs 0.0001 USDC)
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

    // Execute trade using calldata from x402 endpoint
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: instructions.trade.to as `0x${string}`,
      data: instructions.trade.data as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });

    return {
      txHash: hash,
      shares,
      cost: 0n, // Would parse from event
      isYes,
      isBuy: false,
    };
  }

  /**
   * Redeem winning shares after resolution
   *
   * IMPORTANT: Routes through x402-redeem endpoint for tracking (0.0001 USDC)
   */
  async redeem(marketAddress: `0x${string}`): Promise<`0x${string}`> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    // MUST go through x402 endpoint for tracking
    const paymentFetch = this.getPaymentFetch();

    const response = await paymentFetch(`${this.apiUrl}/functions/v1/x402-redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress,
        userAddress: this.account.address,
      }),
    });

    if (response.status === 402) {
      throw new Error('Payment required for redeem instructions (0.0001 USDC)');
    }

    const data = await response.json() as {
      success: boolean;
      error?: string;
      transaction?: { to: string; data: string };
    };

    if (!data.success) {
      throw new Error(data.error || 'Failed to get redeem instructions');
    }

    // Execute the redeem transaction
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: data.transaction!.to as `0x${string}`,
      data: data.transaction!.data as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ==================== Position Queries (x402 Protected) ====================

  /**
   * Get user's position in a market (requires x402 payment - 0.0001 USDC)
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
      throw new Error('Payment required for position (0.0001 USDC)');
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
   * Get full market information (requires x402 payment - 0.0001 USDC)
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
      throw new Error('Payment required for market info (0.0001 USDC)');
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
   * Get resolve calldata and execute (requires x402 payment - 0.0001 USDC)
   *
   * @example
   * ```typescript
   * // As the oracle, resolve the market
   * const txHash = await client.resolve('0x...', true); // YES wins
   * console.log('Market resolved:', txHash);
   * ```
   */
  async resolve(marketAddress: `0x${string}`, yesWins: boolean): Promise<`0x${string}`> {
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
      throw new Error('Payment required for resolve instructions (0.0001 USDC)');
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

    // Execute the transaction
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: monadTestnet,
      to: data.transaction!.to as `0x${string}`,
      data: data.transaction!.data as `0x${string}`,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Check if market can be resolved (requires x402 payment - 0.0001 USDC for market info)
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
   * Get fee information and claim calldata (requires x402 payment - 0.0001 USDC)
   */
  async getFeeInfo(marketAddress: `0x${string}`): Promise<{
    pendingCreatorFees: bigint;
    pendingCreatorFeesFormatted: string;
    protocolFeesSent: bigint;
    protocolFeesSentFormatted: string;
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
      throw new Error('Payment required for fee info (0.0001 USDC)');
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
        protocolSent: string;
        protocolSentFormatted: string;
      };
      transactions: Array<{ to: string; data: string; description: string; type: string }>;
    };

    return {
      pendingCreatorFees: BigInt(data.fees.pending),
      pendingCreatorFeesFormatted: data.fees.pendingFormatted.replace(' USDC', ''),
      protocolFeesSent: BigInt(data.fees.protocolSent),
      protocolFeesSentFormatted: data.fees.protocolSentFormatted.replace(' USDC', ''),
      marketCreator: data.marketCreator as `0x${string}`,
      isCreator: data.isCreator || false,
      transactions: data.transactions,
    };
  }

  /**
   * Claim accumulated creator fees (requires x402 payment - 0.0001 USDC)
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
   * Withdraw excess collateral after market resolution (requires x402 payment - 0.0001 USDC)
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
   * IMPORTANT: Routes through x402-initialize endpoint for tracking (0.0001 USDC)
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

    const response = await paymentFetch(`${this.apiUrl}/functions/v1/x402-initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketAddress,
        initialLiquidity: usdcAmount,
        callerAddress: this.account.address,
      }),
    });

    if (response.status === 402) {
      throw new Error('Payment required for initialize instructions (0.0001 USDC)');
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
      markets: { raw: X402_CONFIG.prices.markets, formatted: '0.0001 USDC', description: 'List all markets' },
      marketData: { raw: X402_CONFIG.prices.marketData, formatted: '0.0001 USDC', description: 'Premium market data' },
      tradeInstructions: { raw: X402_CONFIG.prices.tradeInstructions, formatted: '0.0001 USDC', description: 'Get trade calldata' },
      createMarket: { raw: X402_CONFIG.prices.createMarket, formatted: '0.0001 USDC', description: 'List market for discovery' },
    };
  }
}

export default RBSPMClient;
