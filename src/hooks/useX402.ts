// x402 Payment Hook
// Uses the official @x402 packages for automatic payment handling with Monad facilitator

import { useState, useCallback, useMemo } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { wrapFetchWithPayment } from '@x402/fetch';

// x402 Configuration for Monad Testnet
export const X402_CONFIG = {
  network: 'eip155:10143',
  facilitator: 'https://x402-facilitator.molandak.org',
  usdc: '0x534b2f3A21130d7a60830c2Df862319e593943A3' as `0x${string}`,
  recipient: '0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE' as `0x${string}`,
  prices: {
    createMarket: '100000', // 0.10 USDC (6 decimals)
    marketData: '10000',    // 0.01 USDC
    agentTrade: '100000',   // 0.10 USDC
  },
} as const;

const API_BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\s/g, '') ||
  'https://qkcytrdhdtemyphsswou.supabase.co';

export interface MarketListingParams {
  address: string;
  question: string;
  resolutionTime: number;
  oracle: string;
  yesTokenAddress?: string;
  noTokenAddress?: string;
  initialLiquidity?: string;
  alpha?: string;
  category?: string;
  tags?: string[];
}

export interface MarketListingResult {
  success: boolean;
  market: {
    id: string;
    address: string;
    question: string;
    status: string;
  };
  payment?: {
    amount: string;
    amountFormatted: string;
    txHash?: string;
    settled: boolean;
  };
}

export function useX402() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create x402-enabled fetch function
  const paymentFetch = useMemo(() => {
    if (!walletClient || !address) return null;

    try {
      // Create EVM signer for x402
      const evmSigner = {
        address,
        signTypedData: async (message: Parameters<typeof walletClient.signTypedData>[0]) => {
          return walletClient.signTypedData(message);
        },
      };

      // Initialize x402 client with ExactEvmScheme
      const exactScheme = new ExactEvmScheme(evmSigner);
      const client = new x402Client();
      client.register(X402_CONFIG.network, exactScheme);

      // Wrap fetch with automatic payment handling
      return wrapFetchWithPayment(fetch, client);
    } catch (err) {
      console.error('Failed to initialize x402 client:', err);
      return null;
    }
  }, [walletClient, address]);

  // List a market (pay 0.10 USDC listing fee)
  const listMarket = useCallback(async (params: MarketListingParams): Promise<MarketListingResult> => {
    if (!paymentFetch) {
      throw new Error('Wallet not connected or x402 not initialized');
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await paymentFetch(`${API_BASE}/functions/v1/x402-create-market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to list market: ${response.status}`);
      }

      return data as MarketListingResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [paymentFetch]);

  // Fetch premium market data (pay 0.01 USDC)
  const fetchPremiumMarketData = useCallback(async (marketAddress: string) => {
    if (!paymentFetch) {
      throw new Error('Wallet not connected or x402 not initialized');
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await paymentFetch(
        `${API_BASE}/functions/v1/x402-market-data?market=${marketAddress}`,
        { method: 'GET' }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to fetch market data: ${response.status}`);
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [paymentFetch]);

  return {
    listMarket,
    fetchPremiumMarketData,
    isProcessing,
    error,
    isReady: !!paymentFetch,
    prices: {
      listMarket: '0.10 USDC',
      premiumData: '0.01 USDC',
    },
  };
}

export default useX402;
