'use client';

import React, { useState, useEffect } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useBalance,
  useChainId,
  useSwitchChain,
  usePublicClient,
} from 'wagmi';
import { parseUnits, formatUnits, formatEther, parseEther, type Address } from 'viem';
import {
  useTransactionLog,
  useLSLMSRMarketCreate,
  useLMSRResolve,
  useLMSRRedeem,
  useClaimCreatorFees,
  useMarketFees,
  useUnifiedMarketData,
  useUnifiedEstimateShares,
  LSLMSR_ABI,
  type LSLMSRMarketConfig,
} from '../hooks/useLMSR';
import { useLSLMSR_ERC20 } from '../hooks/useLMSR_ERC20';
import { useX402 } from '../hooks/useX402';
import { monadTestnet, ADDRESSES } from '../config/wagmi';
import { useMarkets } from '../hooks/useMarkets';
import { useUserSync } from '../hooks/useUserSync';
import { usePositions } from '../hooks/usePositions';
import { syncMarketPrices } from '../lib/supabase';
import { theme } from '../theme';

// Simple ERC20 ABI for balance and symbol checks
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
] as const;

// Trade history entry type
interface TradeEntry {
  id: string;
  timestamp: number;
  marketAddress: Address;
  marketQuestion?: string;
  type: 'buy' | 'sell' | 'redeem';
  outcome: 'YES' | 'NO';
  amount: string; // USDC spent (buy) or received (sell/redeem)
  shares: string;
  txHash: string;
}

// Position summary per market
interface Position {
  marketAddress: Address;
  marketQuestion?: string;
  yesShares: number;
  noShares: number;
  yesCostBasis: number; // Total USDC spent on YES shares
  noCostBasis: number;  // Total USDC spent on NO shares
  realizedPnL: number;  // From sells and redemptions
  resolved?: boolean;
  yesWins?: boolean;
}

// Market prices cache
interface MarketPrices {
  yesPrice: number;
  noPrice: number;
  resolved: boolean;
  yesWins: boolean;
  oracle: string;
}

export default function LMSRAdmin() {
  const [activeTab, setActiveTab] = useState('connect');
  const [marketSearch, setMarketSearch] = useState('');
  const [markets, setMarkets] = useState<Array<{
    id: number;
    address: Address;
    question: string;
    status: string;
    yesToken: Address;
    noToken: Address;
    resolution: string;
  }>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lmsr-markets');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // Portfolio - trade history (loaded from Supabase)
  const [trades, setTrades] = useState<TradeEntry[]>([]);

  // Persist markets to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lmsr-markets', JSON.stringify(markets));
    }
  }, [markets]);

  // Market prices cache for PnL calculation
  const [marketPrices, setMarketPrices] = useState<Record<string, MarketPrices>>({});

  // Calculate positions from trades
  const positions = React.useMemo((): Position[] => {
    const positionMap: Record<string, Position> = {};

    for (const trade of trades) {
      const addr = trade.marketAddress.toLowerCase();
      if (!positionMap[addr]) {
        positionMap[addr] = {
          marketAddress: trade.marketAddress,
          marketQuestion: trade.marketQuestion,
          yesShares: 0,
          noShares: 0,
          yesCostBasis: 0,
          noCostBasis: 0,
          realizedPnL: 0,
        };
      }

      const pos = positionMap[addr];
      const shares = parseFloat(trade.shares || '0');
      const amount = parseFloat(trade.amount || '0');

      if (trade.type === 'buy') {
        if (trade.outcome === 'YES') {
          pos.yesShares += shares;
          pos.yesCostBasis += amount;
        } else {
          pos.noShares += shares;
          pos.noCostBasis += amount;
        }
      } else if (trade.type === 'sell') {
        if (trade.outcome === 'YES') {
          // Calculate realized PnL for this sell
          const avgCost = pos.yesShares > 0 ? pos.yesCostBasis / pos.yesShares : 0;
          const costOfSold = avgCost * shares;
          pos.realizedPnL += amount - costOfSold;
          pos.yesShares -= shares;
          pos.yesCostBasis -= costOfSold;
        } else {
          const avgCost = pos.noShares > 0 ? pos.noCostBasis / pos.noShares : 0;
          const costOfSold = avgCost * shares;
          pos.realizedPnL += amount - costOfSold;
          pos.noShares -= shares;
          pos.noCostBasis -= costOfSold;
        }
      } else if (trade.type === 'redeem') {
        // Redemption: amount is payout, shares is what was redeemed
        if (trade.outcome === 'YES') {
          const avgCost = pos.yesShares > 0 ? pos.yesCostBasis / pos.yesShares : 0;
          const costOfRedeemed = avgCost * shares;
          pos.realizedPnL += amount - costOfRedeemed;
          pos.yesShares -= shares;
          pos.yesCostBasis -= costOfRedeemed;
        } else {
          const avgCost = pos.noShares > 0 ? pos.noCostBasis / pos.noShares : 0;
          const costOfRedeemed = avgCost * shares;
          pos.realizedPnL += amount - costOfRedeemed;
          pos.noShares -= shares;
          pos.noCostBasis -= costOfRedeemed;
        }
      }

      // Update market question if available
      if (trade.marketQuestion) {
        pos.marketQuestion = trade.marketQuestion;
      }
    }

    // Add market prices info to positions
    return Object.values(positionMap).map(pos => {
      const prices = marketPrices[pos.marketAddress.toLowerCase()];
      if (prices) {
        pos.resolved = prices.resolved;
        pos.yesWins = prices.yesWins;
      }
      return pos;
    }).filter(pos => pos.yesShares > 0.0001 || pos.noShares > 0.0001 || Math.abs(pos.realizedPnL) > 0.0001);
  }, [trades, marketPrices]);

  // Calculate unrealized PnL for a position
  const getUnrealizedPnL = (pos: Position): number => {
    // No shares = no unrealized P&L
    if (pos.yesShares < 0.0001 && pos.noShares < 0.0001) {
      return 0;
    }

    const prices = marketPrices[pos.marketAddress.toLowerCase()];
    if (!prices) return 0;

    if (prices.resolved) {
      // If resolved, winning shares are worth 1 USDC each, losing shares worth 0
      const yesValue = prices.yesWins ? pos.yesShares : 0;
      const noValue = prices.yesWins ? 0 : pos.noShares;
      return (yesValue + noValue) - pos.yesCostBasis - pos.noCostBasis;
    } else {
      // Mark to market using current prices
      const yesValue = pos.yesShares * prices.yesPrice;
      const noValue = pos.noShares * prices.noPrice;
      return (yesValue + noValue) - pos.yesCostBasis - pos.noCostBasis;
    }
  };

  // Total PnL calculations
  const totalRealizedPnL = positions.reduce((sum, pos) => sum + pos.realizedPnL, 0);
  const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + getUnrealizedPnL(pos), 0);
  const totalPnL = totalRealizedPnL + totalUnrealizedPnL;

  // Selected market for trading/viewing
  const [selectedMarket, setSelectedMarket] = useState<Address | undefined>();

  // Wallet hooks
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: balance, refetch: refetchBalance } = useBalance({
    address,
    query: { refetchInterval: 5000 }, // Refresh every 5 seconds
  });
  const publicClient = usePublicClient();

  // Supabase hooks for syncing
  const { upsertMarket: syncMarketToSupabase, markets: supabaseMarkets } = useMarkets();
  const { syncTrade: syncTradeToSupabase, userId } = useUserSync(); // Auto-sync user when wallet connects

  const displayMarkets = React.useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter(m =>
      m.question.toLowerCase().includes(q) ||
      m.address.toLowerCase().includes(q)
    );
  }, [marketSearch, markets]);

  // Load markets from Supabase (replaces localStorage markets)
  useEffect(() => {
    if (supabaseMarkets && supabaseMarkets.length > 0) {
      const convertedMarkets = supabaseMarkets.map((m, index) => ({
        id: index + 1,
        address: m.address as Address,
        question: m.question,
        status: m.status,
        yesToken: m.yes_token_address as Address,
        noToken: m.no_token_address as Address,
        resolution: m.resolution_time,
      }));
      setMarkets(convertedMarkets);
    }
  }, [supabaseMarkets]);

  // Fetch trades and positions from Supabase
  const {
    trades: dbTrades,
    isLoading: isLoadingPortfolio,
    refetch: refetchPortfolio,
    refetchTrades: refetchDbTrades,
  } = usePositions(userId || undefined);

  // Convert database trades to TradeEntry format for display
  useEffect(() => {
    if (dbTrades && dbTrades.length > 0) {
      const convertedTrades: TradeEntry[] = dbTrades.map(t => ({
        id: t.id,
        timestamp: new Date(t.created_at).getTime(),
        marketAddress: (t.market_address || '') as Address,
        marketQuestion: t.market_question,
        type: t.trade_type === 'BUY' ? 'buy' : 'sell',
        outcome: t.outcome,
        amount: t.amount,
        shares: t.shares,
        txHash: t.tx_hash,
      }));
      setTrades(convertedTrades);
    } else {
      // No trades or no user logged in
      setTrades([]);
    }
  }, [dbTrades, userId]);

  // Fetch market prices for all positions and deployed markets
  useEffect(() => {
    const fetchPrices = async () => {
      if (!publicClient) return;

      // Combine markets from trades and deployed markets
      const tradeMarkets = trades.map(t => t.marketAddress.toLowerCase());
      const deployedMarkets = markets.map(m => m.address.toLowerCase());
      const uniqueMarkets = [...new Set([...tradeMarkets, ...deployedMarkets])];

      if (uniqueMarkets.length === 0) return;

      for (const marketAddr of uniqueMarkets) {
        try {
          // LS-LMSR getMarketInfo returns 14 fields
          const info = await publicClient.readContract({
            address: marketAddr as Address,
            abi: LSLMSR_ABI,
            functionName: 'getMarketInfo',
          }) as [string, bigint, Address, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean];

          // Indices: 0=question, 1=resTime, 2=oracle, 3=yesPrice, 4=noPrice, 5=yesProbability, 6=noProbability, 7=yesShares, 8=noShares, 9=totalCollateral, 10=liquidityParam, 11=priceSum, 12=resolved, 13=yesWins
          const [, , oracle, yesPrice, noPrice, , , , , , , , resolved, yesWins] = info;

          setMarketPrices(prev => ({
            ...prev,
            [marketAddr]: {
              yesPrice: Number(yesPrice) / 1e18,
              noPrice: Number(noPrice) / 1e18,
              resolved,
              yesWins,
              oracle: oracle.toLowerCase(),
            },
          }));
        } catch (err) {
          console.error(`Failed to fetch prices for ${marketAddr}:`, err);
        }
      }
    };

    fetchPrices();
    // Refresh prices every 30 seconds
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [publicClient, trades, markets]);

  // LS-LMSR hooks
  const { logs, addLog, clearLogs } = useTransactionLog(address);
  const { createMarket, isLoading: isCreatingMarket } = useLSLMSRMarketCreate();
  // USDC trading hooks
  const {
    buyShares,
    sellShares,
    isLoading: isUSDCLoading,
  } = useLSLMSR_ERC20();
  const isBuying = isUSDCLoading;
  const isSelling = isUSDCLoading;
  const { resolve, isLoading: isResolving } = useLMSRResolve();
  const { redeem, isLoading: isRedeeming } = useLMSRRedeem();
  const { claimFees, isLoading: isClaimingCreatorFees } = useClaimCreatorFees();
  // 0.5% trading fee goes 100% to market creator (no protocol fee)
  const { marketInfo, marketType: detectedMarketType, refetch: refetchMarketInfo } = useUnifiedMarketData(selectedMarket);
  const { estimateShares } = useUnifiedEstimateShares();

  // Estimated shares state
  const [estimatedShares, setEstimatedShares] = useState<string>('0');
  const [isEstimating, setIsEstimating] = useState(false);

  // User's token balances for selling
  const [userYesBalance, setUserYesBalance] = useState<string>('0');
  const [userNoBalance, setUserNoBalance] = useState<string>('0');
  const [estimatedPayout, setEstimatedPayout] = useState<string>('0');

  // USDC balance for trading
  const [usdcBalance, setUsdcBalance] = useState<string>('0');

  // Resolve tab token balances (stored for future UI display)
  const [_resolveYesBalance, setResolveYesBalance] = useState<string>('0');
  const [_resolveNoBalance, setResolveNoBalance] = useState<string>('0');

  // Resolve tab permissions
  const [resolveMarketOracle, setResolveMarketOracle] = useState<string>('');
  const [_resolveMarketCreator, setResolveMarketCreator] = useState<string>('');
  const [resolveMarketResolved, setResolveMarketResolved] = useState<boolean>(false);
  const [resolveMarketResolutionTime, setResolveMarketResolutionTime] = useState<bigint>(0n);

  // Token symbols for display
  const [yesSymbol, setYesSymbol] = useState<string>('YES');
  const [noSymbol, setNoSymbol] = useState<string>('NO');

  // Market Creation State (LS-LMSR only)
  const [marketConfig, setMarketConfig] = useState<LSLMSRMarketConfig>({
    question: 'Will ETH hit $10,000 by end of 2026?',
    resolutionDate: '2026-12-31',
    oracle: '',
    alpha: '0.03', // 3% max spread
    minLiquidity: '100', // Minimum effective b (should be >= initialShares to avoid exp overflow)
    initialYesShares: '100', // Initial YES shares for bootstrapping
    initialNoShares: '100', // Initial NO shares for bootstrapping
    yesName: 'ETH10K-YES',
    yesSymbol: 'YES',
    noName: 'ETH10K-NO',
    noSymbol: 'NO',
    initialLiquidity: '10', // Liquidity buffer - recommend 2-5% of expected volume
    // Note: 0.5% trading fee goes 100% to market creator
  });

  // Market creation confirmation
  const [createdMarket, setCreatedMarket] = useState<{
    address: string;
    question: string;
    txHash?: string;
    resolutionTime?: number;
    yesToken?: string;
    noToken?: string;
    listed?: boolean;
    listingError?: string;
  } | null>(null);

  // x402 listing hook
  const { listMarket, isProcessing: isListing, isReady: x402Ready } = useX402();

  // Trade State
  const [tradeParams, setTradeParams] = useState({
    marketAddress: '',
    amount: '0.1',
    minShares: '0',
    isYes: true,
    direction: 'buy' as 'buy' | 'sell',
  });

  // Resolution State
  const [resolution, setResolution] = useState({
    marketAddress: '',
    outcome: 'YES' as 'YES' | 'NO',
  });

  // Fee info for resolution tab
  const { feeInfo, refetch: refetchFeeInfo } = useMarketFees(
    resolution.marketAddress ? resolution.marketAddress as `0x${string}` : undefined
  );

  // Check chain and prompt switch
  useEffect(() => {
    if (isConnected && chainId !== monadTestnet.id) {
      addLog(`Wrong network. Please switch to Monad Testnet`, 'error');
    }
  }, [isConnected, chainId, addLog]);

  // Fetch USDC balance
  useEffect(() => {
    const fetchUSDCBalance = async () => {
      if (!publicClient || !address) {
        setUsdcBalance('0');
        return;
      }
      try {
        const bal = await publicClient.readContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;
        setUsdcBalance(formatUnits(bal, 6)); // USDC has 6 decimals
      } catch (err) {
        console.error('Error fetching USDC balance:', err);
        setUsdcBalance('0');
      }
    };

    fetchUSDCBalance();
    const interval = setInterval(fetchUSDCBalance, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [publicClient, address]);

  // Load market info when trade address changes
  useEffect(() => {
    if (tradeParams.marketAddress && tradeParams.marketAddress.startsWith('0x')) {
      setSelectedMarket(tradeParams.marketAddress as Address);
    }
  }, [tradeParams.marketAddress]);

  // Estimate shares when amount, outcome, or market changes
  useEffect(() => {
    const updateEstimate = async () => {
      if (
        !tradeParams.marketAddress ||
        !tradeParams.marketAddress.startsWith('0x') ||
        !tradeParams.amount ||
        parseFloat(tradeParams.amount) <= 0 ||
        tradeParams.direction !== 'buy'
      ) {
        setEstimatedShares('0');
        return;
      }

      setIsEstimating(true);
      try {
        // Pass collateral decimals (default to 18 for native token)
        const decimals = marketInfo?.collateralDecimals ?? 18;
        const shares = await estimateShares(
          tradeParams.marketAddress as Address,
          tradeParams.isYes,
          tradeParams.amount,
          decimals
        );
        setEstimatedShares(shares);
      } catch (err) {
        console.error('Failed to estimate shares:', err);
        setEstimatedShares('0');
      } finally {
        setIsEstimating(false);
      }
    };

    // Debounce the estimate call
    const timeoutId = setTimeout(updateEstimate, 300);
    return () => clearTimeout(timeoutId);
  }, [tradeParams.marketAddress, tradeParams.amount, tradeParams.isYes, tradeParams.direction, estimateShares, marketInfo?.collateralDecimals]);

  // Fetch user's token balances and symbols when market changes
  useEffect(() => {
    const fetchBalancesAndSymbols = async () => {
      if (!publicClient || !selectedMarket || !detectedMarketType) {
        setUserYesBalance('0');
        setUserNoBalance('0');
        setYesSymbol('YES');
        setNoSymbol('NO');
        return;
      }

      // Always use LSLMSR_ABI (yesToken/noToken functions are compatible)
      const marketAbi = LSLMSR_ABI;

      try {
        // Get token addresses from market
        const [yesToken, noToken] = await Promise.all([
          publicClient.readContract({
            address: selectedMarket as Address,
            abi: marketAbi,
            functionName: 'yesToken',
          }) as Promise<Address>,
          publicClient.readContract({
            address: selectedMarket as Address,
            abi: marketAbi,
            functionName: 'noToken',
          }) as Promise<Address>,
        ]);

        // Get token symbols
        const [yesTokenSymbol, noTokenSymbol] = await Promise.all([
          publicClient.readContract({
            address: yesToken,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }) as Promise<string>,
          publicClient.readContract({
            address: noToken,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }) as Promise<string>,
        ]);

        setYesSymbol(yesTokenSymbol);
        setNoSymbol(noTokenSymbol);

        // Get user balances if connected
        if (address) {
          const [yesBalance, noBalance] = await Promise.all([
            publicClient.readContract({
              address: yesToken,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address],
            }) as Promise<bigint>,
            publicClient.readContract({
              address: noToken,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address],
            }) as Promise<bigint>,
          ]);

          setUserYesBalance(formatEther(yesBalance));
          setUserNoBalance(formatEther(noBalance));
        }
      } catch (err) {
        console.error('Failed to fetch balances/symbols:', err);
      }
    };

    fetchBalancesAndSymbols();
  }, [publicClient, address, selectedMarket, marketInfo, detectedMarketType]);

  // Estimate payout when selling
  useEffect(() => {
    const updatePayout = async () => {
      if (
        !publicClient ||
        !tradeParams.marketAddress ||
        !tradeParams.marketAddress.startsWith('0x') ||
        !tradeParams.amount ||
        parseFloat(tradeParams.amount) <= 0 ||
        tradeParams.direction !== 'sell'
      ) {
        setEstimatedPayout('0');
        return;
      }

      try {
        const sharesToSell = parseEther(tradeParams.amount);
        const payout = await publicClient.readContract({
          address: tradeParams.marketAddress as Address,
          abi: LSLMSR_ABI,
          functionName: 'getPayoutForSell',
          args: [tradeParams.isYes, sharesToSell],
        }) as bigint;

        setEstimatedPayout(formatEther(payout));
      } catch (err) {
        console.error('Failed to estimate payout:', err);
        setEstimatedPayout('0');
      }
    };

    const timeoutId = setTimeout(updatePayout, 300);
    return () => clearTimeout(timeoutId);
  }, [publicClient, tradeParams.marketAddress, tradeParams.amount, tradeParams.isYes, tradeParams.direction]);

  // Fetch balances and permissions for resolve tab market
  useEffect(() => {
    const fetchResolveData = async () => {
      if (!publicClient || !resolution.marketAddress || !resolution.marketAddress.startsWith('0x')) {
        setResolveYesBalance('0');
        setResolveNoBalance('0');
        setResolveMarketOracle('');
        setResolveMarketCreator('');
        setResolveMarketResolved(false);
        setResolveMarketResolutionTime(0n);
        return;
      }

      try {
        // Fetch market info including oracle, creator, and resolved status
        const [yesTokenAddr, noTokenAddr, oracle, creator, marketInfo] = await Promise.all([
          publicClient.readContract({
            address: resolution.marketAddress as Address,
            abi: LSLMSR_ABI,
            functionName: 'yesToken',
          }) as Promise<Address>,
          publicClient.readContract({
            address: resolution.marketAddress as Address,
            abi: LSLMSR_ABI,
            functionName: 'noToken',
          }) as Promise<Address>,
          publicClient.readContract({
            address: resolution.marketAddress as Address,
            abi: LSLMSR_ABI,
            functionName: 'oracle',
          }) as Promise<Address>,
          publicClient.readContract({
            address: resolution.marketAddress as Address,
            abi: LSLMSR_ABI,
            functionName: 'marketCreator',
          }) as Promise<Address>,
          publicClient.readContract({
            address: resolution.marketAddress as Address,
            abi: LSLMSR_ABI,
            functionName: 'getMarketInfo',
          }) as Promise<[string, bigint, Address, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean]>,
        ]);

        setResolveMarketOracle(oracle.toLowerCase());
        setResolveMarketCreator(creator.toLowerCase());
        setResolveMarketResolved(marketInfo[12]); // resolved is at index 12
        setResolveMarketResolutionTime(marketInfo[1]); // resolutionTime is at index 1

        // Fetch token balances if address is connected
        if (address) {
          const [yesBalance, noBalance] = await Promise.all([
            publicClient.readContract({
              address: yesTokenAddr,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address],
            }) as Promise<bigint>,
            publicClient.readContract({
              address: noTokenAddr,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address],
            }) as Promise<bigint>,
          ]);

          setResolveYesBalance(formatEther(yesBalance));
          setResolveNoBalance(formatEther(noBalance));
        }
      } catch (err) {
        console.error('Failed to fetch resolve tab data:', err);
        setResolveYesBalance('0');
        setResolveNoBalance('0');
        setResolveMarketOracle('');
        setResolveMarketCreator('');
        setResolveMarketResolved(false);
      }
    };

    fetchResolveData();
  }, [publicClient, address, resolution.marketAddress, marketPrices]);

  // Handlers
  const handleConnect = async (connector: any) => {
    try {
      addLog(`Connecting via ${connector.name}...`, 'pending');
      await connect({ connector });
    } catch (err: any) {
      addLog(`Connection failed: ${err.message}`, 'error');
    }
  };

  const handleSwitchChain = async () => {
    try {
      addLog('Switching to Monad Testnet...', 'pending');
      await switchChain({ chainId: monadTestnet.id });
      addLog('Switched to Monad Testnet', 'success');
    } catch (err: any) {
      addLog(`Failed to switch: ${err.message}`, 'error');
    }
  };

  const handleCreateMarket = async () => {
    // Validate resolution date is in the future (at least 1 hour from now)
    const resolutionTimestamp = Math.floor(new Date(marketConfig.resolutionDate).getTime() / 1000);
    const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600;

    if (resolutionTimestamp <= oneHourFromNow) {
      addLog('Resolution date must be at least 1 hour in the future', 'error');
      return;
    }

    const result = await createMarket(marketConfig, addLog);

    if (result) {
      setMarkets(prev => [
        ...prev,
        {
          id: prev.length + 1,
          address: result.marketAddress,
          question: marketConfig.question,
          status: 'ACTIVE',
          yesToken: result.yesToken,
          noToken: result.noToken,
          resolution: marketConfig.resolutionDate,
        },
      ]);

      // Sync to Supabase for indexing and real-time updates
      syncMarketToSupabase({
        address: result.marketAddress,
        question: marketConfig.question,
        yesToken: result.yesToken,
        noToken: result.noToken,
        oracle: address || '',
        creator: address || '',
        resolutionTime: new Date(marketConfig.resolutionDate),
        txHash: result.txHash,
        alpha: marketConfig.alpha,
        minLiquidity: marketConfig.minLiquidity,
        // No protocol fee - 0.5% trading fee goes 100% to market creator
      }).then(success => {
        if (success) {
          addLog('Market synced to Supabase', 'success');
        } else {
          addLog('Warning: Failed to sync market to Supabase', 'error');
        }
      });

      // Auto-select the new market for trading
      setTradeParams(prev => ({ ...prev, marketAddress: result.marketAddress }));
      setSelectedMarket(result.marketAddress);

      // Show confirmation modal with listing prompt
      setCreatedMarket({
        address: result.marketAddress,
        question: marketConfig.question,
        txHash: result.txHash,
        resolutionTime: Math.floor(new Date(marketConfig.resolutionDate).getTime() / 1000),
        yesToken: result.yesToken,
        noToken: result.noToken,
        listed: false,
      });

      // Reset form for next market creation
      setMarketConfig({
        question: '',
        resolutionDate: '',
        oracle: '',
        alpha: '0.03',
        minLiquidity: '100',
        initialYesShares: '100',
        initialNoShares: '100',
        yesName: '',
        yesSymbol: 'YES',
        noName: '',
        noSymbol: 'NO',
        initialLiquidity: '10',
      });
    }
  };

  const handleTrade = async () => {
    if (!tradeParams.marketAddress) {
      addLog('Please enter market address', 'error');
      return;
    }

    // Prevent selling shares the user doesn't have
    if (tradeParams.direction === 'sell') {
      const balance = tradeParams.isYes ? parseFloat(userYesBalance) : parseFloat(userNoBalance);
      if (balance <= 0) {
        addLog(`You don't have any ${tradeParams.isYes ? 'YES' : 'NO'} shares to sell`, 'error');
        return;
      }
      if (parseFloat(tradeParams.amount) > balance) {
        addLog(`You only have ${balance.toFixed(4)} shares available to sell`, 'error');
        return;
      }
    }

    let result: { success: boolean; txHash?: string; shares?: string };

    try {
      if (tradeParams.direction === 'buy') {
        addLog(`Buying ${tradeParams.isYes ? 'YES' : 'NO'} shares with ${tradeParams.amount} USDC...`, 'pending');
        // Apply 3% slippage tolerance on estimated shares
        const estShares = parseFloat(estimatedShares);
        const minSharesWithSlippage = estShares > 0
          ? parseUnits((estShares * 0.97).toFixed(18), 18)
          : 0n;
        const txResult = await buyShares(
          tradeParams.marketAddress as Address,
          tradeParams.isYes,
          tradeParams.amount, // USDC amount
          minSharesWithSlippage
        );
        result = {
          success: true,
          txHash: txResult.hash,
          shares: tradeParams.amount, // Approximate
        };
        addLog(`Buy successful!`, 'success', txResult.hash);
      } else {
        addLog(`Selling ${tradeParams.amount} ${tradeParams.isYes ? 'YES' : 'NO'} shares...`, 'pending');
        const shares = parseUnits(tradeParams.amount, 18); // Shares are 18 decimals
        // Apply 3% slippage tolerance on estimated payout
        const estPayout = parseFloat(estimatedPayout);
        const minPayoutWithSlippage = estPayout > 0
          ? parseUnits((estPayout * 0.97).toFixed(6), 6)
          : 0n;
        const txResult = await sellShares(
          tradeParams.marketAddress as Address,
          tradeParams.isYes,
          shares,
          minPayoutWithSlippage
        );
        result = {
          success: true,
          txHash: txResult.hash,
          shares: tradeParams.amount,
        };
        addLog(`Sell successful!`, 'success', txResult.hash);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Trade failed';
      addLog(errorMsg, 'error');
      result = { success: false };
    }

    if (result.success && result.txHash) {
      // Sync trade to Supabase with price and fee info
      const priceAtTrade = tradeParams.isYes
        ? marketInfo?.yesPrice
        : marketInfo?.noPrice;

      // Calculate fees: 0.5% trading fee, 100% to market creator
      const tradeAmount = parseFloat(tradeParams.amount);
      const tradingFee = tradeAmount * 0.005; // 0.5% fee
      const creatorFee = tradingFee.toFixed(18);  // 100% to creator

      await syncTradeToSupabase({
        marketAddress: tradeParams.marketAddress,
        tradeType: tradeParams.direction === 'buy' ? 'BUY' : 'SELL',
        outcome: tradeParams.isYes ? 'YES' : 'NO',
        shares: result.shares || '0',
        amount: tradeParams.amount,
        txHash: result.txHash,
        priceAtTrade: priceAtTrade ? String(priceAtTrade) : undefined,
        creatorFee,
      });

      // Sync prices to database for other users/markets list
      syncMarketPrices(tradeParams.marketAddress).catch(() => {});

      // Small delay to ensure chain state is updated before refetching
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Refetch all data - await the market info refetch to ensure UI updates
      await refetchMarketInfo();
      refetchDbTrades();
      refetchPortfolio();
      refetchBalance();
    }
  };

  const handleResolveMarket = async () => {
    if (!resolution.marketAddress) {
      addLog('Please enter market address', 'error');
      return;
    }

    await resolve(
      resolution.marketAddress as Address,
      resolution.outcome === 'YES',
      addLog
    );

    // Sync resolved state to database
    syncMarketPrices(resolution.marketAddress).catch(() => {});
  };

  const handleClaimCreatorFees = async () => {
    if (!resolution.marketAddress) {
      addLog('Please enter market address', 'error');
      return;
    }

    const result = await claimFees(resolution.marketAddress as Address, addLog);

    if (result.success) {
      refetchBalance();
      refetchFeeInfo();
    }
  };

  // 0.5% trading fee goes 100% to market creator (no protocol fee)
  // Creator can claim fees after market resolution

  // Tabs configuration
  const tabs = [
    { id: 'connect', label: 'WALLET' },
    { id: 'market', label: 'CREATE' },
    { id: 'trade', label: 'TRADE' },
    { id: 'portfolio', label: 'PORTFOLIO' },
    { id: 'resolve', label: 'RESOLVE' },
    { id: 'markets', label: 'MARKETS' },
  ];

  const isWrongChain = isConnected && chainId !== monadTestnet.id;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>◈ LMSR</div>
          <div style={styles.badge}>PREDICTION MARKETS</div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.networkBadge}>
            {isWrongChain ? (
              <span style={{ color: theme.colors.warning }}>⚠ WRONG NETWORK</span>
            ) : (
              `MONAD TESTNET [${monadTestnet.id}]`
            )}
          </div>
          {isConnected && address && (
            <div style={styles.walletBadge}>
              {address.slice(0, 6)}...{address.slice(-4)} | {parseFloat(usdcBalance).toFixed(2)} USDC
            </div>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav style={styles.nav}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.navButton,
              backgroundColor: activeTab === tab.id ? theme.colors.primary : 'transparent',
              color: activeTab === tab.id ? theme.colors.black : theme.colors.primary,
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div style={styles.mainContainer}>
        {/* Main Content */}
        <main style={styles.main}>
          {/* WALLET TAB */}
          {activeTab === 'connect' && (
            <div>
              <SectionHeader>WALLET CONNECTION</SectionHeader>

              {!isConnected ? (
                <div style={styles.card}>
                  <div style={{ marginBottom: '16px', color: theme.colors.textDim }}>
                    Select a wallet to connect:
                  </div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {connectors.map(connector => (
                      <button
                        key={connector.uid}
                        onClick={() => handleConnect(connector)}
                        disabled={isConnecting}
                        style={{
                          ...styles.button,
                          opacity: isConnecting ? 0.5 : 1,
                        }}
                      >
                        [ {isConnecting ? 'CONNECTING...' : `CONNECT ${connector.name.toUpperCase()}`} ]
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  {isWrongChain && (
                    <div style={{ ...styles.card, borderColor: theme.colors.warning, marginBottom: '24px' }}>
                      <div style={{ color: theme.colors.warning, fontWeight: 'bold', marginBottom: '12px' }}>
                        ⚠ WRONG NETWORK
                      </div>
                      <p style={{ color: theme.colors.textMuted, marginBottom: '16px' }}>
                        Please switch to Monad Testnet to continue.
                      </p>
                      <button onClick={handleSwitchChain} style={styles.button}>
                        [ SWITCH TO MONAD TESTNET ]
                      </button>
                    </div>
                  )}

                  <div style={styles.card}>
                    <InfoRow label="STATUS" value="● CONNECTED" valueColor={theme.colors.primary} />
                    <InfoRow label="ADDRESS" value={address || ''} mono />
                    <InfoRow label="USDC BALANCE" value={`${parseFloat(usdcBalance).toFixed(4)} USDC`} />
                    <InfoRow label="GAS BALANCE" value={`${balance ? parseFloat(formatEther(balance.value)).toFixed(4) : '0'} MON`} />
                    <InfoRow label="CHAIN ID" value={chainId?.toString() || ''} />
                    <div style={{ marginTop: '16px' }}>
                      <button
                        onClick={() => {
                          disconnect();
                          addLog('Disconnected', 'info');
                        }}
                        style={{ ...styles.button, borderColor: theme.colors.error, color: theme.colors.error }}
                      >
                        [ DISCONNECT ]
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '32px' }}>
                <SectionHeader>ABOUT LMSR</SectionHeader>
                <div style={{ ...styles.card, marginTop: '16px' }}>
                  <p style={{ color: theme.colors.textMuted, lineHeight: '1.6' }}>
                    LMSR (Logarithmic Market Scoring Rule) is an automated market maker algorithm
                    designed for prediction markets. It provides guaranteed liquidity and allows
                    traders to buy/sell outcome shares (YES/NO) with prices that reflect the
                    market's probability estimate.
                  </p>
                  <div style={{ marginTop: '16px' }}>
                    <InfoRow label="COLLATERAL" value="USDC" />
                    <InfoRow label="PRICING" value="C(q) = b * ln(e^(qYes/b) + e^(qNo/b))" mono />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CREATE MARKET TAB */}
          {activeTab === 'market' && (
            <div>
              <SectionHeader>CREATE LS-LMSR PREDICTION MARKET</SectionHeader>
              <p style={{ color: theme.colors.textDim, marginBottom: '24px' }}>
                Deploy a new LS-LMSR prediction market with dynamic liquidity and auto-generated YES/NO outcome tokens
              </p>

              <div style={styles.card}>
                <InputField
                  label="QUESTION"
                  value={marketConfig.question}
                  onChange={v => setMarketConfig(p => ({ ...p, question: v }))}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <InputField
                    label="RESOLUTION DATE"
                    value={marketConfig.resolutionDate}
                    type="date"
                    min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                    onChange={v => setMarketConfig(p => ({ ...p, resolutionDate: v }))}
                  />
                  <InputField
                    label="ORACLE ADDRESS"
                    value={marketConfig.oracle}
                    placeholder={address || '0x...'}
                    onChange={v => setMarketConfig(p => ({ ...p, oracle: v }))}
                  />
                </div>
              </div>

              <div style={{ ...styles.card, marginTop: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>TOKEN CONFIG</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ padding: '12px', backgroundColor: theme.colors.primaryDark, border: `1px solid ${theme.colors.primary}` }}>
                    <div style={{ color: theme.colors.primary, marginBottom: '12px', fontWeight: 'bold' }}>YES TOKEN</div>
                    <InputField
                      label="NAME"
                      value={marketConfig.yesName}
                      onChange={v => setMarketConfig(p => ({ ...p, yesName: v }))}
                    />
                    <InputField
                      label="SYMBOL"
                      value={marketConfig.yesSymbol}
                      onChange={v => setMarketConfig(p => ({ ...p, yesSymbol: v }))}
                    />
                  </div>
                  <div style={{ padding: '12px', backgroundColor: theme.colors.warningDark, border: `1px solid ${theme.colors.warning}` }}>
                    <div style={{ color: theme.colors.warning, marginBottom: '12px', fontWeight: 'bold' }}>NO TOKEN</div>
                    <InputField
                      label="NAME"
                      value={marketConfig.noName}
                      onChange={v => setMarketConfig(p => ({ ...p, noName: v }))}
                    />
                    <InputField
                      label="SYMBOL"
                      value={marketConfig.noSymbol}
                      onChange={v => setMarketConfig(p => ({ ...p, noSymbol: v }))}
                    />
                  </div>
                </div>
              </div>

              <div style={{ ...styles.card, marginTop: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>LS-LMSR CONFIG</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <InputField
                    label="ALPHA (α) - Spread Factor"
                    value={marketConfig.alpha}
                    placeholder="0.03"
                    onChange={v => setMarketConfig(p => ({ ...p, alpha: v }))}
                  />
                  <InputField
                    label="MIN LIQUIDITY (b floor, should be ≥ initial shares)"
                    value={marketConfig.minLiquidity}
                    placeholder="100"
                    onChange={v => setMarketConfig(p => ({ ...p, minLiquidity: v }))}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <InputField
                    label="INITIAL YES SHARES"
                    value={marketConfig.initialYesShares}
                    placeholder="100"
                    onChange={v => setMarketConfig(p => ({ ...p, initialYesShares: v }))}
                  />
                  <InputField
                    label="INITIAL NO SHARES"
                    value={marketConfig.initialNoShares}
                    placeholder="100"
                    onChange={v => setMarketConfig(p => ({ ...p, initialNoShares: v }))}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <InputField
                    label="LIQUIDITY BUFFER (USDC)"
                    value={marketConfig.initialLiquidity}
                    placeholder="10"
                    onChange={v => setMarketConfig(p => ({ ...p, initialLiquidity: v }))}
                  />
                </div>
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: theme.colors.highlightDark, border: `1px solid ${theme.colors.warning}` }}>
                  <div style={{ color: theme.colors.warning, fontWeight: 'bold', marginBottom: '8px', fontSize: theme.fontSizes.xs }}>⚠ LIQUIDITY BUFFER</div>
                  <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.xs }}>
                    Buffer ensures winners can redeem at <strong style={{ color: theme.colors.textWhite }}>1 USDC per share</strong>.<br/>
                    <strong>Recommended:</strong> 2-5% of expected total trading volume.<br/>
                    <span style={{ color: theme.colors.textDim }}>Example: Expecting 500 USDC in trades → deposit 10-25 USDC buffer</span><br/>
                    <span style={{ color: theme.colors.textDim }}>Minimum: 1 USDC. Excess can be withdrawn after resolution.</span>
                  </div>
                </div>
                <div style={{ marginTop: '12px', color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                  Market creators earn 0.5% of all trades. Fees can be claimed after resolution. α controls max spread.
                </div>
              </div>

              <button
                onClick={handleCreateMarket}
                disabled={isCreatingMarket || !isConnected || isWrongChain}
                style={{
                  ...styles.button,
                  width: '100%',
                  marginTop: '24px',
                  padding: '16px',
                  opacity: isCreatingMarket || !isConnected || isWrongChain ? 0.5 : 1,
                }}
              >
                [ {isCreatingMarket ? 'DEPLOYING...' : 'DEPLOY LS-LMSR MARKET'} ]
              </button>
            </div>
          )}

          {/* TRADE TAB */}
          {activeTab === 'trade' && (
            <div>
              <SectionHeader>TRADE OUTCOME SHARES</SectionHeader>

              <div style={styles.card}>
                <InputField
                  label="MARKET ADDRESS"
                  value={tradeParams.marketAddress}
                  placeholder="0x..."
                  onChange={v => setTradeParams(p => ({ ...p, marketAddress: v }))}
                />

                {/* Market Type Indicator */}
                {detectedMarketType && (
                  <div style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    backgroundColor: detectedMarketType === 'LSLMSR' ? theme.colors.infoDark : theme.colors.highlightDark,
                    border: `1px solid ${detectedMarketType === 'LSLMSR' ? theme.colors.info : theme.colors.highlight}`,
                    fontSize: theme.fontSizes.xs,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ color: theme.colors.textDim }}>TYPE:</span>
                    <span style={{ color: detectedMarketType === 'LSLMSR' ? theme.colors.info : theme.colors.highlight, fontWeight: 'bold' }}>
                      {detectedMarketType === 'LSLMSR' ? 'LS-LMSR (Dynamic Liquidity)' : 'LMSR (Fixed Liquidity)'}
                    </span>
                  </div>
                )}

                {/* Token Pricing Display */}
                {marketInfo && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ marginBottom: '12px', color: theme.colors.textMuted, fontSize: theme.fontSizes.small }}>
                      {marketInfo.question}
                    </div>

                    {/* Visual Price Display */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                      {/* YES Token Price */}
                      <div style={{
                        padding: '16px',
                        backgroundColor: theme.colors.primaryDark,
                        border: `2px solid ${theme.colors.primary}`,
                        textAlign: 'center',
                      }}>
                        <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '8px' }}>{yesSymbol} TOKEN</div>
                        <div style={{ color: theme.colors.primary, fontSize: theme.fontSizes.displayLg, fontWeight: 'bold' }}>
                          {(Number(marketInfo.yesPrice) / 1e18 * 100).toFixed(1)}%
                        </div>
                        <div style={{ color: theme.colors.primary, fontSize: theme.fontSizes.small, marginTop: '4px' }}>
                          {(Number(marketInfo.yesPrice) / 1e18).toFixed(4)} USDC
                        </div>
                        <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs, marginTop: '8px' }}>
                          {formatEther(marketInfo.yesShares)} shares
                        </div>
                      </div>

                      {/* NO Token Price */}
                      <div style={{
                        padding: '16px',
                        backgroundColor: theme.colors.warningDark,
                        border: `2px solid ${theme.colors.warning}`,
                        textAlign: 'center',
                      }}>
                        <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '8px' }}>{noSymbol} TOKEN</div>
                        <div style={{ color: theme.colors.warning, fontSize: theme.fontSizes.displayLg, fontWeight: 'bold' }}>
                          {(Number(marketInfo.noPrice) / 1e18 * 100).toFixed(1)}%
                        </div>
                        <div style={{ color: theme.colors.warning, fontSize: theme.fontSizes.small, marginTop: '4px' }}>
                          {(Number(marketInfo.noPrice) / 1e18).toFixed(4)} USDC
                        </div>
                        <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs, marginTop: '8px' }}>
                          {formatEther(marketInfo.noShares)} shares
                        </div>
                      </div>
                    </div>

                    {/* Price Bar Visualization */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', height: '24px', border: `1px solid ${theme.colors.border}`, overflow: 'hidden' }}>
                        <div style={{
                          width: `${(Number(marketInfo.yesPrice) / 1e18 * 100)}%`,
                          backgroundColor: theme.colors.primary,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: theme.colors.black,
                          fontSize: theme.fontSizes.xxs,
                          fontWeight: 'bold',
                          transition: 'width 0.3s',
                        }}>
                          {yesSymbol}
                        </div>
                        <div style={{
                          flex: 1,
                          backgroundColor: theme.colors.warning,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: theme.colors.black,
                          fontSize: theme.fontSizes.xxs,
                          fontWeight: 'bold',
                        }}>
                          {noSymbol}
                        </div>
                      </div>
                    </div>

                    {/* Market Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '12px', backgroundColor: theme.colors.pageBg, border: `1px solid ${theme.colors.border}` }}>
                      <InfoRow label="COLLATERAL POOL" value={`${formatUnits(marketInfo.totalCollateral, marketInfo.collateralDecimals || 18)} ${marketInfo.collateralSymbol || 'MON'}`} />
                      <InfoRow
                        label="STATUS"
                        value={marketInfo.resolved ? `${marketInfo.yesWins ? yesSymbol : noSymbol} WINS` : 'ACTIVE'}
                        valueColor={marketInfo.resolved ? theme.colors.highlight : theme.colors.primary}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Show resolved state or trading interface */}
              {marketInfo?.resolved ? (
                <div style={{ ...styles.card, marginTop: '24px', borderColor: theme.colors.highlight }}>
                  <div style={{
                    textAlign: 'center',
                    padding: '24px',
                  }}>
                    <div style={{ color: theme.colors.highlight, fontSize: theme.fontSizes.sectionTitle, fontWeight: 'bold', marginBottom: '8px' }}>
                      MARKET RESOLVED
                    </div>
                    <div style={{ color: theme.colors.textWhite, fontSize: theme.fontSizes.title, marginBottom: '16px' }}>
                      Winner: <span style={{ color: marketInfo.yesWins ? theme.colors.primary : theme.colors.warning, fontWeight: 'bold' }}>
                        {marketInfo.yesWins ? yesSymbol : noSymbol}
                      </span>
                    </div>
                    <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.small, marginBottom: '24px' }}>
                      Trading is closed. Holders of {marketInfo.yesWins ? yesSymbol : noSymbol} tokens can redeem for their share of the collateral pool.
                    </div>

                    {/* Show user's winning tokens if any */}
                    {((marketInfo.yesWins && parseFloat(userYesBalance) > 0) || (!marketInfo.yesWins && parseFloat(userNoBalance) > 0)) && (
                      <div style={{
                        padding: '16px',
                        backgroundColor: theme.colors.primaryDark,
                        border: `2px solid ${theme.colors.primary}`,
                        marginBottom: '16px',
                      }}>
                        <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>YOUR WINNING TOKENS</div>
                        <div style={{ color: theme.colors.primary, fontSize: theme.fontSizes.displayMd, fontWeight: 'bold' }}>
                          {marketInfo.yesWins ? parseFloat(userYesBalance).toFixed(4) : parseFloat(userNoBalance).toFixed(4)}
                        </div>
                        <div style={{ color: theme.colors.primary, fontSize: theme.fontSizes.small }}>
                          {marketInfo.yesWins ? yesSymbol : noSymbol} shares
                        </div>
                      </div>
                    )}

                    {(marketInfo.yesWins ? parseFloat(userYesBalance) === 0 : parseFloat(userNoBalance) === 0) ? (
                      <button
                        disabled
                        style={{
                          ...styles.button,
                          width: '100%',
                          padding: '16px',
                          backgroundColor: theme.colors.primaryBgMuted,
                          borderColor: theme.colors.textDisabled,
                          color: theme.colors.textDisabled,
                          cursor: 'not-allowed',
                        }}
                      >
                        [ ✓ CLAIMED ]
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          const result = await redeem(tradeParams.marketAddress as Address, addLog);
                          if (result.success && result.txHash && result.shares && result.payout) {
                            // Sync redeem to Supabase
                            await syncTradeToSupabase({
                              marketAddress: tradeParams.marketAddress,
                              tradeType: 'REDEEM',
                              outcome: result.yesWins ? 'YES' : 'NO',
                              shares: result.shares,
                              amount: result.payout,
                              txHash: result.txHash,
                            });
                            // Refetch from database
                            refetchDbTrades();
                            refetchPortfolio();
                            refetchBalance();
                            refetchMarketInfo();
                          }
                        }}
                        disabled={isRedeeming}
                        style={{
                          ...styles.button,
                          width: '100%',
                          padding: '16px',
                          backgroundColor: theme.colors.primaryDark,
                          borderColor: theme.colors.primary,
                          color: theme.colors.primary,
                          opacity: isRedeeming ? 0.5 : 1,
                        }}
                      >
                        [ {isRedeeming ? 'REDEEMING...' : 'REDEEM WINNINGS'} ]
                      </button>
                    )}
                  </div>
                </div>
              ) : (
              <div style={{ ...styles.card, marginTop: '24px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '8px', letterSpacing: '1px' }}>
                    DIRECTION
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setTradeParams(p => ({ ...p, direction: 'buy' }))}
                      style={{
                        ...styles.button,
                        flex: 1,
                        backgroundColor: tradeParams.direction === 'buy' ? theme.colors.primary : 'transparent',
                        color: tradeParams.direction === 'buy' ? theme.colors.black : theme.colors.primary,
                      }}
                    >
                      BUY
                    </button>
                    <button
                      onClick={() => setTradeParams(p => ({ ...p, direction: 'sell' }))}
                      style={{
                        ...styles.button,
                        flex: 1,
                        backgroundColor: tradeParams.direction === 'sell' ? theme.colors.warning : 'transparent',
                        color: tradeParams.direction === 'sell' ? theme.colors.black : theme.colors.warning,
                        borderColor: theme.colors.warning,
                      }}
                    >
                      SELL
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '8px', letterSpacing: '1px' }}>
                    OUTCOME
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setTradeParams(p => ({ ...p, isYes: true }))}
                      style={{
                        ...styles.button,
                        flex: 1,
                        backgroundColor: tradeParams.isYes ? theme.colors.primary : 'transparent',
                        color: tradeParams.isYes ? theme.colors.black : theme.colors.primary,
                      }}
                    >
                      {yesSymbol}
                    </button>
                    <button
                      onClick={() => setTradeParams(p => ({ ...p, isYes: false }))}
                      style={{
                        ...styles.button,
                        flex: 1,
                        backgroundColor: !tradeParams.isYes ? theme.colors.warning : 'transparent',
                        color: !tradeParams.isYes ? theme.colors.black : theme.colors.warning,
                        borderColor: theme.colors.warning,
                      }}
                    >
                      {noSymbol}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <InputField
                    label={tradeParams.direction === 'buy' ? 'AMOUNT (USDC)' : 'SHARES TO SELL'}
                    value={tradeParams.amount}
                    onChange={v => setTradeParams(p => ({ ...p, amount: v }))}
                  />
                  {tradeParams.direction === 'buy' ? (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '8px', letterSpacing: '1px' }}>
                        PRICE IMPACT
                      </label>
                      <div style={{
                        padding: '12px',
                        backgroundColor: theme.colors.pageBg,
                        border: `1px solid ${theme.colors.border}`,
                        textAlign: 'center',
                      }}>
                        {(() => {
                          if (!marketInfo || !tradeParams.amount || parseFloat(tradeParams.amount) <= 0 || parseFloat(estimatedShares) <= 0 || isEstimating) {
                            return <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.nav }}>--</span>;
                          }
                          const spotPrice = Number(tradeParams.isYes ? marketInfo.yesPrice : marketInfo.noPrice) / 1e18;
                          const avgPrice = parseFloat(tradeParams.amount) / parseFloat(estimatedShares);
                          const impact = ((avgPrice - spotPrice) / spotPrice) * 100;
                          const impactColor = impact < 1 ? theme.colors.primary : impact < 5 ? theme.colors.highlight : theme.colors.warning;
                          return (
                            <span style={{ color: impactColor, fontSize: theme.fontSizes.title, fontWeight: 'bold' }}>
                              {impact.toFixed(2)}%
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '8px', letterSpacing: '1px' }}>
                        PRICE IMPACT
                      </label>
                      <div style={{
                        padding: '12px',
                        backgroundColor: theme.colors.pageBg,
                        border: `1px solid ${theme.colors.border}`,
                        textAlign: 'center',
                      }}>
                        {(() => {
                          if (!marketInfo || !tradeParams.amount || parseFloat(tradeParams.amount) <= 0 || parseFloat(estimatedPayout) <= 0) {
                            return <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.nav }}>--</span>;
                          }
                          const spotPrice = Number(tradeParams.isYes ? marketInfo.yesPrice : marketInfo.noPrice) / 1e18;
                          const avgPrice = parseFloat(estimatedPayout) / parseFloat(tradeParams.amount);
                          const impact = ((spotPrice - avgPrice) / spotPrice) * 100;
                          const impactColor = impact < 1 ? theme.colors.primary : impact < 5 ? theme.colors.highlight : theme.colors.warning;
                          return (
                            <span style={{ color: impactColor, fontSize: theme.fontSizes.title, fontWeight: 'bold' }}>
                              {impact.toFixed(2)}%
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Estimated Shares Display */}
                {marketInfo && tradeParams.amount && parseFloat(tradeParams.amount) > 0 && tradeParams.direction === 'buy' && (
                  <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    backgroundColor: tradeParams.isYes ? theme.colors.primaryDark : theme.colors.warningDark,
                    border: `1px solid ${tradeParams.isYes ? theme.colors.primary : theme.colors.warning}`,
                    textAlign: 'center',
                  }}>
                    <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>
                      {isEstimating ? 'CALCULATING...' : 'ESTIMATED SHARES'}
                    </div>
                    <div style={{
                      color: tradeParams.isYes ? theme.colors.primary : theme.colors.warning,
                      fontSize: theme.fontSizes.displayMd,
                      fontWeight: 'bold',
                    }}>
                      {isEstimating ? '...' : `~${parseFloat(estimatedShares).toFixed(4)}`}
                    </div>
                    <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginTop: '4px' }}>
                      {tradeParams.isYes ? yesSymbol : noSymbol} shares
                      {parseFloat(estimatedShares) > 0 && !isEstimating && (
                        <> (avg {(parseFloat(tradeParams.amount) / parseFloat(estimatedShares)).toFixed(4)} {marketInfo?.collateralSymbol || 'USDC'}/share)</>
                      )}
                    </div>
                    <div style={{ color: theme.colors.textDisabled, fontSize: theme.fontSizes.xxs, marginTop: '8px' }}>
                      Current price: {(Number(tradeParams.isYes ? marketInfo.yesPrice : marketInfo.noPrice) / 1e18 * 100).toFixed(1)}%
                    </div>
                  </div>
                )}

                {/* Sell Mode: Show available shares and estimated payout */}
                {marketInfo && tradeParams.direction === 'sell' && (
                  <div style={{ marginTop: '16px' }}>
                    {/* Available Shares */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
                      marginBottom: '16px',
                    }}>
                      <div style={{
                        padding: '12px',
                        backgroundColor: theme.colors.primaryDark,
                        border: `2px solid ${tradeParams.isYes ? theme.colors.primary : theme.colors.border}`,
                        textAlign: 'center',
                        cursor: 'pointer',
                        opacity: tradeParams.isYes ? 1 : 0.6,
                      }}
                      onClick={() => {
                        if (parseFloat(userYesBalance) > 0) {
                          setTradeParams(p => ({ ...p, isYes: true, amount: userYesBalance }));
                        }
                      }}
                      >
                        <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs, marginBottom: '4px' }}>YOUR {yesSymbol} SHARES</div>
                        <div style={{ color: theme.colors.primary, fontSize: theme.fontSizes.displaySm, fontWeight: 'bold' }}>
                          {parseFloat(userYesBalance).toFixed(4)}
                        </div>
                        {parseFloat(userYesBalance) > 0 && (
                          <div style={{ color: theme.colors.primary, fontSize: theme.fontSizes.tiny, marginTop: '4px' }}>Click to sell all</div>
                        )}
                      </div>
                      <div style={{
                        padding: '12px',
                        backgroundColor: theme.colors.warningDark,
                        border: `2px solid ${!tradeParams.isYes ? theme.colors.warning : theme.colors.border}`,
                        textAlign: 'center',
                        cursor: 'pointer',
                        opacity: !tradeParams.isYes ? 1 : 0.6,
                      }}
                      onClick={() => {
                        if (parseFloat(userNoBalance) > 0) {
                          setTradeParams(p => ({ ...p, isYes: false, amount: userNoBalance }));
                        }
                      }}
                      >
                        <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs, marginBottom: '4px' }}>YOUR {noSymbol} SHARES</div>
                        <div style={{ color: theme.colors.warning, fontSize: theme.fontSizes.displaySm, fontWeight: 'bold' }}>
                          {parseFloat(userNoBalance).toFixed(4)}
                        </div>
                        {parseFloat(userNoBalance) > 0 && (
                          <div style={{ color: theme.colors.warning, fontSize: theme.fontSizes.tiny, marginTop: '4px' }}>Click to sell all</div>
                        )}
                      </div>
                    </div>

                    {/* Estimated Payout */}
                    {tradeParams.amount && parseFloat(tradeParams.amount) > 0 && (
                      <div style={{
                        padding: '16px',
                        backgroundColor: theme.colors.pageBg,
                        border: `1px solid ${theme.colors.highlight}`,
                        textAlign: 'center',
                      }}>
                        <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>ESTIMATED PAYOUT</div>
                        <div style={{ color: theme.colors.highlight, fontSize: theme.fontSizes.displayMd, fontWeight: 'bold' }}>
                          {parseFloat(estimatedPayout).toFixed(4)} USDC
                        </div>
                        <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginTop: '4px' }}>
                          for {tradeParams.amount} {tradeParams.isYes ? yesSymbol : noSymbol} shares
                        </div>
                        {parseFloat(estimatedPayout) > 0 && parseFloat(tradeParams.amount) > 0 && (
                          <div style={{ color: theme.colors.textDisabled, fontSize: theme.fontSizes.xxs, marginTop: '8px' }}>
                            Avg price: {(parseFloat(estimatedPayout) / parseFloat(tradeParams.amount)).toFixed(4)} USDC/share
                            {marketInfo && (
                              <> | Spot: {(Number(tradeParams.isYes ? marketInfo.yesPrice : marketInfo.noPrice) / 1e18).toFixed(4)} USDC</>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Check if user has shares to sell */}
                {(() => {
                  const cannotSell = tradeParams.direction === 'sell' && (
                    (tradeParams.isYes && parseFloat(userYesBalance) <= 0) ||
                    (!tradeParams.isYes && parseFloat(userNoBalance) <= 0)
                  );
                  const isDisabled = isBuying || isSelling || !tradeParams.marketAddress || !isConnected || isWrongChain || cannotSell;
                  return (
                    <button
                      onClick={handleTrade}
                      disabled={isDisabled}
                      style={{
                        ...styles.button,
                        width: '100%',
                        marginTop: '24px',
                        padding: '16px',
                        backgroundColor: tradeParams.direction === 'buy' ? theme.colors.primaryDark : theme.colors.warningDark,
                        borderColor: tradeParams.direction === 'buy' ? theme.colors.primary : theme.colors.warning,
                        color: tradeParams.direction === 'buy' ? theme.colors.primary : theme.colors.warning,
                        opacity: isDisabled ? 0.5 : 1,
                      }}
                    >
                      [ {isBuying || isSelling ? 'PROCESSING...' : cannotSell ? `NO ${tradeParams.isYes ? yesSymbol : noSymbol} SHARES TO SELL` : `${tradeParams.direction.toUpperCase()} ${tradeParams.isYes ? yesSymbol : noSymbol} SHARES`} ]
                    </button>
                  );
                })()}
              </div>
              )}
            </div>
          )}

          {/* PORTFOLIO TAB */}
          {activeTab === 'portfolio' && (
            <div>
              <SectionHeader>PORTFOLIO</SectionHeader>
              <p style={{ color: theme.colors.textDim, marginBottom: '24px' }}>
                Your positions and P&L across all markets
              </p>

              {/* PnL Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{
                  ...styles.card,
                  textAlign: 'center',
                  borderColor: totalPnL >= 0 ? theme.colors.primary : theme.colors.error,
                  borderWidth: '2px',
                }}>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>TOTAL P&L</div>
                  <div style={{
                    color: totalPnL >= 0 ? theme.colors.primary : theme.colors.error,
                    fontSize: theme.fontSizes.displayMd,
                    fontWeight: 'bold',
                  }}>
                    {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(4)}
                  </div>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>USDC</div>
                </div>
                <div style={{ ...styles.card, textAlign: 'center' }}>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>REALIZED P&L</div>
                  <div style={{
                    color: totalRealizedPnL >= 0 ? theme.colors.primary : theme.colors.error,
                    fontSize: theme.fontSizes.sectionTitle,
                    fontWeight: 'bold',
                  }}>
                    {totalRealizedPnL >= 0 ? '+' : ''}{totalRealizedPnL.toFixed(4)}
                  </div>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>From sells & redemptions</div>
                </div>
                <div style={{ ...styles.card, textAlign: 'center' }}>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>OPEN POSITIONS</div>
                  <div style={{
                    color: totalUnrealizedPnL >= 0 ? theme.colors.primary : theme.colors.error,
                    fontSize: theme.fontSizes.sectionTitle,
                    fontWeight: 'bold',
                  }}>
                    {totalUnrealizedPnL >= 0 ? '+' : ''}{totalUnrealizedPnL.toFixed(4)}
                  </div>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>Mark-to-market</div>
                </div>
              </div>

              {/* Open Positions */}
              {positions.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontWeight: 'bold', letterSpacing: '2px', marginBottom: '16px' }}>OPEN POSITIONS</div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {positions.map(pos => {
                      const unrealizedPnL = getUnrealizedPnL(pos);
                      const prices = marketPrices[pos.marketAddress.toLowerCase()];
                      const yesValue = prices ? pos.yesShares * prices.yesPrice : 0;
                      const noValue = prices ? pos.noShares * prices.noPrice : 0;
                      const totalValue = yesValue + noValue;
                      const totalCost = pos.yesCostBasis + pos.noCostBasis;

                      return (
                        <div
                          key={pos.marketAddress}
                          style={{
                            ...styles.card,
                            borderLeftWidth: '4px',
                            borderLeftColor: unrealizedPnL >= 0 ? theme.colors.primary : theme.colors.error,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div>
                              <div style={{ color: theme.colors.textWhite, fontWeight: 'bold', marginBottom: '4px' }}>
                                {pos.marketQuestion || 'Unknown Market'}
                              </div>
                              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                                {pos.marketAddress.slice(0, 10)}...{pos.marketAddress.slice(-8)}
                              </div>
                              {pos.resolved && (
                                <div style={{
                                  marginTop: '4px',
                                  padding: '2px 8px',
                                  backgroundColor: theme.colors.highlightDark,
                                  border: `1px solid ${theme.colors.highlight}`,
                                  color: theme.colors.highlight,
                                  fontSize: theme.fontSizes.xxs,
                                  display: 'inline-block',
                                }}>
                                  RESOLVED: {pos.yesWins ? 'YES' : 'NO'} WINS
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{
                                color: unrealizedPnL >= 0 ? theme.colors.primary : theme.colors.error,
                                fontSize: theme.fontSizes.displaySm,
                                fontWeight: 'bold',
                              }}>
                                {unrealizedPnL >= 0 ? '+' : ''}{unrealizedPnL.toFixed(4)}
                              </div>
                              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>Unrealized P&L</div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                            {pos.yesShares > 0.0001 && (
                              <div style={{ padding: '8px', backgroundColor: theme.colors.primaryDark, border: `1px solid ${theme.colors.primary}` }}>
                                <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>YES SHARES</div>
                                <div style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{pos.yesShares.toFixed(4)}</div>
                                <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>Cost: {pos.yesCostBasis.toFixed(4)}</div>
                              </div>
                            )}
                            {pos.noShares > 0.0001 && (
                              <div style={{ padding: '8px', backgroundColor: theme.colors.warningDark, border: `1px solid ${theme.colors.warning}` }}>
                                <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>NO SHARES</div>
                                <div style={{ color: theme.colors.warning, fontWeight: 'bold' }}>{pos.noShares.toFixed(4)}</div>
                                <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>Cost: {pos.noCostBasis.toFixed(4)}</div>
                              </div>
                            )}
                            <div style={{ padding: '8px', backgroundColor: theme.colors.pageBg, border: `1px solid ${theme.colors.border}` }}>
                              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>COST BASIS</div>
                              <div style={{ color: theme.colors.textWhite, fontWeight: 'bold' }}>{totalCost.toFixed(4)}</div>
                              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>USDC</div>
                            </div>
                            <div style={{ padding: '8px', backgroundColor: theme.colors.pageBg, border: `1px solid ${theme.colors.border}` }}>
                              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>MARKET VALUE</div>
                              <div style={{ color: theme.colors.textWhite, fontWeight: 'bold' }}>{totalValue.toFixed(4)}</div>
                              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>USDC</div>
                            </div>
                          </div>

                          {Math.abs(pos.realizedPnL) > 0.0001 && (
                            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: theme.colors.pageBg, border: `1px solid ${theme.colors.border}` }}>
                              <span style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>Realized P&L: </span>
                              <span style={{
                                color: pos.realizedPnL >= 0 ? theme.colors.primary : theme.colors.error,
                                fontWeight: 'bold',
                              }}>
                                {pos.realizedPnL >= 0 ? '+' : ''}{pos.realizedPnL.toFixed(4)} USDC
                              </span>
                            </div>
                          )}

                          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                            {pos.resolved ? (
                              <button
                                onClick={() => {
                                  setTradeParams(prev => ({ ...prev, marketAddress: pos.marketAddress }));
                                  setActiveTab('trade');
                                }}
                                style={{ ...styles.button, flex: 1, padding: '8px', fontSize: theme.fontSizes.xxs, borderColor: theme.colors.textDim, color: theme.colors.textDim }}
                              >
                                VIEW
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setTradeParams(prev => ({ ...prev, marketAddress: pos.marketAddress }));
                                  setActiveTab('trade');
                                }}
                                style={{ ...styles.button, flex: 1, padding: '8px', fontSize: theme.fontSizes.xxs }}
                              >
                                TRADE
                              </button>
                            )}
                            {pos.resolved && (() => {
                              const winningShares = pos.yesWins ? pos.yesShares : pos.noShares;
                              const hasClaimed = winningShares < 0.0001;

                              if (hasClaimed) {
                                return (
                                  <button
                                    disabled
                                    style={{
                                      ...styles.button,
                                      flex: 1,
                                      padding: '8px',
                                      fontSize: theme.fontSizes.xxs,
                                      borderColor: theme.colors.textDisabled,
                                      color: theme.colors.textDisabled,
                                      cursor: 'not-allowed',
                                    }}
                                  >
                                    CLAIMED
                                  </button>
                                );
                              }

                              return (
                                <button
                                  onClick={() => {
                                    setResolution(prev => ({ ...prev, marketAddress: pos.marketAddress }));
                                    setActiveTab('resolve');
                                  }}
                                  style={{ ...styles.button, flex: 1, padding: '8px', fontSize: theme.fontSizes.xxs, borderColor: theme.colors.highlight, color: theme.colors.highlight }}
                                >
                                  REDEEM
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Trade Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ ...styles.card, textAlign: 'center' }}>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>TOTAL TRADES</div>
                  <div style={{ color: theme.colors.primary, fontSize: theme.fontSizes.sectionTitle, fontWeight: 'bold' }}>{trades.length}</div>
                </div>
                <div style={{ ...styles.card, textAlign: 'center' }}>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>BUYS</div>
                  <div style={{ color: theme.colors.primary, fontSize: theme.fontSizes.sectionTitle, fontWeight: 'bold' }}>
                    {trades.filter(t => t.type === 'buy').length}
                  </div>
                </div>
                <div style={{ ...styles.card, textAlign: 'center' }}>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>SELLS</div>
                  <div style={{ color: theme.colors.warning, fontSize: theme.fontSizes.sectionTitle, fontWeight: 'bold' }}>
                    {trades.filter(t => t.type === 'sell').length}
                  </div>
                </div>
                <div style={{ ...styles.card, textAlign: 'center' }}>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>VOLUME</div>
                  <div style={{ color: theme.colors.textWhite, fontSize: theme.fontSizes.sectionTitle, fontWeight: 'bold' }}>
                    {trades.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0).toFixed(2)}
                  </div>
                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs }}>USDC</div>
                </div>
              </div>

              {/* Trade History */}
              {trades.length === 0 ? (
                <div style={{ ...styles.card, textAlign: 'center', padding: '48px', color: theme.colors.textDim }}>
                  No trades yet. Start trading in the TRADE tab.
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', letterSpacing: '2px' }}>TRADE HISTORY</div>
                    <button
                      onClick={() => refetchDbTrades()}
                      disabled={isLoadingPortfolio}
                      style={{ ...styles.button, padding: '6px 12px', fontSize: theme.fontSizes.xxs, borderColor: theme.colors.info, color: theme.colors.info }}
                    >
                      {isLoadingPortfolio ? 'LOADING...' : 'REFRESH'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {trades.map(trade => (
                      <div
                        key={trade.id}
                        style={{
                          ...styles.card,
                          padding: '16px',
                          borderLeftWidth: '4px',
                          borderLeftColor: trade.type === 'buy' ? theme.colors.primary : theme.colors.warning,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                              <span style={{
                                padding: '2px 8px',
                                backgroundColor: trade.type === 'buy' ? theme.colors.primaryDark : theme.colors.warningDark,
                                border: `1px solid ${trade.type === 'buy' ? theme.colors.primary : theme.colors.warning}`,
                                color: trade.type === 'buy' ? theme.colors.primary : theme.colors.warning,
                                fontSize: theme.fontSizes.xxs,
                                fontWeight: 'bold',
                              }}>
                                {trade.type.toUpperCase()}
                              </span>
                              <span style={{
                                padding: '2px 8px',
                                backgroundColor: trade.outcome === 'YES' ? theme.colors.primaryDark : theme.colors.warningDark,
                                border: `1px solid ${trade.outcome === 'YES' ? theme.colors.primary : theme.colors.warning}`,
                                color: trade.outcome === 'YES' ? theme.colors.primary : theme.colors.warning,
                                fontSize: theme.fontSizes.xxs,
                                fontWeight: 'bold',
                              }}>
                                {trade.outcome}
                              </span>
                              <span style={{
                                padding: '2px 8px',
                                backgroundColor: theme.colors.cardBg,
                                border: `1px solid ${theme.colors.textDim}`,
                                color: theme.colors.textWhite,
                                fontSize: theme.fontSizes.xxs,
                                fontWeight: 'bold',
                              }}>
                                {parseFloat(trade.shares || '0').toFixed(4)} SHARES
                              </span>
                            </div>
                            <div style={{ color: theme.colors.textWhite, fontSize: theme.fontSizes.nav, fontWeight: 'bold', marginBottom: '8px' }}>
                              {trade.type === 'buy' ? 'Spent' : 'Received'}: {trade.amount} USDC
                            </div>
                            {trade.marketQuestion && (
                              <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.small, marginBottom: '4px' }}>
                                {trade.marketQuestion}
                              </div>
                            )}
                            <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                              Market: {trade.marketAddress.slice(0, 10)}...{trade.marketAddress.slice(-8)}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                              {new Date(trade.timestamp).toLocaleDateString()}{' '}
                              {new Date(trade.timestamp).toLocaleTimeString()}
                            </div>
                            <a
                              href={`${monadTestnet.blockExplorers.default.url}/tx/${trade.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-block',
                                marginTop: '8px',
                                padding: '4px 12px',
                                backgroundColor: theme.colors.primaryDark,
                                border: `1px solid ${theme.colors.primary}`,
                                color: theme.colors.primary,
                                fontSize: theme.fontSizes.xxs,
                                textDecoration: 'none',
                              }}
                            >
                              VIEW TX →
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RESOLVE TAB */}
          {activeTab === 'resolve' && (
            <div>
              <SectionHeader>RESOLVE MARKET</SectionHeader>
              <p style={{ color: theme.colors.textDim, marginBottom: '24px' }}>Oracle-only function to set the final outcome</p>

              <div style={styles.card}>
                <InputField
                  label="MARKET ADDRESS"
                  value={resolution.marketAddress}
                  placeholder="0x..."
                  onChange={v => setResolution(p => ({ ...p, marketAddress: v }))}
                />
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '8px', letterSpacing: '1px' }}>
                    OUTCOME
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {(['YES', 'NO'] as const).map(outcome => (
                      <button
                        key={outcome}
                        onClick={() => setResolution(p => ({ ...p, outcome }))}
                        style={{
                          ...styles.button,
                          backgroundColor: resolution.outcome === outcome
                            ? outcome === 'YES' ? theme.colors.primary : theme.colors.warning
                            : 'transparent',
                          color: resolution.outcome === outcome
                            ? theme.colors.black
                            : outcome === 'YES' ? theme.colors.primary : theme.colors.warning,
                          borderColor: outcome === 'YES' ? theme.colors.primary : theme.colors.warning,
                        }}
                      >
                        {outcome} WINS
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px' }}>
                {/* RESOLVE BUTTON - Only for oracle, only if not resolved */}
                {(() => {
                  const isOracle = address && resolveMarketOracle && address.toLowerCase() === resolveMarketOracle;

                  if (resolveMarketResolved) {
                    return (
                      <button
                        disabled
                        style={{
                          ...styles.button,
                          backgroundColor: theme.colors.highlightDark,
                          borderColor: theme.colors.textDisabled,
                          color: theme.colors.textDisabled,
                          padding: '16px',
                          cursor: 'not-allowed',
                        }}
                      >
                        [ ✓ ALREADY RESOLVED ]
                      </button>
                    );
                  }

                  // Check if resolution time has passed
                  const now = BigInt(Math.floor(Date.now() / 1000));
                  const canResolveTime = resolveMarketResolutionTime > 0n && now >= resolveMarketResolutionTime;

                  if (resolveMarketResolutionTime > 0n && !canResolveTime && resolution.marketAddress) {
                    const resolutionDate = new Date(Number(resolveMarketResolutionTime) * 1000);
                    return (
                      <button
                        disabled
                        style={{
                          ...styles.button,
                          backgroundColor: theme.colors.highlightDark,
                          borderColor: theme.colors.textDisabled,
                          color: theme.colors.textDisabled,
                          padding: '16px',
                          cursor: 'not-allowed',
                        }}
                      >
                        [ TOO EARLY - Resolves {resolutionDate.toLocaleDateString()} ]
                      </button>
                    );
                  }

                  // Hide resolve button entirely for non-oracle users
                  if (!isOracle && resolution.marketAddress) {
                    return null;
                  }

                  return (
                    <button
                      onClick={handleResolveMarket}
                      disabled={isResolving || !resolution.marketAddress || !isConnected || isWrongChain || !isOracle || !canResolveTime}
                      style={{
                        ...styles.button,
                        backgroundColor: theme.colors.errorBgDark,
                        borderColor: theme.colors.error,
                        color: theme.colors.error,
                        padding: '16px',
                        opacity: isResolving || !resolution.marketAddress || !isConnected || isWrongChain || !canResolveTime ? 0.5 : 1,
                      }}
                    >
                      [ {isResolving ? 'RESOLVING...' : '⚠ RESOLVE MARKET'} ]
                    </button>
                  );
                })()}

                {/* CREATOR FEE INFO - Only visible to market creator */}
                {feeInfo && feeInfo.isMarketCreator && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: theme.colors.pageBg,
                    border: `1px solid ${theme.colors.border}`,
                    marginBottom: '16px',
                  }}>
                    <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xxs, marginBottom: '4px' }}>YOUR CREATOR FEES</div>
                    <div style={{ color: feeInfo.canClaimCreatorFees ? theme.colors.primary : theme.colors.textDim, fontWeight: 'bold', fontSize: theme.fontSizes.title }}>
                      {parseFloat(feeInfo.creatorFees).toFixed(6)} USDC
                    </div>
                    <div style={{ color: theme.colors.textDisabled, fontSize: theme.fontSizes.tiny, marginTop: '4px' }}>
                      Earned from trading fees on your market
                    </div>
                  </div>
                )}

                {/* 0.5% trading fee goes 100% to market creator */}

                {/* CLAIM CREATOR FEES BUTTON */}
                {(() => {
                  if (!feeInfo?.isMarketCreator) {
                    return null;
                  }

                  if (!resolveMarketResolved && resolveMarketResolutionTime > BigInt(Math.floor(Date.now() / 1000))) {
                    return (
                      <button
                        disabled
                        style={{
                          ...styles.button,
                          backgroundColor: theme.colors.pageBg,
                          borderColor: theme.colors.textDisabled,
                          color: theme.colors.textDisabled,
                          padding: '16px',
                          cursor: 'not-allowed',
                        }}
                      >
                        [ AWAITING RESOLUTION ]
                      </button>
                    );
                  }

                  return (
                    <button
                      onClick={handleClaimCreatorFees}
                      disabled={isClaimingCreatorFees || !feeInfo.canClaimCreatorFees || !isConnected || isWrongChain}
                      style={{
                        ...styles.button,
                        backgroundColor: feeInfo.canClaimCreatorFees ? theme.colors.primaryDark : theme.colors.pageBg,
                        borderColor: feeInfo.canClaimCreatorFees ? theme.colors.primary : theme.colors.textDisabled,
                        color: feeInfo.canClaimCreatorFees ? theme.colors.primary : theme.colors.textDisabled,
                        padding: '16px',
                        opacity: isClaimingCreatorFees || !feeInfo.canClaimCreatorFees ? 0.5 : 1,
                      }}
                    >
                      [ {isClaimingCreatorFees ? 'CLAIMING...' : `CLAIM CREATOR FEES (${parseFloat(feeInfo.creatorFees).toFixed(4)} USDC)`} ]
                    </button>
                  );
                })()}
              </div>

              {feeInfo?.isMarketCreator && (
                <div style={{ ...styles.card, marginTop: '24px', borderColor: theme.colors.warning }}>
                  <div style={{ color: theme.colors.warning, fontWeight: 'bold', marginBottom: '8px' }}>ℹ CREATOR FEE INFO</div>
                  <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.small }}>
                    As the market creator, you earn 0.5% of all trades on this market.<br />
                    Creator fees can be claimed after the market resolves or after the resolution time passes.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MARKETS TAB */}
          {activeTab === 'markets' && (
            <div>
              <div style={{ ...styles.card, marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input
                    value={marketSearch}
                    onChange={e => setMarketSearch(e.target.value)}
                    placeholder="Search markets by question or address..."
                    style={{
                      flex: 1,
                      padding: '12px 14px',
                      backgroundColor: theme.colors.pageBg,
                      border: `1px solid ${theme.colors.border}`,
                      color: theme.colors.textWhite,
                      fontFamily: theme.fonts.mono,
                      fontSize: theme.fontSizes.small,
                      outline: 'none',
                    }}
                  />
                  {marketSearch.trim() && (
                    <button
                      onClick={() => setMarketSearch('')}
                      style={{
                        ...styles.button,
                        padding: '10px 12px',
                        borderColor: theme.colors.textDisabled,
                        color: theme.colors.textSubtle,
                      }}
                    >
                      CLEAR
                    </button>
                  )}
                </div>
                <div style={{ marginTop: '10px', color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                  Showing {displayMarkets.length} / {markets.length} markets
                </div>
              </div>

              {markets.length === 0 ? (
                <div style={{ ...styles.card, textAlign: 'center', padding: '48px', color: theme.colors.textDim }}>
                  No markets deployed yet. Create one in the CREATE tab.
                </div>
              ) : (
                <>
                  {/* ACTIVE MARKETS */}
                  {(() => {
                    const activeMarkets = displayMarkets.filter(m => !marketPrices[m.address.toLowerCase()]?.resolved);
                    if (activeMarkets.length === 0) return null;
                    return (
                      <>
                        <SectionHeader>ACTIVE MARKETS ({activeMarkets.length})</SectionHeader>
                        <div style={{ display: 'grid', gap: '16px', marginBottom: '32px' }}>
                          {activeMarkets.map(market => {
                            const prices = marketPrices[market.address.toLowerCase()];
                            return (
                              <div key={market.id} style={{
                                ...styles.card,
                                borderColor: theme.colors.primary,
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div>
                                    <div style={{ fontWeight: 'bold', fontSize: theme.fontSizes.nav }}>{market.question}</div>
                                    <div style={{ color: theme.colors.textDim, marginTop: '8px', fontSize: theme.fontSizes.xs }}>
                                      Resolution Date: {market.resolution}
                                    </div>
                                    {prices && (
                                      <div style={{ marginTop: '8px', display: 'flex', gap: '16px' }}>
                                        <span style={{ color: theme.colors.primary, fontSize: theme.fontSizes.small }}>
                                          YES: {(prices.yesPrice * 100).toFixed(1)}%
                                        </span>
                                        <span style={{ color: theme.colors.warning, fontSize: theme.fontSizes.small }}>
                                          NO: {(prices.noPrice * 100).toFixed(1)}%
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div
                                    style={{
                                      padding: '4px 12px',
                                      backgroundColor: theme.colors.primaryDark,
                                      border: `1px solid ${theme.colors.primary}`,
                                      color: theme.colors.primary,
                                      fontSize: theme.fontSizes.xs,
                                    }}
                                  >
                                    ACTIVE
                                  </div>
                                </div>
                                <div style={{ marginTop: '12px', fontSize: theme.fontSizes.xs }}>
                                  <div style={{ color: theme.colors.textDim }}>
                                    Contract: <span style={{ color: theme.colors.textWhite }}>{market.address}</span>
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                                    YES: <span style={{ color: theme.colors.primary }}>{market.yesToken.slice(0, 10)}...</span>
                                  </div>
                                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                                    NO: <span style={{ color: theme.colors.warning }}>{market.noToken.slice(0, 10)}...</span>
                                  </div>
                                </div>
                                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                                  <button
                                    onClick={() => {
                                      setTradeParams(prev => ({ ...prev, marketAddress: market.address }));
                                      setActiveTab('trade');
                                    }}
                                    style={{ ...styles.button, flex: 1, padding: '8px', borderColor: theme.colors.primary, color: theme.colors.primary }}
                                  >
                                    TRADE
                                  </button>
                                  {prices?.oracle && address?.toLowerCase() === prices.oracle && (
                                    <button
                                      onClick={() => {
                                        setResolution(prev => ({ ...prev, marketAddress: market.address }));
                                        setActiveTab('resolve');
                                      }}
                                      style={{ ...styles.button, flex: 1, padding: '8px', borderColor: theme.colors.warning, color: theme.colors.warning }}
                                    >
                                      RESOLVE
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}

                  {/* RESOLVED MARKETS */}
                  {(() => {
                    const resolvedMarkets = displayMarkets.filter(m => marketPrices[m.address.toLowerCase()]?.resolved);
                    if (resolvedMarkets.length === 0) return null;
                    return (
                      <>
                        <SectionHeader>RESOLVED MARKETS ({resolvedMarkets.length})</SectionHeader>
                        <div style={{ display: 'grid', gap: '16px' }}>
                          {resolvedMarkets.map(market => {
                            const prices = marketPrices[market.address.toLowerCase()];
                            const winner = prices?.yesWins ? 'YES' : 'NO';
                            return (
                              <div key={market.id} style={{
                                ...styles.card,
                                borderColor: theme.colors.highlight,
                                opacity: 0.8,
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div>
                                    <div style={{ fontWeight: 'bold', fontSize: theme.fontSizes.nav }}>{market.question}</div>
                                    <div style={{ color: theme.colors.textDim, marginTop: '8px', fontSize: theme.fontSizes.xs }}>
                                      Resolution Date: {market.resolution}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      padding: '4px 12px',
                                      backgroundColor: theme.colors.highlightDark,
                                      border: `1px solid ${theme.colors.highlight}`,
                                      color: theme.colors.highlight,
                                      fontSize: theme.fontSizes.xs,
                                    }}
                                  >
                                    {winner} WINS
                                  </div>
                                </div>
                                <div style={{ marginTop: '12px', fontSize: theme.fontSizes.xs }}>
                                  <div style={{ color: theme.colors.textDim }}>
                                    Contract: <span style={{ color: theme.colors.textWhite }}>{market.address}</span>
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                                    YES: <span style={{ color: theme.colors.primary }}>{market.yesToken.slice(0, 10)}...</span>
                                  </div>
                                  <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs }}>
                                    NO: <span style={{ color: theme.colors.warning }}>{market.noToken.slice(0, 10)}...</span>
                                  </div>
                                </div>
                                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                                  <button
                                    onClick={() => {
                                      setTradeParams(prev => ({ ...prev, marketAddress: market.address }));
                                      setActiveTab('trade');
                                    }}
                                    style={{ ...styles.button, flex: 1, padding: '8px', borderColor: theme.colors.highlight, color: theme.colors.highlight }}
                                  >
                                    VIEW / REDEEM
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </main>

        {/* Logs Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>TRANSACTION LOG</div>
          <div style={styles.logsContainer}>
            {logs.length === 0 ? (
              <div style={{ color: theme.colors.border, padding: '16px', textAlign: 'center', fontSize: theme.fontSizes.xs }}>
                Waiting for actions...
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.logEntry,
                    borderLeftColor:
                      log.type === 'success' ? theme.colors.primary :
                      log.type === 'error' ? theme.colors.error :
                      log.type === 'pending' ? theme.colors.highlight : theme.colors.textDim,
                  }}
                >
                  <div style={{ color: theme.colors.textDim }}>{log.timestamp}</div>
                  <div
                    style={{
                      color:
                        log.type === 'success' ? theme.colors.primary :
                        log.type === 'error' ? theme.colors.error :
                        log.type === 'pending' ? theme.colors.highlight : theme.colors.textWhite,
                      marginTop: '4px',
                      wordBreak: 'break-all',
                    }}
                  >
                    {log.msg}
                  </div>
                  {log.txHash && (
                    <a
                      href={`${monadTestnet.blockExplorers.default.url}/tx/${log.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: theme.colors.primary, fontSize: theme.fontSizes.xxs, marginTop: '4px', display: 'block' }}
                    >
                      View TX →
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
          <div style={styles.sidebarFooter}>
            <button onClick={clearLogs} style={styles.clearButton}>
              CLEAR LOGS
            </button>
          </div>
        </aside>
      </div>

      {/* Market Creation Confirmation Modal */}
      {createdMarket && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.colors.modalOverlay,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: theme.colors.pageBg,
            border: `2px solid ${theme.colors.primary}`,
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
          }}>
            <div style={{
              color: theme.colors.primary,
              fontSize: theme.fontSizes.sectionTitle,
              fontWeight: 'bold',
              marginBottom: '8px',
              textAlign: 'center',
            }}>
              {createdMarket.listed ? 'MARKET LISTED!' : 'MARKET CREATED'}
            </div>
            <div style={{
              color: theme.colors.textDim,
              fontSize: theme.fontSizes.small,
              textAlign: 'center',
              marginBottom: '24px',
            }}>
              {createdMarket.listed
                ? 'Your market is now discoverable by other traders and agents'
                : 'List your market so others can discover and trade on it'}
            </div>

            <div style={{
              backgroundColor: theme.colors.black,
              border: `1px solid ${theme.colors.border}`,
              padding: '16px',
              marginBottom: '16px',
            }}>
              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>QUESTION</div>
              <div style={{ color: theme.colors.textWhite, fontSize: theme.fontSizes.nav }}>{createdMarket.question}</div>
            </div>

            <div style={{
              backgroundColor: theme.colors.black,
              border: `1px solid ${theme.colors.border}`,
              padding: '16px',
              marginBottom: '16px',
            }}>
              <div style={{ color: theme.colors.textDim, fontSize: theme.fontSizes.xs, marginBottom: '4px' }}>CONTRACT ADDRESS</div>
              <div style={{
                color: theme.colors.primary,
                fontSize: theme.fontSizes.small,
                wordBreak: 'break-all',
                fontFamily: 'monospace',
              }}>
                {createdMarket.address}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdMarket.address);
                  addLog('Market address copied to clipboard', 'success');
                }}
                style={{
                  ...styles.button,
                  flex: 1,
                  padding: '12px',
                }}
              >
                COPY ADDRESS
              </button>
              <a
                href={`${monadTestnet.blockExplorers.default.url}/address/${createdMarket.address}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...styles.button,
                  flex: 1,
                  padding: '12px',
                  textAlign: 'center',
                  textDecoration: 'none',
                }}
              >
                VIEW ON EXPLORER
              </a>
            </div>

            {createdMarket.txHash && (
              <a
                href={`${monadTestnet.blockExplorers.default.url}/tx/${createdMarket.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  color: theme.colors.textDim,
                  fontSize: theme.fontSizes.xs,
                  textAlign: 'center',
                  marginBottom: '16px',
                }}
              >
                View creation transaction →
              </a>
            )}

            {/* x402 Listing Section */}
            {!createdMarket.listed ? (
              <div style={{
                backgroundColor: theme.colors.highlightDark,
                border: `2px solid ${theme.colors.highlight}`,
                padding: '16px',
                marginBottom: '16px',
              }}>
                <div style={{ color: theme.colors.highlight, fontSize: theme.fontSizes.nav, fontWeight: 'bold', marginBottom: '8px' }}>
                  LIST FOR DISCOVERY
                </div>
                <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.small, marginBottom: '12px' }}>
                  Pay 0.10 USDC to list your market so other traders and AI agents can find it.
                </div>
                {createdMarket.listingError && (
                  <div style={{ color: theme.colors.warning, fontSize: theme.fontSizes.xs, marginBottom: '8px' }}>
                    {createdMarket.listingError}
                  </div>
                )}
                <button
                  onClick={async () => {
                    if (!createdMarket || !address) return;
                    try {
                      await listMarket({
                        address: createdMarket.address,
                        question: createdMarket.question,
                        resolutionTime: createdMarket.resolutionTime || Math.floor(Date.now() / 1000) + 86400 * 30,
                        oracle: address,
                        yesTokenAddress: createdMarket.yesToken,
                        noTokenAddress: createdMarket.noToken,
                        category: 'general',
                        tags: [],
                      });
                      setCreatedMarket(prev => prev ? { ...prev, listed: true, listingError: undefined } : null);
                      addLog('Market listed successfully via x402!', 'success');
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Listing failed';
                      setCreatedMarket(prev => prev ? { ...prev, listingError: msg } : null);
                      addLog(`Listing failed: ${msg}`, 'error');
                    }
                  }}
                  disabled={isListing || !x402Ready}
                  style={{
                    ...styles.button,
                    width: '100%',
                    padding: '14px',
                    backgroundColor: isListing ? theme.colors.border : theme.colors.highlight,
                    color: theme.colors.black,
                    fontWeight: 'bold',
                    cursor: isListing || !x402Ready ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isListing ? 'PROCESSING PAYMENT...' : 'LIST MARKET (0.10 USDC)'}
                </button>
              </div>
            ) : (
              <div style={{
                backgroundColor: theme.colors.primaryDark,
                border: `2px solid ${theme.colors.primary}`,
                padding: '16px',
                marginBottom: '16px',
                textAlign: 'center',
              }}>
                <div style={{ color: theme.colors.primary, fontSize: theme.fontSizes.nav }}>
                  ✓ Listed for discovery
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={() => {
                  setCreatedMarket(null);
                  setActiveTab('trade');
                }}
                style={{
                  ...styles.button,
                  padding: '16px',
                  backgroundColor: theme.colors.primaryDark,
                }}
              >
                START TRADING
              </button>
              <button
                onClick={() => setCreatedMarket(null)}
                style={{
                  ...styles.button,
                  padding: '16px',
                  borderColor: theme.colors.textDim,
                  color: theme.colors.textDim,
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: theme.colors.pageBg,
    color: theme.colors.primary,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSizes.body,
  },
  header: {
    borderBottom: `3px solid ${theme.colors.primary}`,
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.black,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logo: {
    fontSize: theme.fontSizes.sectionTitle,
    fontWeight: 'bold',
    letterSpacing: '4px',
    textTransform: 'uppercase',
  },
  badge: {
    padding: '4px 12px',
    border: `2px solid ${theme.colors.primary}`,
    fontSize: theme.fontSizes.xs,
    letterSpacing: '2px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  networkBadge: {
    padding: '4px 12px',
    backgroundColor: theme.colors.cardBgLight,
    border: `1px solid ${theme.colors.border}`,
    fontSize: theme.fontSizes.xs,
  },
  walletBadge: {
    padding: '4px 12px',
    backgroundColor: theme.colors.primaryDark,
    border: `1px solid ${theme.colors.primary}`,
  },
  nav: {
    display: 'flex',
    borderBottom: `2px solid ${theme.colors.border}`,
    backgroundColor: theme.colors.inputBg,
  },
  navButton: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    color: theme.colors.primary,
    border: 'none',
    borderRight: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: theme.fontSizes.small,
    fontWeight: 'bold',
    letterSpacing: '2px',
    transition: 'all 0.1s',
  },
  mainContainer: {
    display: 'flex',
    height: 'calc(100vh - 120px)',
  },
  main: {
    flex: 1,
    padding: '24px',
    overflowY: 'auto',
  },
  card: {
    padding: '20px',
    backgroundColor: theme.colors.cardBg,
    border: `1px solid ${theme.colors.border}`,
  },
  button: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    border: `2px solid ${theme.colors.primary}`,
    color: theme.colors.primary,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSizes.small,
    fontWeight: 'bold',
    letterSpacing: '1px',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  sidebar: {
    width: '320px',
    borderLeft: `2px solid ${theme.colors.border}`,
    backgroundColor: theme.colors.sidebarBg,
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHeader: {
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.colors.border}`,
    fontWeight: 'bold',
    letterSpacing: '2px',
    fontSize: theme.fontSizes.xs,
  },
  logsContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  logEntry: {
    padding: '8px',
    marginBottom: '4px',
    backgroundColor: theme.colors.pageBg,
    borderLeft: `3px solid ${theme.colors.textDim}`,
    fontSize: theme.fontSizes.xs,
  },
  sidebarFooter: {
    padding: '8px',
    borderTop: `1px solid ${theme.colors.border}`,
  },
  clearButton: {
    width: '100%',
    padding: '8px',
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.textDim,
    fontFamily: 'inherit',
    fontSize: theme.fontSizes.xxs,
    cursor: 'pointer',
  },
};

// Components
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: theme.fontSizes.title,
        fontWeight: 'bold',
        letterSpacing: '4px',
        paddingBottom: '12px',
        borderBottom: `2px solid ${theme.colors.primary}`,
        marginBottom: '24px',
      }}
    >
      {children}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: string;
}) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label
        style={{
          display: 'block',
          color: theme.colors.textDim,
          fontSize: theme.fontSizes.xs,
          marginBottom: '8px',
          letterSpacing: '1px',
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        style={{
          width: '100%',
          padding: '10px 12px',
          backgroundColor: theme.colors.pageBg,
          border: `1px solid ${theme.colors.border}`,
          color: theme.colors.primary,
          fontFamily: theme.fonts.mono,
          fontSize: theme.fontSizes.body,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueColor = theme.colors.textWhite,
  mono,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: `1px solid ${theme.colors.borderDim}`,
      }}
    >
      <span style={{ color: theme.colors.textDim }}>{label}</span>
      <span
        style={{
          color: valueColor,
          fontFamily: mono ? 'monospace' : 'inherit',
          wordBreak: 'break-all',
          textAlign: 'right',
          maxWidth: '60%',
        }}
      >
        {value}
      </span>
    </div>
  );
}
