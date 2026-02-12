// x402 payment handling for RBS PM SDK
// Handles automatic micropayments for API access

import { keccak256, toHex } from 'viem';
import type { WalletClient, Account } from 'viem';
import { ADDRESSES } from './constants';

// EIP-712 types for USDC TransferWithAuthorization
const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

const USDC_DOMAIN = {
  name: 'USDC',
  version: '2',
  chainId: 10143,
  verifyingContract: ADDRESSES.USDC,
} as const;

interface PaymentAccepted {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: {
    name: string;
    version: string;
  };
}

interface PaymentRequired {
  x402Version: number;
  accepts: PaymentAccepted[];
}

// Retry config for facilitator rate-limiting
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

/**
 * Create a fetch wrapper that automatically handles x402 payments.
 * Includes retry with exponential backoff for facilitator rate-limiting.
 */
export function createX402Fetch(
  walletClient: WalletClient,
  account: Account
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Fixed delay before retries (calls are already queued sequentially)
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }

      // Make the initial request
      const response = await fetch(input, init);

      // If not 402, return as-is
      if (response.status !== 402) {
        return response;
      }

      // Get payment requirements from header
      const paymentRequiredHeader = response.headers.get('payment-required');
      if (!paymentRequiredHeader) {
        return response; // No payment info, return original 402
      }

      // Parse payment requirements
      let paymentRequired: PaymentRequired;
      try {
        paymentRequired = JSON.parse(atob(paymentRequiredHeader));
      } catch {
        console.error('Failed to parse payment-required header');
        return response;
      }

      if (!paymentRequired.accepts || paymentRequired.accepts.length === 0) {
        console.error('No accepted payment methods');
        return response;
      }

      const accepted = paymentRequired.accepts[0];

      // Create authorization message with fresh nonce/timestamps
      const now = Math.floor(Date.now() / 1000);
      const validAfter = now - 60;
      const validBefore = now + (accepted.maxTimeoutSeconds || 3600);
      const nonce = keccak256(toHex(`${account.address}-${Date.now()}-${Math.random()}`));

      const authorization = {
        from: account.address,
        to: accepted.payTo as `0x${string}`,
        value: BigInt(accepted.amount),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce,
      };

      // Sign the authorization
      // Always use local USDC_DOMAIN for full EIP-712 domain (chainId, verifyingContract)
      // Server extra only provides { name, version } per x402 facilitator API spec
      const signingDomain = {
        name: accepted.extra?.name ?? USDC_DOMAIN.name,
        version: accepted.extra?.version ?? USDC_DOMAIN.version,
        chainId: USDC_DOMAIN.chainId,
        verifyingContract: USDC_DOMAIN.verifyingContract,
      };

      const signature = await walletClient.signTypedData({
        account,
        domain: signingDomain,
        types: TRANSFER_WITH_AUTH_TYPES,
        primaryType: 'TransferWithAuthorization',
        message: authorization,
      });

      // Create payment payload
      const paymentPayload = {
        x402Version: paymentRequired.x402Version || 2,
        scheme: accepted.scheme,
        network: accepted.network,
        payload: {
          signature,
          authorization: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value.toString(),
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce: nonce,
          },
        },
        accepted: {
          scheme: accepted.scheme,
          network: accepted.network,
          amount: accepted.amount,
          asset: accepted.asset,
          payTo: accepted.payTo,
          maxTimeoutSeconds: accepted.maxTimeoutSeconds,
          extra: accepted.extra,
        },
      };

      // Base64 encode the payment
      const paymentSignature = btoa(JSON.stringify(paymentPayload));

      // Retry with payment signature
      const newHeaders = new Headers(init?.headers);
      newHeaders.set('PAYMENT-SIGNATURE', paymentSignature);

      const paidResponse = await fetch(input, {
        ...init,
        headers: newHeaders,
      });

      // If still 402 and we have retries left, the facilitator may be rate-limiting
      if (paidResponse.status === 402 && attempt < MAX_RETRIES) {
        continue; // Retry with fresh challenge + signature after backoff
      }

      return paidResponse;
    }

    // Should never reach here, but TypeScript needs it
    throw new Error('x402 payment failed after maximum retries');
  };
}

/**
 * Check if a wallet has enough USDC for x402 payments
 */
export async function checkX402Balance(
  publicClient: { readContract: (args: unknown) => Promise<bigint> },
  address: `0x${string}`,
  requiredAmount: string = '100' // 0.0001 USDC
): Promise<{ sufficient: boolean; balance: bigint; required: bigint }> {
  const balance = await publicClient.readContract({
    address: ADDRESSES.USDC,
    abi: [
      {
        name: 'balanceOf',
        type: 'function',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'balanceOf',
    args: [address],
  }) as bigint;

  const required = BigInt(requiredAmount);
  return {
    sufficient: balance >= required,
    balance,
    required,
  };
}
