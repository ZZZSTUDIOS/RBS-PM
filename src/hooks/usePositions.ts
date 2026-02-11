// Positions Hook - User portfolio from Supabase
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Trade type (simplified for runtime use)
interface Trade {
  id: string;
  market_id: string;
  user_id: string;
  trade_type: 'BUY' | 'SELL' | 'REDEEM';
  outcome: 'YES' | 'NO';
  shares: string;
  amount: string;
  price_at_trade: string | null;
  trading_fee: string;
  tx_hash: string;
  block_number: number | null;
  block_timestamp: string | null;
  created_at: string;
  // Joined from markets table
  market_address?: string;
  market_question?: string;
}

interface PortfolioPosition {
  marketId: string;
  marketAddress: string;
  marketQuestion: string;
  yesShares: number;
  noShares: number;
  yesCostBasis: number;
  noCostBasis: number;
  realizedPnl: number;
  currentYesPrice: number;
  currentNoPrice: number;
  unrealizedPnl: number;
  marketResolved: boolean;
  marketYesWins: boolean | null;
}

interface PortfolioStats {
  totalPositions: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  totalTrades: number;
  totalVolume: number;
}

export function usePositions(userId?: string) {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<PortfolioStats>({
    totalPositions: 0,
    totalRealizedPnl: 0,
    totalUnrealizedPnl: 0,
    totalPnl: 0,
    totalTrades: 0,
    totalVolume: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch portfolio using database function
  const fetchPortfolio = useCallback(async () => {
    if (!userId) {
      setPositions([]);
      setStats({
        totalPositions: 0,
        totalRealizedPnl: 0,
        totalUnrealizedPnl: 0,
        totalPnl: 0,
        totalTrades: 0,
        totalVolume: 0,
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Fetching portfolio for userId:', userId);
      const { data, error: fetchError } = await supabase.rpc('get_user_portfolio', {
        p_user_id: userId,
      } as Record<string, unknown>);

      console.log('Portfolio response:', { data, error: fetchError });

      if (fetchError) throw fetchError;

      // Transform data
      const rawData = data as Array<Record<string, unknown>> | null;
      const portfolioPositions: PortfolioPosition[] = (rawData || []).map((p) => ({
        marketId: String(p.market_id || ''),
        marketAddress: String(p.market_address || ''),
        marketQuestion: String(p.market_question || ''),
        yesShares: parseFloat(String(p.yes_shares || '0')),
        noShares: parseFloat(String(p.no_shares || '0')),
        yesCostBasis: parseFloat(String(p.yes_cost_basis || '0')),
        noCostBasis: parseFloat(String(p.no_cost_basis || '0')),
        realizedPnl: parseFloat(String(p.realized_pnl || '0')),
        currentYesPrice: parseFloat(String(p.current_yes_price || '0')),
        currentNoPrice: parseFloat(String(p.current_no_price || '0')),
        unrealizedPnl: parseFloat(String(p.unrealized_pnl || '0')),
        marketResolved: Boolean(p.market_resolved),
        marketYesWins: p.market_yes_wins as boolean | null,
      }));

      setPositions(portfolioPositions);

      // Calculate stats
      const totalRealizedPnl = portfolioPositions.reduce((sum, p) => sum + p.realizedPnl, 0);
      const totalUnrealizedPnl = portfolioPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

      setStats(prev => ({
        ...prev,
        totalPositions: portfolioPositions.length,
        totalRealizedPnl,
        totalUnrealizedPnl,
        totalPnl: totalRealizedPnl + totalUnrealizedPnl,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch portfolio');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Fetch trade history with market info
  const fetchTrades = useCallback(
    async (limit = 100) => {
      if (!userId) {
        setTrades([]);
        return;
      }

      try {
        console.log('Fetching trades for userId:', userId);
        // Join with markets table to get market address and question
        const { data, error } = await supabase
          .from('trades')
          .select(`
            *,
            markets:market_id (
              address,
              question
            )
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        console.log('Trades response:', { data, error });

        if (error) throw error;

        // Transform data to include market info
        const tradesData: Trade[] = (data || []).map((t: Record<string, unknown>) => {
          const market = t.markets as { address: string; question: string } | null;
          return {
            id: String(t.id),
            market_id: String(t.market_id),
            user_id: String(t.user_id),
            trade_type: t.trade_type as 'BUY' | 'SELL' | 'REDEEM',
            outcome: t.outcome as 'YES' | 'NO',
            shares: String(t.shares),
            amount: String(t.amount),
            price_at_trade: t.price_at_trade ? String(t.price_at_trade) : null,
            trading_fee: String(t.trading_fee || '0'),
            tx_hash: String(t.tx_hash),
            block_number: t.block_number as number | null,
            block_timestamp: t.block_timestamp as string | null,
            created_at: String(t.created_at),
            market_address: market?.address,
            market_question: market?.question,
          };
        });

        setTrades(tradesData);

        // Update stats
        const totalTrades = tradesData.length;
        const totalVolume = tradesData.reduce(
          (sum: number, t: Trade) => sum + parseFloat(t.amount),
          0
        );

        setStats(prev => ({
          ...prev,
          totalTrades,
          totalVolume,
        }));
      } catch (err) {
        console.error('Failed to fetch trades:', err);
      }
    },
    [userId]
  );

  // Initial fetch
  useEffect(() => {
    fetchPortfolio();
    fetchTrades();
  }, [fetchPortfolio, fetchTrades]);

  // Get position for a specific market
  const getPositionForMarket = useCallback(
    (marketAddress: string): PortfolioPosition | null => {
      return (
        positions.find(
          p => p.marketAddress.toLowerCase() === marketAddress.toLowerCase()
        ) || null
      );
    },
    [positions]
  );

  // Get trades for a specific market
  const getTradesForMarket = useCallback(
    (marketId: string): Trade[] => {
      return trades.filter(t => t.market_id === marketId);
    },
    [trades]
  );

  // Record a new trade (local tracking before indexer picks it up)
  const recordTrade = useCallback(
    async (trade: {
      marketId: string;
      tradeType: 'BUY' | 'SELL' | 'REDEEM';
      outcome: 'YES' | 'NO';
      shares: string;
      amount: string;
      txHash: string;
      priceAtTrade?: string;
    }): Promise<boolean> => {
      if (!userId) return false;

      try {
        const { error } = await supabase.from('trades').insert({
          market_id: trade.marketId,
          user_id: userId,
          trade_type: trade.tradeType,
          outcome: trade.outcome,
          shares: trade.shares,
          amount: trade.amount,
          tx_hash: trade.txHash,
          price_at_trade: trade.priceAtTrade,
        } as Record<string, unknown>);

        if (error) throw error;

        // Refresh trades
        await fetchTrades();
        await fetchPortfolio();

        return true;
      } catch (err) {
        console.error('Failed to record trade:', err);
        return false;
      }
    },
    [userId, fetchTrades, fetchPortfolio]
  );

  return {
    positions,
    trades,
    stats,
    isLoading,
    error,
    refetch: fetchPortfolio,
    refetchTrades: fetchTrades,
    getPositionForMarket,
    getTradesForMarket,
    recordTrade,
  };
}

// Public trade type for market activity feed
export interface MarketTrade {
  id: string;
  trade_type: 'BUY' | 'SELL' | 'REDEEM';
  outcome: 'YES' | 'NO';
  shares: string;
  amount: string;
  tx_hash: string;
  created_at: string;
}

// Hook to fetch recent trades for a list of market addresses (all users, not filtered)
export function useMarketTrades(marketAddresses: string[]) {
  const [tradesByMarket, setTradesByMarket] = useState<Record<string, MarketTrade[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  const addressesKey = marketAddresses.map(a => a.toLowerCase()).sort().join(',');

  useEffect(() => {
    if (marketAddresses.length === 0) {
      setTradesByMarket({});
      return;
    }

    let cancelled = false;

    const fetchTrades = async () => {
      setIsLoading(true);
      try {
        // Query trades joined with markets, filtered by market addresses
        const lowerAddresses = marketAddresses.map(a => a.toLowerCase());

        const { data, error } = await supabase
          .from('trades')
          .select(`
            id, trade_type, outcome, shares, amount, tx_hash, created_at,
            markets:market_id (
              address
            )
          `)
          .order('created_at', { ascending: false })
          .limit(marketAddresses.length * 5);

        if (error) throw error;
        if (cancelled) return;

        // Group by market address, keeping only 5 per market
        const grouped: Record<string, MarketTrade[]> = {};
        for (const addr of lowerAddresses) {
          grouped[addr] = [];
        }

        for (const t of (data || []) as Array<Record<string, unknown>>) {
          const market = t.markets as { address: string } | null;
          if (!market) continue;
          const addr = market.address.toLowerCase();
          if (!grouped[addr]) continue;
          if (grouped[addr].length >= 5) continue;
          grouped[addr].push({
            id: String(t.id),
            trade_type: t.trade_type as 'BUY' | 'SELL' | 'REDEEM',
            outcome: t.outcome as 'YES' | 'NO',
            shares: String(t.shares),
            amount: String(t.amount),
            tx_hash: String(t.tx_hash),
            created_at: String(t.created_at),
          });
        }

        setTradesByMarket(grouped);
      } catch (err) {
        console.error('Failed to fetch market trades:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTrades();

    // Subscribe to Realtime changes on trades table
    const channel = supabase
      .channel('trades-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades' },
        () => { fetchTrades(); }
      )
      .subscribe();

    // 5-minute fallback poll as safety net
    const interval = setInterval(fetchTrades, 300_000);

    return () => { cancelled = true; supabase.removeChannel(channel); clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesKey]);

  return { tradesByMarket, isLoading };
}

export default usePositions;
