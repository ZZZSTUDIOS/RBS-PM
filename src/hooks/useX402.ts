// x402 Payment Hook
// Enables HTTP 402 micropayments for premium API endpoints

import { useState, useCallback } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { X402_CONFIG } from '../config/wagmi';

// EIP-712 domain for USDC TransferWithAuthorization
const USDC_DOMAIN = {
  name: 'USDC',
  version: '2',
  chainId: 10143, // Monad Testnet
  verifyingContract: X402_CONFIG.usdc,
} as const;

// EIP-712 types for TransferWithAuthorization
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

interface PaymentHeader {
  version: string;
  network: string;
  payload: string;
  signature: string;
}

interface UseX402Return {
  // State
  isCreatingPayment: boolean;
  paymentError: string | null;

  // Actions
  createPayment: (amount: string, recipient: string) => Promise<string | null>;
  fetchWithPayment: (url: string, amount: string, recipient?: string, options?: RequestInit) => Promise<Response>;

  // Helpers
  formatPaymentHeader: (payment: PaymentHeader) => string;
  parsePaymentRequirement: (response: Response) => { amount: string; recipient: string } | null;
}

export function useX402(): UseX402Return {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Create a payment authorization
  const createPayment = useCallback(
    async (amount: string, recipient: string): Promise<string | null> => {
      if (!address) {
        setPaymentError('Wallet not connected');
        return null;
      }

      setIsCreatingPayment(true);
      setPaymentError(null);

      try {
        // Generate a random nonce
        const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')}` as `0x${string}`;

        // Set validity window (valid for 1 hour)
        const now = Math.floor(Date.now() / 1000);
        const validAfter = BigInt(now - 60); // 1 minute ago
        const validBefore = BigInt(now + 3600); // 1 hour from now

        // Build the EIP-712 message
        const message = {
          from: address,
          to: recipient as `0x${string}`,
          value: BigInt(amount),
          validAfter,
          validBefore,
          nonce,
        };

        // Sign the typed data
        const signature = await signTypedDataAsync({
          domain: USDC_DOMAIN,
          types: TRANSFER_WITH_AUTHORIZATION_TYPES,
          primaryType: 'TransferWithAuthorization',
          message,
        });

        // Build the payment header
        const payload = JSON.stringify({
          from: address,
          to: recipient,
          value: amount,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        });

        const paymentHeader: PaymentHeader = {
          version: '1',
          network: X402_CONFIG.network,
          payload: btoa(payload),
          signature,
        };

        return formatPaymentHeader(paymentHeader);
      } catch (error) {
        console.error('Failed to create payment:', error);
        setPaymentError(error instanceof Error ? error.message : 'Payment creation failed');
        return null;
      } finally {
        setIsCreatingPayment(false);
      }
    },
    [address, signTypedDataAsync]
  );

  // Format payment header for HTTP request
  const formatPaymentHeader = useCallback((payment: PaymentHeader): string => {
    return `x402 ${payment.version}:${payment.network}:${payment.payload}:${payment.signature}`;
  }, []);

  // Parse payment requirement from 402 response
  const parsePaymentRequirement = useCallback((response: Response): { amount: string; recipient: string } | null => {
    const wwwAuth = response.headers.get('WWW-Authenticate');
    if (!wwwAuth || !wwwAuth.startsWith('x402')) {
      return null;
    }

    // Parse the x402 challenge
    const parts = wwwAuth.split(' ');
    if (parts.length < 2) return null;

    try {
      const challenge = JSON.parse(atob(parts[1]));
      return {
        amount: challenge.amount || challenge.price,
        recipient: challenge.recipient || challenge.payTo,
      };
    } catch {
      console.error('Failed to parse x402 challenge');
      return null;
    }
  }, []);

  // Fetch with automatic payment handling
  const fetchWithPayment = useCallback(
    async (
      url: string,
      amount: string,
      recipient?: string,
      options?: RequestInit
    ): Promise<Response> => {
      // First, try without payment to get the recipient if not provided
      if (!recipient) {
        const initialResponse = await fetch(url, options);
        if (initialResponse.status === 402) {
          const requirement = parsePaymentRequirement(initialResponse);
          if (requirement) {
            recipient = requirement.recipient;
            amount = requirement.amount;
          } else {
            throw new Error('Could not parse payment requirement from 402 response');
          }
        } else {
          // No payment required
          return initialResponse;
        }
      }

      // Create payment
      const paymentHeader = await createPayment(amount, recipient);
      if (!paymentHeader) {
        throw new Error('Failed to create payment');
      }

      // Make request with payment header
      const headers = new Headers(options?.headers);
      headers.set('X-Payment', paymentHeader);

      return fetch(url, {
        ...options,
        headers,
      });
    },
    [createPayment, parsePaymentRequirement]
  );

  return {
    isCreatingPayment,
    paymentError,
    createPayment,
    fetchWithPayment,
    formatPaymentHeader,
    parsePaymentRequirement,
  };
}

/**
 * Hook for specific x402 endpoints with pre-configured pricing
 */
export function useX402Endpoints() {
  const { fetchWithPayment, isCreatingPayment, paymentError } = useX402();

  // Fetch premium market data
  const fetchMarketData = useCallback(
    async (marketAddress: string) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\s/g, '');
      const url = `${supabaseUrl}/functions/v1/x402-market-data?market=${marketAddress}`;

      const response = await fetchWithPayment(url, X402_CONFIG.prices.marketData);
      if (!response.ok) {
        throw new Error(`Failed to fetch market data: ${response.status}`);
      }
      return response.json();
    },
    [fetchWithPayment]
  );

  // Execute agent trade via x402
  const executeAgentTrade = useCallback(
    async (tradeParams: {
      marketAddress: string;
      isYes: boolean;
      amount: string;
    }) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\s/g, '');
      const url = `${supabaseUrl}/functions/v1/x402-agent-trade`;

      const response = await fetchWithPayment(
        url,
        X402_CONFIG.prices.agentTrade,
        undefined,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeParams),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to execute trade: ${response.status}`);
      }
      return response.json();
    },
    [fetchWithPayment]
  );

  // Create market with x402 payment (0.10 USDC listing fee)
  const createMarketWithPayment = useCallback(
    async (marketData: {
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
    }) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\s/g, '');
      const url = `${supabaseUrl}/functions/v1/x402-create-market`;

      const response = await fetchWithPayment(
        url,
        X402_CONFIG.prices.createMarket,
        undefined,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(marketData),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to create market: ${response.status}`);
      }
      return data;
    },
    [fetchWithPayment]
  );

  return {
    fetchMarketData,
    executeAgentTrade,
    createMarketWithPayment,
    isCreatingPayment,
    paymentError,
    prices: X402_CONFIG.prices,
  };
}

export default useX402;
