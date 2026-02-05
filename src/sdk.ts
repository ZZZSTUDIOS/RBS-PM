import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  encodeFunctionData,
  getContract,
} from 'viem';

// Monad Testnet chain config
export const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
    public: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
} as const;

// Contract addresses on Monad Testnet (you'll need to deploy these)
export const ADDRESSES = {
  // Doppler addresses (check docs.doppler.lol for current addresses)
  DOPPLER_AIRLOCK: '0x...' as Address, // TODO: Get from Doppler docs
  DOPPLER_BUNDLER: '0x...' as Address, // TODO: Get from Doppler docs
  
  // Wrapped MON (collateral)
  // Wrapped MON (collateral)
  WMON: '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541' as Address,
  
  // Your deployed factory (deploy first)
  PREDICTION_FACTORY: '0x...' as Address,
};

// Prediction Market Factory ABI (minimal)
const FACTORY_ABI = [
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
] as const;

// Prediction Market ABI (minimal)
const MARKET_ABI = [
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
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
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
    name: 'getRedemptionValue',
    type: 'function',
    inputs: [{ name: 'tokenAmount', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ERC20 ABI (minimal)
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

// Outcome enum matching Solidity
export enum Outcome {
  UNRESOLVED = 0,
  YES = 1,
  NO = 2,
  INVALID = 3,
}

/**
 * Configuration for creating a new prediction market
 */
export interface MarketConfig {
  question: string;
  resolutionTime: Date;
  oracle: Address;
  
  // Token config for YES outcome
  yesToken: {
    name: string;
    symbol: string;
    tokenURI: string;
    initialSupply: bigint;
    numTokensToSell: bigint;
  };
  
  // Token config for NO outcome  
  noToken: {
    name: string;
    symbol: string;
    tokenURI: string;
    initialSupply: bigint;
    numTokensToSell: bigint;
  };
}

/**
 * SDK for creating and managing prediction markets with Doppler on Monad
 */
export class DopplerPredictionMarketSDK {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  
  constructor(
    rpcUrl: string = monadTestnet.rpcUrls.default.http[0],
    private account?: Address
  ) {
    this.publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(rpcUrl),
    });
    
    if (account) {
      this.walletClient = createWalletClient({
        chain: monadTestnet,
        transport: http(rpcUrl),
        account,
      });
    }
  }

  /**
   * Set the wallet client with a private key
   */
  setWallet(privateKey: `0x${string}`) {
    const { privateKeyToAccount } = require('viem/accounts');
    const account = privateKeyToAccount(privateKey);
    
    this.walletClient = createWalletClient({
      chain: monadTestnet,
      transport: http(),
      account,
    });
    
    this.account = account.address;
  }

  /**
   * Build Doppler multicurve auction parameters for an outcome token
   */
  buildOutcomeTokenParams(
    config: MarketConfig['yesToken'],
    userAddress: Address
  ) {
    // Multicurve configuration for prediction market tokens
    // Start price low, allow discovery up to a cap
    return {
      tokenConfig: {
        name: config.name,
        symbol: config.symbol,
        tokenURI: config.tokenURI,
      },
      saleConfig: {
        initialSupply: config.initialSupply,
        numTokensToSell: config.numTokensToSell,
        numeraire: ADDRESSES.WMON, // Settle in WMON
      },
      // Bonding curve that starts at low market cap
      // and allows price discovery
      curves: [
        {
          // Early buyers get better prices
          marketCap: { start: 1_000, end: 10_000 },   // $1k - $10k
          numPositions: 5,
          shares: parseEther('0.3'),  // 30% of supply in this range
        },
        {
          // Main trading range
          marketCap: { start: 10_000, end: 100_000 }, // $10k - $100k
          numPositions: 10,
          shares: parseEther('0.5'),  // 50% of supply
        },
        {
          // High conviction range
          marketCap: { start: 100_000, end: 'max' },  // $100k+
          numPositions: 5,
          shares: parseEther('0.2'),  // 20% of supply
        },
      ],
      governance: { type: 'noOp' },      // No governance needed
      migration: { type: 'noOp' },        // No migration
      userAddress,
    };
  }

  /**
   * Create outcome tokens using Doppler SDK
   * Returns the token addresses after launch
   */
  async createOutcomeTokens(config: MarketConfig): Promise<{
    yesTokenAddress: Address;
    noTokenAddress: Address;
    yesPoolId: string;
    noPoolId: string;
  }> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not connected');
    }

    // In production, you'd use the Doppler SDK here:
    // 
    // import { DopplerSDK } from '@whetstone-research/doppler-sdk';
    // 
    // const sdk = new DopplerSDK({
    //   publicClient: this.publicClient,
    //   walletClient: this.walletClient,
    //   chainId: monadTestnet.id,
    // });
    // 
    // const yesParams = sdk
    //   .buildMulticurveAuction()
    //   .tokenConfig(this.buildOutcomeTokenParams(config.yesToken, this.account).tokenConfig)
    //   .saleConfig(this.buildOutcomeTokenParams(config.yesToken, this.account).saleConfig)
    //   .withCurves({ ... })
    //   .build();
    //
    // const yesResult = await sdk.factory.createMulticurve(yesParams);
    // const noResult = await sdk.factory.createMulticurve(noParams);

    console.log('📝 To create outcome tokens, use the Doppler SDK:');
    console.log('');
    console.log('YES Token Config:', config.yesToken);
    console.log('NO Token Config:', config.noToken);
    
    // Return placeholder - in production this would return actual addresses
    return {
      yesTokenAddress: '0x...' as Address,
      noTokenAddress: '0x...' as Address,
      yesPoolId: '',
      noPoolId: '',
    };
  }

  /**
   * Create the prediction market contract after tokens are launched
   */
  async createMarket(
    yesTokenAddress: Address,
    noTokenAddress: Address,
    question: string,
    resolutionTime: Date,
    oracle: Address
  ): Promise<{ marketAddress: Address; txHash: Hash }> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not connected');
    }

    const { request } = await this.publicClient.simulateContract({
      address: ADDRESSES.PREDICTION_FACTORY,
      abi: FACTORY_ABI,
      functionName: 'createMarket',
      args: [
        yesTokenAddress,
        noTokenAddress,
        question,
        BigInt(Math.floor(resolutionTime.getTime() / 1000)),
        oracle,
      ],
      account: this.account,
    });

    const txHash = await this.walletClient.writeContract(request);
    
    // Wait for transaction and get the market address from events
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    
    // Parse MarketCreated event to get address
    // In production, decode the event logs properly
    const marketAddress = '0x...' as Address; // Decode from receipt.logs
    
    return { marketAddress, txHash };
  }

  /**
   * Deposit collateral into a market to back redemptions
   */
  async depositCollateral(marketAddress: Address, amount: bigint): Promise<Hash> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not connected');
    }

    // First approve the market to spend collateral
    const approveHash = await this.walletClient.writeContract({
      address: ADDRESSES.WMON,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [marketAddress, amount],
    });
    await this.publicClient.waitForTransactionReceipt({ hash: approveHash });

    // Then deposit
    const depositHash = await this.walletClient.writeContract({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'depositCollateral',
      args: [amount],
    });
    
    return depositHash;
  }

  /**
   * Resolve a market (oracle only)
   */
  async resolveMarket(marketAddress: Address, outcome: Outcome): Promise<Hash> {
    if (!this.walletClient) {
      throw new Error('Wallet not connected');
    }

    const hash = await this.walletClient.writeContract({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'resolve',
      args: [outcome],
    });
    
    return hash;
  }

  /**
   * Redeem winning tokens for collateral
   */
  async redeem(marketAddress: Address, amount: bigint): Promise<Hash> {
    if (!this.walletClient) {
      throw new Error('Wallet not connected');
    }

    const hash = await this.walletClient.writeContract({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'redeem',
      args: [amount],
    });
    
    return hash;
  }

  /**
   * Get market status
   */
  async getMarketStatus(marketAddress: Address) {
    const [resolved, outcome] = await Promise.all([
      this.publicClient.readContract({
        address: marketAddress,
        abi: MARKET_ABI,
        functionName: 'resolved',
      }),
      this.publicClient.readContract({
        address: marketAddress,
        abi: MARKET_ABI,
        functionName: 'outcome',
      }),
    ]);

    return {
      resolved,
      outcome: outcome as Outcome,
      outcomeName: Outcome[outcome as number],
    };
  }

  /**
   * Get redemption value for a token amount
   */
  async getRedemptionValue(marketAddress: Address, amount: bigint): Promise<bigint> {
    return this.publicClient.readContract({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'getRedemptionValue',
      args: [amount],
    }) as Promise<bigint>;
  }

  /**
   * Get token balance
   */
  async getTokenBalance(tokenAddress: Address, account: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account],
    }) as Promise<bigint>;
  }
}

export default DopplerPredictionMarketSDK;
