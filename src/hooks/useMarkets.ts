// Markets Hook - Supabase integration
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Address } from 'viem';

// Old factory markets with broken costFunction (always returns constant → 50/50 prices)
// These are excluded from display since they can never have correct pricing
const BROKEN_MARKET_ADDRESSES = new Set([
  '0x3f9498ef0a9cc5a88678d4d4a900ec16875a1f9f',
  '0x6e2f4b22042c7807a07af0801a7076d2c9f7854f',
  '0x15e9094b5db262d09439fba90ef27039c6c62900',
]);

// Market type (simplified for runtime use)
interface Market {
  id: string;
  address: string;
  question: string;
  yes_token_address: string;
  no_token_address: string;
  oracle_address: string;
  creator_address: string;
  protocol_fee_recipient: string | null;
  resolution_time: string;
  alpha: string | null;
  min_liquidity: string | null;
  yes_price: string;
  no_price: string;
  yes_shares: string;
  no_shares: string;
  total_collateral: string;
  liquidity_parameter: string | null;
  status: 'ACTIVE' | 'RESOLVED' | 'PAUSED';
  resolved: boolean;
  yes_wins: boolean | null;
  total_volume: string;
  total_trades: number;
  unique_traders: number;
  category: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  creation_tx_hash: string | null;
}

interface UseMarketsOptions {
  status?: 'ACTIVE' | 'RESOLVED' | 'PAUSED' | 'all';
  category?: string;
  creator?: string;
  orderBy?: 'created_at' | 'total_volume' | 'resolution_time';
  orderDirection?: 'asc' | 'desc';
  limit?: number;
}

interface MarketWithMeta extends Market {
  // Additional computed fields
  timeUntilResolution?: number;
  isResolvable?: boolean;
}

export function useMarkets(options: UseMarketsOptions = {}) {
  const {
    status = 'all',
    category,
    creator,
    orderBy = 'created_at',
    orderDirection = 'desc',
    limit = 50,
  } = options;

  const [markets, setMarkets] = useState<MarketWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Fetch markets
  const fetchMarkets = useCallback(async () => {
    // Only show loading on initial fetch, not on polling refetches
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }
    setError(null);

    try {
      let query = supabase.from('markets').select('*');

      // Apply filters
      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (category) {
        query = query.eq('category', category);
      }

      if (creator) {
        query = query.ilike('creator_address', creator);
      }

      // Apply ordering
      query = query.order(orderBy, { ascending: orderDirection === 'asc' });

      // Apply limit
      query = query.limit(limit);

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Filter out old broken factory markets
      const now = Date.now();
      const rawMarkets = ((data || []) as Market[]).filter(
        m => !BROKEN_MARKET_ADDRESSES.has(m.address.toLowerCase())
      );
      const marketsWithMeta: MarketWithMeta[] = rawMarkets.map(market => ({
        ...market,
        timeUntilResolution: new Date(market.resolution_time).getTime() - now,
        isResolvable:
          !market.resolved && new Date(market.resolution_time).getTime() <= now,
      }));

      setMarkets(marketsWithMeta);
      hasLoadedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
    } finally {
      setIsLoading(false);
    }
  }, [status, category, creator, orderBy, orderDirection, limit]);

  // Initial fetch + Realtime subscription + 5-min fallback poll
  useEffect(() => {
    fetchMarkets();

    // Subscribe to Realtime changes on markets table
    const channel = supabase
      .channel('markets-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        () => {
          fetchMarkets();
        }
      )
      .subscribe();

    // 5-minute fallback poll as safety net
    const interval = setInterval(fetchMarkets, 300_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchMarkets]);

  // Get single market by address
  const getMarketByAddress = useCallback(
    async (address: Address): Promise<Market | null> => {
      try {
        const { data, error } = await supabase
          .from('markets')
          .select('*')
          .ilike('address', address)
          .single();

        if (error) throw error;
        return data as Market | null;
      } catch (err) {
        console.error('Failed to get market:', err);
        return null;
      }
    },
    []
  );

  // Create/update market in Supabase (called after on-chain creation)
  const upsertMarket = useCallback(
    async (marketData: {
      address: string;
      question: string;
      yesToken: string;
      noToken: string;
      oracle: string;
      creator: string;
      resolutionTime: Date;
      txHash?: string;
      alpha?: string;
      minLiquidity?: string;
      protocolFeeRecipient?: string;
    }): Promise<boolean> => {
      try {
        const { error } = await supabase.from('markets').upsert(
          {
            address: marketData.address.toLowerCase(),
            question: marketData.question,
            yes_token_address: marketData.yesToken.toLowerCase(),
            no_token_address: marketData.noToken.toLowerCase(),
            oracle_address: marketData.oracle.toLowerCase(),
            creator_address: marketData.creator.toLowerCase(),
            protocol_fee_recipient: marketData.protocolFeeRecipient?.toLowerCase(),
            resolution_time: marketData.resolutionTime.toISOString(),
            alpha: marketData.alpha,
            min_liquidity: marketData.minLiquidity,
            creation_tx_hash: marketData.txHash,
          } as Record<string, unknown>,
          { onConflict: 'address' }
        );

        if (error) throw error;

        // Refresh markets
        await fetchMarkets();
        return true;
      } catch (err) {
        console.error('Failed to upsert market:', JSON.stringify(err, null, 2));
        if (err && typeof err === 'object' && 'code' in err) {
          const e = err as { code?: string; message?: string; details?: string };
          console.error('Error code:', e.code, 'Message:', e.message, 'Details:', e.details);
        }
        return false;
      }
    },
    [fetchMarkets]
  );

  // Update market prices (called after price fetch from chain)
  const updateMarketPrices = useCallback(
    async (
      address: string,
      prices: {
        yesPrice: string;
        noPrice: string;
        yesShares: string;
        noShares: string;
        totalCollateral: string;
        liquidityParameter?: string;
        resolved?: boolean;
        yesWins?: boolean;
      }
    ): Promise<boolean> => {
      try {
        const update: Record<string, unknown> = {
          yes_price: prices.yesPrice,
          no_price: prices.noPrice,
          yes_shares: prices.yesShares,
          no_shares: prices.noShares,
          total_collateral: prices.totalCollateral,
        };

        if (prices.liquidityParameter) {
          update.liquidity_parameter = prices.liquidityParameter;
        }

        if (prices.resolved !== undefined) {
          update.resolved = prices.resolved;
          if (prices.resolved) {
            update.status = 'RESOLVED';
            update.resolved_at = new Date().toISOString();
          }
        }

        if (prices.yesWins !== undefined) {
          update.yes_wins = prices.yesWins;
        }

        const { error } = await supabase
          .from('markets')
          .update(update)
          .ilike('address', address);

        if (error) throw error;

        // Update local state
        setMarkets(prev =>
          prev.map(m =>
            m.address.toLowerCase() === address.toLowerCase()
              ? { ...m, ...(update as Partial<MarketWithMeta>) }
              : m
          )
        );

        return true;
      } catch (err) {
        console.error('Failed to update market prices:', err);
        return false;
      }
    },
    []
  );

  // Search markets by question
  const searchMarkets = useCallback(
    async (query: string): Promise<Market[]> => {
      try {
        const { data, error } = await supabase
          .from('markets')
          .select('*')
          .ilike('question', `%${query}%`)
          .order('total_volume', { ascending: false })
          .limit(20);

        if (error) throw error;
        return (data || []) as Market[];
      } catch (err) {
        console.error('Failed to search markets:', err);
        return [];
      }
    },
    []
  );

  // Get top markets by volume
  const getTopMarkets = useCallback(async (count = 10): Promise<Market[]> => {
    try {
      const { data, error } = await supabase
        .from('markets')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('total_volume', { ascending: false })
        .limit(count);

      if (error) throw error;
      return (data || []) as Market[];
    } catch (err) {
      console.error('Failed to get top markets:', err);
      return [];
    }
  }, []);

  return {
    markets,
    isLoading,
    error,
    refetch: fetchMarkets,
    getMarketByAddress,
    upsertMarket,
    updateMarketPrices,
    searchMarkets,
    getTopMarkets,
  };
}

export default useMarkets;
