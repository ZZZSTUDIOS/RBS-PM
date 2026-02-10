// LS-LMSR with ERC-20 Collateral (USDC) Hook
// For prediction markets using USDC instead of native MON

import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, formatUnits, type Address } from 'viem';
import { ADDRESSES, ERC20_ABI } from '../config/wagmi';

export interface LSLMSR_ERC20_MarketConfig {
  question: string;
  resolutionDate: string;
  oracle: string;
  alpha: string; // e.g., "0.03" for 3% max spread
  minLiquidity: string; // e.g., "10" minimum effective b
  initialYesShares: string; // e.g., "100"
  initialNoShares: string; // e.g., "100"
  initialLiquidity: string; // USDC amount (e.g., "10" for 10 USDC)
  yesName: string;
  yesSymbol: string;
  noName: string;
  noSymbol: string;
}

// LS-LMSR ERC20 ABI
export const LSLMSR_ERC20_ABI = [
  // Constructor params for reference
  {
    type: 'constructor',
    inputs: [
      { name: '_collateralToken', type: 'address' },
      { name: '_collateralDecimals', type: 'uint8' },
      { name: '_question', type: 'string' },
      { name: '_resolutionTime', type: 'uint256' },
      { name: '_oracle', type: 'address' },
      { name: '_alpha', type: 'uint256' },
      { name: '_minLiquidity', type: 'uint256' },
      { name: '_initialYesShares', type: 'uint256' },
      { name: '_initialNoShares', type: 'uint256' },
      { name: '_initialLiquidity', type: 'uint256' },
      { name: '_yesName', type: 'string' },
      { name: '_yesSymbol', type: 'string' },
      { name: '_noName', type: 'string' },
      { name: '_noSymbol', type: 'string' },
    ],
  },
  // View functions
  {
    name: 'getMarketInfo',
    type: 'function',
    inputs: [],
    outputs: [
      { name: '_question', type: 'string' },
      { name: '_resolutionTime', type: 'uint256' },
      { name: '_oracle', type: 'address' },
      { name: '_yesPrice', type: 'uint256' },
      { name: '_noPrice', type: 'uint256' },
      { name: '_yesProbability', type: 'uint256' },
      { name: '_noProbability', type: 'uint256' },
      { name: '_yesShares', type: 'uint256' },
      { name: '_noShares', type: 'uint256' },
      { name: '_totalCollateral', type: 'uint256' },
      { name: '_liquidityParam', type: 'uint256' },
      { name: '_priceSum', type: 'uint256' },
      { name: '_resolved', type: 'bool' },
      { name: '_yesWins', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getCollateralInfo',
    type: 'function',
    inputs: [],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'decimals', type: 'uint8' },
      { name: 'symbol', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getCostInCollateral',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'shares', type: 'uint256' },
    ],
    outputs: [{ name: 'cost', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getPayoutForSellInCollateral',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'shares', type: 'uint256' },
    ],
    outputs: [{ name: 'payout', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'estimateSharesForPayment',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'grossPayment', type: 'uint256' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getYesPrice',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getNoPrice',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'yesToken',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'noToken',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'collateralToken',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'collateralDecimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    name: 'resolutionTime',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  // Write functions
  {
    name: 'buy',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'minShares', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'sell',
    type: 'function',
    inputs: [
      { name: 'isYes', type: 'bool' },
      { name: 'shares', type: 'uint256' },
      { name: 'minPayout', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'redeem',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'resolve',
    type: 'function',
    inputs: [{ name: '_yesWins', type: 'bool' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'addLiquidity',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Events
  {
    type: 'event',
    name: 'SharesPurchased',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
      { name: 'cost', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SharesSold',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
    ],
  },
] as const;

// USDC decimals
const USDC_DECIMALS = ADDRESSES.USDC_DECIMALS;

export function useLSLMSR_ERC20() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [isLoading, setIsLoading] = useState(false);

  // Approve USDC for a market
  const approveUSDC = useCallback(
    async (marketAddress: Address, amount: string) => {
      if (!walletClient || !address) throw new Error('Wallet not connected');

      const amountInUnits = parseUnits(amount, USDC_DECIMALS);

      const hash = await walletClient.writeContract({
        address: ADDRESSES.USDC,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [marketAddress, amountInUnits],
      });

      await publicClient?.waitForTransactionReceipt({ hash });
      return hash;
    },
    [walletClient, address, publicClient]
  );

  // Check USDC allowance
  const checkAllowance = useCallback(
    async (marketAddress: Address): Promise<bigint> => {
      if (!publicClient || !address) return 0n;

      const allowance = await publicClient.readContract({
        address: ADDRESSES.USDC,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, marketAddress],
      });

      return allowance as bigint;
    },
    [publicClient, address]
  );

  // Get USDC balance
  const getUSDCBalance = useCallback(async (): Promise<string> => {
    if (!publicClient || !address) return '0';

    const balance = await publicClient.readContract({
      address: ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    });

    return formatUnits(balance as bigint, USDC_DECIMALS);
  }, [publicClient, address]);

  // Buy shares with USDC
  const buyShares = useCallback(
    async (
      marketAddress: Address,
      isYes: boolean,
      usdcAmount: string,
      minShares: bigint = 0n
    ) => {
      if (!walletClient || !address) throw new Error('Wallet not connected');

      setIsLoading(true);
      try {
        const amountInUnits = parseUnits(usdcAmount, USDC_DECIMALS);

        // Check and set approval if needed
        const allowance = await checkAllowance(marketAddress);
        if (allowance < amountInUnits) {
          await approveUSDC(marketAddress, usdcAmount);
        }

        // Execute buy
        const hash = await walletClient.writeContract({
          address: marketAddress,
          abi: LSLMSR_ERC20_ABI,
          functionName: 'buy',
          args: [isYes, amountInUnits, minShares],
        });

        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        return { hash, receipt };
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, publicClient, checkAllowance, approveUSDC]
  );

  // Sell shares for USDC
  const sellShares = useCallback(
    async (
      marketAddress: Address,
      isYes: boolean,
      shares: bigint,
      minPayout: bigint = 0n
    ) => {
      if (!walletClient || !address) throw new Error('Wallet not connected');

      setIsLoading(true);
      try {
        // Get token address and check approval
        const tokenAddress = (await publicClient?.readContract({
          address: marketAddress,
          abi: LSLMSR_ERC20_ABI,
          functionName: isYes ? 'yesToken' : 'noToken',
        })) as Address;

        const tokenAllowance = (await publicClient?.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, marketAddress],
        })) as bigint;

        if (tokenAllowance < shares) {
          const approveHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [marketAddress, shares],
          });
          await publicClient?.waitForTransactionReceipt({ hash: approveHash });
        }

        // Execute sell
        const hash = await walletClient.writeContract({
          address: marketAddress,
          abi: LSLMSR_ERC20_ABI,
          functionName: 'sell',
          args: [isYes, shares, minPayout],
        });

        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        return { hash, receipt };
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, publicClient]
  );

  // Redeem winning shares
  const redeem = useCallback(
    async (marketAddress: Address) => {
      if (!walletClient) throw new Error('Wallet not connected');

      setIsLoading(true);
      try {
        const hash = await walletClient.writeContract({
          address: marketAddress,
          abi: LSLMSR_ERC20_ABI,
          functionName: 'redeem',
          args: [],
        });

        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        return { hash, receipt };
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, publicClient]
  );

  // Get market info
  const getMarketInfo = useCallback(
    async (marketAddress: Address) => {
      if (!publicClient) throw new Error('Client not available');

      const info = await publicClient.readContract({
        address: marketAddress,
        abi: LSLMSR_ERC20_ABI,
        functionName: 'getMarketInfo',
      }) as readonly [string, bigint, Address, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean];

      return {
        question: info[0],
        resolutionTime: info[1],
        oracle: info[2],
        yesPrice: info[3],
        noPrice: info[4],
        yesProbability: info[5],
        noProbability: info[6],
        yesShares: info[7],
        noShares: info[8],
        totalCollateral: info[9],
        liquidityParam: info[10],
        priceSum: info[11],
        resolved: info[12],
        yesWins: info[13],
      };
    },
    [publicClient]
  );

  // Estimate shares for USDC amount
  const estimateShares = useCallback(
    async (marketAddress: Address, isYes: boolean, usdcAmount: string): Promise<bigint> => {
      if (!publicClient) return 0n;

      const amountInUnits = parseUnits(usdcAmount, USDC_DECIMALS);

      const shares = await publicClient.readContract({
        address: marketAddress,
        abi: LSLMSR_ERC20_ABI,
        functionName: 'estimateSharesForPayment',
        args: [isYes, amountInUnits],
      });

      return shares as bigint;
    },
    [publicClient]
  );

  return {
    // State
    isLoading,
    usdcAddress: ADDRESSES.USDC,
    usdcDecimals: USDC_DECIMALS,

    // Actions
    approveUSDC,
    checkAllowance,
    getUSDCBalance,
    buyShares,
    sellShares,
    redeem,
    getMarketInfo,
    estimateShares,

    // Utilities
    parseUSDC: (amount: string) => parseUnits(amount, USDC_DECIMALS),
    formatUSDC: (amount: bigint) => formatUnits(amount, USDC_DECIMALS),
  };
}

export default useLSLMSR_ERC20;
