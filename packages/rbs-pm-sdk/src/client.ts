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
import { MONAD_TESTNET, ADDRESSES, API_ENDPOINTS, X402_CONFIG, LSLMSR_ABI, ERC20_ABI } from './constants';
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
    }
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
   * Create x402 payment header for API calls
   */
  private async createX402Payment(amount: string): Promise<string> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    const now = Math.floor(Date.now() / 1000);
    const validAfter = now - 60;
    const validBefore = now + 3600;

    // Generate random nonce
    const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const payload = {
      from: this.account.address,
      to: X402_CONFIG.recipient,
      value: amount,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    };

    // Sign the TransferWithAuthorization
    const signature = await this.walletClient.signTypedData({
      account: this.account,
      domain: {
        name: 'USDC',
        version: '2',
        chainId: MONAD_TESTNET.id,
        verifyingContract: ADDRESSES.USDC,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from: this.account.address,
        to: X402_CONFIG.recipient as `0x${string}`,
        value: BigInt(amount),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce as `0x${string}`,
      },
    });

    // Build payment header
    const payloadB64 = btoa(JSON.stringify(payload));
    return `x402 1:${X402_CONFIG.network}:${payloadB64}:${signature}`;
  }

  // ==================== Market Discovery ====================

  /**
   * Get all active markets
   */
  async getMarkets(): Promise<Market[]> {
    const response = await fetch(`${this.apiUrl}${API_ENDPOINTS.markets}&status=eq.active`, {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrY3l0cmRoZHRlbXlwaHNzd291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzNDA4ODcsImV4cCI6MjA2NDkxNjg4N30.cPJCkmn3Hgxz-GlHhEpjqNJsr_6zz_P4hTU3A-jJu4w',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch markets');
    }
    return response.json() as Promise<Market[]>;
  }

  /**
   * Get premium market data (requires x402 payment)
   */
  async getPremiumMarketData(marketAddress: `0x${string}`): Promise<PremiumMarketData> {
    const paymentHeader = await this.createX402Payment(X402_CONFIG.prices.marketData);

    const response = await fetch(
      `${this.apiUrl}${API_ENDPOINTS.x402MarketData}?market=${marketAddress}`,
      {
        headers: {
          'X-Payment': paymentHeader,
        },
      }
    );

    if (response.status === 402) {
      throw new Error('Payment required for premium market data');
    }

    if (!response.ok) {
      const errorData = await response.json() as { error?: string };
      throw new Error(errorData.error || 'Failed to fetch premium market data');
    }

    return response.json() as Promise<PremiumMarketData>;
  }

  // ==================== Market Creation ====================

  /**
   * Create and list a new market (requires 0.10 USDC x402 payment)
   */
  async createMarket(params: MarketCreateParams): Promise<MarketCreateResult> {
    const paymentHeader = await this.createX402Payment(X402_CONFIG.prices.createMarket);

    const response = await fetch(`${this.apiUrl}${API_ENDPOINTS.x402CreateMarket}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': paymentHeader,
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
      throw new Error('Payment required: 0.10 USDC listing fee');
    }

    const data = await response.json() as {
      error?: string;
      market?: { id: string; address: string; question: string; status: string };
    };
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create market');
    }

    return {
      success: true,
      market: data.market!,
      paymentAmount: X402_CONFIG.prices.createMarket,
    };
  }

  // ==================== Price Queries ====================

  /**
   * Get current prices for a market
   */
  async getPrices(marketAddress: `0x${string}`): Promise<MarketPrices> {
    const [yesPrice, noPrice] = await Promise.all([
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

    const yes = Number(yesPrice) / 1e18;
    const no = Number(noPrice) / 1e18;
    const total = yes + no;

    return {
      yes,
      no,
      impliedProbability: {
        yes: yes / total,
        no: no / total,
      },
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

    const amountInUnits = parseUnits(usdcAmount, USDC_DECIMALS);

    // Ensure USDC approval
    await this.ensureUSDCAllowance(marketAddress, amountInUnits);

    // Execute buy
    const hash = await this.walletClient.writeContract({
      account: this.account,
      chain: monadTestnet,
      address: marketAddress,
      abi: LSLMSR_ABI,
      functionName: 'buy',
      args: [isYes, amountInUnits, minShares],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    // Parse SharesPurchased event
    let shares = 0n;
    for (const log of receipt.logs) {
      try {
        // Would need proper event parsing
        shares = amountInUnits; // Approximate
      } catch {
        continue;
      }
    }

    return {
      txHash: hash,
      shares,
      cost: amountInUnits,
      isYes,
      isBuy: true,
    };
  }

  /**
   * Sell shares for USDC
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

    // Get the token address and approve
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

    // Execute sell
    const hash = await this.walletClient.writeContract({
      account: this.account,
      chain: monadTestnet,
      address: marketAddress,
      abi: LSLMSR_ABI,
      functionName: 'sell',
      args: [isYes, shares, minPayout],
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
   */
  async redeem(marketAddress: `0x${string}`): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new Error('Wallet not configured. Provide privateKey in constructor.');
    }

    const hash = await this.walletClient.writeContract({
      account: this.account!,
      chain: monadTestnet,
      address: marketAddress,
      abi: LSLMSR_ABI,
      functionName: 'redeem',
      args: [],
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ==================== Position Queries ====================

  /**
   * Get user's position in a market
   */
  async getPosition(marketAddress: `0x${string}`, userAddress?: `0x${string}`): Promise<Position> {
    const address = userAddress || this.account?.address;
    if (!address) {
      throw new Error('No address provided and no wallet configured');
    }

    const [yesToken, noToken] = await Promise.all([
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

    const [yesShares, noShares] = await Promise.all([
      this.publicClient.readContract({
        address: yesToken,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
      this.publicClient.readContract({
        address: noToken,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
    ]);

    const prices = await this.getPrices(marketAddress);
    const yesValue = BigInt(Math.floor(Number(yesShares) * prices.yes));
    const noValue = BigInt(Math.floor(Number(noShares) * prices.no));

    return {
      yesShares,
      noShares,
      yesValue,
      noValue,
      totalValue: yesValue + noValue,
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
   * Get x402 pricing info
   */
  getX402Prices() {
    return {
      marketData: { raw: X402_CONFIG.prices.marketData, formatted: '0.01 USDC' },
      createMarket: { raw: X402_CONFIG.prices.createMarket, formatted: '0.10 USDC' },
      agentTrade: { raw: X402_CONFIG.prices.agentTrade, formatted: '0.10 USDC' },
    };
  }
}

export default RBSPMClient;
