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
    chainId: number;
    verifyingContract: string;
  };
}

interface PaymentRequired {
  x402Version: number;
  accepts: PaymentAccepted[];
}

/**
 * Create a fetch wrapper that automatically handles x402 payments
 */
export function createX402Fetch(
  walletClient: WalletClient,
  account: Account
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
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

    // Create authorization message
    const now = Math.floor(Date.now() / 1000);
    const validAfter = now - 60; // Valid from 1 minute ago
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
    const signature = await walletClient.signTypedData({
      account,
      domain: accepted.extra ? {
        name: accepted.extra.name,
        version: accepted.extra.version,
        chainId: accepted.extra.chainId,
        verifyingContract: accepted.extra.verifyingContract as `0x${string}`,
      } : USDC_DOMAIN,
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

    return fetch(input, {
      ...init,
      headers: newHeaders,
    });
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
