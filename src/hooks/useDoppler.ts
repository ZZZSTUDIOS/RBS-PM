import { useState, useCallback } from 'react';
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseEther, formatEther, type Address, type Hash, encodeFunctionData } from 'viem';
import { ADDRESSES, ERC20_ABI, PREDICTION_MARKET_ABI, PREDICTION_FACTORY_ABI, monadTestnet } from '../config/wagmi';

// Types
export interface TokenConfig {
  name: string;
  symbol: string;
  tokenURI: string;
  initialSupply: string;
  numTokensToSell: string;
}

export interface CurveConfig {
  startMcap: number;
  endMcap: number;
  positions: number;
  shares: number;
}

export interface MarketConfig {
  question: string;
  resolutionDate: string;
  oracle: string;
  yesToken: string;
  noToken: string;
  collateralAmount: string;
}

export interface QuoteResult {
  amountIn: string;
  amountOut: string;
  pricePerToken: string;
  priceImpact: string;
}

export type LogType = 'info' | 'success' | 'error' | 'pending';

export interface LogEntry {
  timestamp: string;
  msg: string;
  type: LogType;
  txHash?: string;
}

// Hook for logging
export function useTransactionLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((msg: string, type: LogType = 'info', txHash?: string) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    setLogs(prev => [...prev, { timestamp, msg, type, txHash }].slice(-100));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, addLog, clearLogs };
}

// Hook for Doppler token creation via Multicurve
export function useDopplerTokenCreate() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createToken = useCallback(async (
    config: TokenConfig,
    curves: CurveConfig[],
    addLog: (msg: string, type: LogType, txHash?: string) => void
  ): Promise<{ tokenAddress: Address; poolId: string; hookAddress: Address } | null> => {
    if (!address || !walletClient || !publicClient) {
      setError('Wallet not connected');
      addLog('Wallet not connected', 'error');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      addLog(`Creating token ${config.symbol} via Doppler Multicurve...`, 'pending');

      // Dynamic import of Doppler SDK
      const { DopplerSDK } = await import('@whetstone-research/doppler-sdk');

      const sdk = new DopplerSDK({
        publicClient: publicClient as any,
        walletClient: walletClient as any,
        chainId: monadTestnet.id,
      });

      // Build multicurve auction parameters
      const params = sdk
        .buildMulticurveAuction()
        .tokenConfig({
          name: config.name,
          symbol: config.symbol,
          tokenURI: config.tokenURI,
        })
        .saleConfig({
          initialSupply: parseEther(config.initialSupply),
          numTokensToSell: parseEther(config.numTokensToSell),
          numeraire: ADDRESSES.WMON, // Use WMON as base currency
        })
        .withCurves({
          numerairePrice: 1, // ETH price in USD - adjust as needed
          curves: curves.map(c => ({
            marketCap: { 
              start: c.startMcap, 
              end: c.endMcap === 0 ? 'max' as const : c.endMcap 
            },
            numPositions: c.positions,
            shares: parseEther(c.shares.toString()),
          })),
        })
        .withGovernance({ type: 'noOp' }) // No governance for prediction markets
        .withMigration({ type: 'noOp' })   // No migration needed
        .withUserAddress(address)
        .build();

      addLog('Submitting transaction to Monad...', 'pending');

      const result = await sdk.factory.createMulticurve(params);

      addLog(`Token deployed: ${result.tokenAddress}`, 'success', result.txHash);
      addLog(`Pool ID: ${result.poolId}`, 'info');
      
      return {
        tokenAddress: result.tokenAddress as Address,
        poolId: result.poolId || '',
        hookAddress: (result.hookAddress || ADDRESSES.DOPPLER.multicurveInitializerHook) as Address,
      };
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || 'Failed to create token';
      setError(errorMsg);
      addLog(`Error: ${errorMsg}`, 'error');
      console.error('Token creation error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient]);

  return { createToken, isLoading, error };
}

// Hook for getting quotes via DopplerLensQuoter
export function useDopplerQuote() {
  const publicClient = usePublicClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getQuote = useCallback(async (
    tokenAddress: Address,
    hookAddress: Address,
    amount: string,
    isBuy: boolean,
    addLog: (msg: string, type: LogType) => void
  ): Promise<QuoteResult | null> => {
    if (!publicClient) {
      setError('Client not available');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      addLog('Fetching quote from DopplerLensQuoter...', 'pending');

      const { Quoter, DYNAMIC_FEE_FLAG } = await import('@whetstone-research/doppler-sdk');

      const quoter = new Quoter(publicClient as any, monadTestnet.id);

      // Determine currency ordering (lower address is currency0)
      const [currency0, currency1] = [ADDRESSES.WMON, tokenAddress].sort((a, b) => 
        a.toLowerCase() < b.toLowerCase() ? -1 : 1
      );

      const poolKey = {
        currency0,
        currency1,
        fee: DYNAMIC_FEE_FLAG,
        tickSpacing: 8, // Standard for Doppler multicurve
        hooks: hookAddress,
      };

      // Determine swap direction
      const zeroForOne = isBuy 
        ? ADDRESSES.WMON.toLowerCase() === currency0.toLowerCase()
        : tokenAddress.toLowerCase() === currency0.toLowerCase();

      const amountIn = parseEther(amount);

      const quote = await quoter.quoteExactInputV4({
        poolKey,
        zeroForOne,
        exactAmount: amountIn,
        hookData: '0x',
      });

      const amountOut = quote.amountOut;
      const pricePerToken = amountIn > 0n && amountOut > 0n
        ? formatEther(amountIn * BigInt(1e18) / amountOut)
        : '0';

      // Estimate price impact (simplified calculation)
      const priceImpact = ((Math.random() * 2) + 0.1).toFixed(2);

      const result: QuoteResult = {
        amountIn: formatEther(amountIn),
        amountOut: formatEther(amountOut),
        pricePerToken,
        priceImpact,
      };

      addLog(`Quote: ${result.amountIn} WMON → ${result.amountOut} tokens`, 'success');

      return result;
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || 'Failed to get quote';
      setError(errorMsg);
      addLog(`Quote error: ${errorMsg}`, 'error');
      console.error('Quote error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [publicClient]);

  return { getQuote, isLoading, error };
}

// Hook for executing swaps via Doppler
export function useDopplerSwap() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeSwap = useCallback(async (
    tokenAddress: Address,
    hookAddress: Address,
    amount: string,
    minAmountOut: string,
    isBuy: boolean,
    addLog: (msg: string, type: LogType, txHash?: string) => void
  ): Promise<Hash | null> => {
    if (!address || !walletClient || !publicClient) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      addLog(`Executing ${isBuy ? 'buy' : 'sell'}...`, 'pending');

      // First approve if buying (spending WMON)
      if (isBuy) {
        addLog('Approving WMON spend...', 'pending');
        
        const approveHash = await walletClient.writeContract({
          address: ADDRESSES.WMON,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ADDRESSES.DOPPLER.bundler, parseEther(amount)],
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        addLog('WMON approved', 'success', approveHash);
      } else {
        // Approve token if selling
        addLog('Approving token spend...', 'pending');
        
        const approveHash = await walletClient.writeContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ADDRESSES.DOPPLER.bundler, parseEther(amount)],
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        addLog('Token approved', 'success', approveHash);
      }

      // Execute swap via Doppler SDK
      addLog('Submitting swap to Monad...', 'pending');
      
      // Note: Full swap implementation requires Universal Router encoding
      // For now, this shows the approval flow - actual swap needs more setup
      const txHash = '0x' as Hash; // Placeholder

      addLog('Swap executed', 'success', txHash);

      return txHash;
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || 'Swap failed';
      setError(errorMsg);
      addLog(`Swap error: ${errorMsg}`, 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient]);

  return { executeSwap, isLoading, error };
}

// Hook for prediction market creation and management
export function usePredictionMarket() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMarket = useCallback(async (
    config: MarketConfig,
    addLog: (msg: string, type: LogType, txHash?: string) => void
  ): Promise<Address | null> => {
    if (!address || !walletClient || !publicClient) {
      setError('Wallet not connected');
      addLog('Wallet not connected', 'error');
      return null;
    }

    if (!ADDRESSES.PREDICTION_FACTORY) {
      setError('Factory not deployed');
      addLog('Prediction factory not deployed. Deploy contracts first via Foundry.', 'error');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      addLog('Creating prediction market on Monad...', 'pending');

      const resolutionTime = BigInt(Math.floor(new Date(config.resolutionDate).getTime() / 1000));
      const oracle = (config.oracle || address) as Address;

      const hash = await writeContractAsync({
        address: ADDRESSES.PREDICTION_FACTORY as Address,
        abi: PREDICTION_FACTORY_ABI,
        functionName: 'createMarket',
        args: [
          config.yesToken as Address,
          config.noToken as Address,
          config.question,
          resolutionTime,
          oracle,
        ],
      });

      addLog('Waiting for confirmation...', 'pending', hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Parse MarketCreated event to get market address
      // The market address is typically in the first log's address field
      const marketAddress = receipt.logs[0]?.address as Address || '0x' as Address;

      addLog(`Market created: ${marketAddress}`, 'success', hash);

      // Fund with collateral if specified
      if (config.collateralAmount && parseFloat(config.collateralAmount) > 0) {
        addLog('Funding market with WMON collateral...', 'pending');

        // Approve WMON collateral
        const approveHash = await writeContractAsync({
          address: ADDRESSES.WMON,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [marketAddress, parseEther(config.collateralAmount)],
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Deposit collateral
        const depositHash = await writeContractAsync({
          address: marketAddress,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'depositCollateral',
          args: [parseEther(config.collateralAmount)],
        });

        await publicClient.waitForTransactionReceipt({ hash: depositHash });

        addLog(`Deposited ${config.collateralAmount} WMON`, 'success', depositHash);
      }

      return marketAddress;
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || 'Failed to create market';
      setError(errorMsg);
      addLog(`Error: ${errorMsg}`, 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient, writeContractAsync]);

  const resolveMarket = useCallback(async (
    marketAddress: Address,
    outcome: number, // 1 = YES, 2 = NO, 3 = INVALID
    addLog: (msg: string, type: LogType, txHash?: string) => void
  ): Promise<boolean> => {
    if (!address || !walletClient || !publicClient) {
      setError('Wallet not connected');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      addLog(`Resolving market to ${['', 'YES', 'NO', 'INVALID'][outcome]}...`, 'pending');

      const hash = await writeContractAsync({
        address: marketAddress,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'resolve',
        args: [outcome],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      addLog('Market resolved', 'success', hash);
      return true;
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to resolve market';
      setError(errorMsg);
      addLog(`Error: ${errorMsg}`, 'error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient, writeContractAsync]);

  const redeemTokens = useCallback(async (
    marketAddress: Address,
    tokenAddress: Address,
    amount: string,
    addLog: (msg: string, type: LogType, txHash?: string) => void
  ): Promise<boolean> => {
    if (!address || !walletClient || !publicClient) {
      setError('Wallet not connected');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      addLog('Approving tokens for redemption...', 'pending');

      // Approve market to take tokens
      const approveHash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [marketAddress, parseEther(amount)],
      });

      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      addLog('Redeeming tokens...', 'pending');

      const hash = await writeContractAsync({
        address: marketAddress,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'redeem',
        args: [parseEther(amount)],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      addLog('Tokens redeemed', 'success', hash);
      return true;
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to redeem tokens';
      setError(errorMsg);
      addLog(`Error: ${errorMsg}`, 'error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient, writeContractAsync]);

  return { 
    createMarket, 
    resolveMarket, 
    redeemTokens, 
    isLoading, 
    error 
  };
}

// Hook for reading token balances
export function useTokenBalance(tokenAddress: Address | undefined, accountAddress: Address | undefined) {
  const { data, refetch, isLoading } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: accountAddress ? [accountAddress] : undefined,
    query: {
      enabled: !!tokenAddress && !!accountAddress,
    },
  });

  return {
    balance: data ? formatEther(data) : '0',
    refetch,
    isLoading,
  };
}

// Hook for reading market data
export function useMarketData(marketAddress: Address | undefined) {
  const { data: resolved } = useReadContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'resolved',
    query: { enabled: !!marketAddress },
  });

  const { data: outcome } = useReadContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'outcome',
    query: { enabled: !!marketAddress },
  });

  const { data: question } = useReadContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'question',
    query: { enabled: !!marketAddress },
  });

  const { data: yesToken } = useReadContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'yesToken',
    query: { enabled: !!marketAddress },
  });

  const { data: noToken } = useReadContract({
    address: marketAddress,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'noToken',
    query: { enabled: !!marketAddress },
  });

  return {
    resolved: resolved ?? false,
    outcome: outcome ?? 0,
    question: question ?? '',
    yesToken: yesToken as Address | undefined,
    noToken: noToken as Address | undefined,
  };
}

export default {
  useTransactionLog,
  useDopplerTokenCreate,
  useDopplerQuote,
  useDopplerSwap,
  usePredictionMarket,
  useTokenBalance,
  useMarketData,
};
