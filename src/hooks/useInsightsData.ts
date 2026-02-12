import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface PlatformOverview {
  totalMarkets: number;
  activeMarkets: number;
  resolvedMarkets: number;
  totalVolume: number;
  totalTrades: number;
  tvl: number;
  totalUsers: number;
}

export interface RecentTrade {
  id: string;
  trade_type: string;
  outcome: string;
  shares: string;
  amount: string;
  tx_hash: string;
  created_at: string;
  market_address: string;
  market_question: string;
  wallet_address: string;
  display_name: string | null;
}

export interface LeaderboardEntry {
  id: string;
  wallet_address: string;
  display_name: string | null;
  avatar_url: string | null;
  total_trades: number;
  total_volume: number;
  total_pnl: number;
  markets_traded: number;
}

export interface IndexerHealth {
  last_indexed_block: number;
  last_indexed_at: string;
  is_syncing: boolean;
  last_error: string | null;
  consecutive_errors: number;
}

export interface NewMarket {
  id: string;
  address: string;
  question: string;
  creator_address: string;
  status: string;
  yes_price: number;
  no_price: number;
  total_volume: number;
  total_trades: number;
  resolution_time: string;
  created_at: string;
}

export interface X402Heartbeat {
  totalCalls: number;
  lastCallAt: string | null;
  lastEndpoint: string | null;
  pulsing: boolean;
}

export interface InsightsData {
  overview: PlatformOverview;
  recentTrades: RecentTrade[];
  newMarkets: NewMarket[];
  leaderboard: LeaderboardEntry[];
  indexerHealth: IndexerHealth | null;
  x402Heartbeat: X402Heartbeat;
  isLoading: boolean;
  error: string | null;
}

export function useInsightsData(): InsightsData {
  const [overview, setOverview] = useState<PlatformOverview>({
    totalMarkets: 0,
    activeMarkets: 0,
    resolvedMarkets: 0,
    totalVolume: 0,
    totalTrades: 0,
    tvl: 0,
    totalUsers: 0,
  });
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [newMarkets, setNewMarkets] = useState<NewMarket[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [indexerHealth, setIndexerHealth] = useState<IndexerHealth | null>(null);
  const [x402Heartbeat, setX402Heartbeat] = useState<X402Heartbeat>({
    totalCalls: 0,
    lastCallAt: null,
    lastEndpoint: null,
    pulsing: false,
  });
  const lastX402CountRef = useRef<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const { data: markets, error: mErr } = await supabase
        .from('markets')
        .select('status, total_volume, total_trades, total_collateral');
      if (mErr) throw mErr;

      const { count: userCount, error: uErr } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true });
      if (uErr) throw uErr;

      const totalMarkets = markets?.length || 0;
      const activeMarkets = markets?.filter(m => m.status === 'ACTIVE').length || 0;
      const resolvedMarkets = markets?.filter(m => m.status === 'RESOLVED').length || 0;
      const totalVolume = markets?.reduce((sum, m) => sum + Number(m.total_volume || 0), 0) || 0;
      const totalTrades = markets?.reduce((sum, m) => sum + Number(m.total_trades || 0), 0) || 0;
      const tvl = markets?.filter(m => m.status === 'ACTIVE')
        .reduce((sum, m) => sum + Number(m.total_collateral || 0), 0) || 0;

      setOverview({
        totalMarkets,
        activeMarkets,
        resolvedMarkets,
        totalVolume,
        totalTrades,
        tvl,
        totalUsers: userCount || 0,
      });
    } catch (err) {
      console.error('Failed to fetch overview:', err);
    }
  }, []);

  const fetchRecentTrades = useCallback(async () => {
    try {
      const { data, error: tErr } = await supabase
        .from('trades')
        .select(`
          id, trade_type, outcome, shares, amount, tx_hash, created_at,
          markets:market_id (address, question),
          users:user_id (wallet_address, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(20);
      if (tErr) throw tErr;

      const trades: RecentTrade[] = (data || []).map((t: any) => ({
        id: t.id,
        trade_type: t.trade_type,
        outcome: t.outcome,
        shares: String(t.shares),
        amount: String(t.amount),
        tx_hash: t.tx_hash,
        created_at: t.created_at,
        market_address: t.markets?.address || '',
        market_question: t.markets?.question || '',
        wallet_address: t.users?.wallet_address || '',
        display_name: t.users?.display_name || null,
      }));

      setRecentTrades(trades);
    } catch (err) {
      console.error('Failed to fetch recent trades:', err);
    }
  }, []);

  const fetchNewMarkets = useCallback(async () => {
    try {
      const { data, error: mErr } = await supabase
        .from('markets')
        .select('id, address, question, creator_address, status, yes_price, no_price, total_volume, total_trades, resolution_time, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (mErr) throw mErr;

      setNewMarkets(
        (data || []).map((m: any) => ({
          id: m.id,
          address: m.address,
          question: m.question,
          creator_address: m.creator_address,
          status: m.status,
          yes_price: Number(m.yes_price || 0.5),
          no_price: Number(m.no_price || 0.5),
          total_volume: Number(m.total_volume || 0),
          total_trades: Number(m.total_trades || 0),
          resolution_time: m.resolution_time,
          created_at: m.created_at,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch new markets:', err);
    }
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data, error: lErr } = await supabase
        .from('leaderboard')
        .select('*')
        .order('total_volume', { ascending: false })
        .limit(10);
      if (lErr) throw lErr;

      setLeaderboard(
        (data || []).map((entry: any) => ({
          id: entry.id,
          wallet_address: entry.wallet_address,
          display_name: entry.display_name || null,
          avatar_url: entry.avatar_url || null,
          total_trades: Number(entry.total_trades || 0),
          total_volume: Number(entry.total_volume || 0),
          total_pnl: Number(entry.total_pnl || 0),
          markets_traded: Number(entry.markets_traded || 0),
        }))
      );
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    }
  }, []);

  const fetchIndexerHealth = useCallback(async () => {
    try {
      const { data, error: iErr } = await supabase
        .from('indexer_state')
        .select('last_indexed_block, last_indexed_at, is_syncing, last_error, consecutive_errors')
        .eq('chain_id', 10143)
        .single();
      if (iErr) throw iErr;

      setIndexerHealth(data as IndexerHealth);
    } catch (err) {
      console.error('Failed to fetch indexer health:', err);
    }
  }, []);

  const fetchX402Heartbeat = useCallback(async () => {
    try {
      // Get total count
      const { count, error: cErr } = await supabase
        .from('x402_payments')
        .select('id', { count: 'exact', head: true });
      if (cErr) throw cErr;

      // Get most recent call
      const { data: latest, error: lErr } = await supabase
        .from('x402_payments')
        .select('created_at, endpoint')
        .order('created_at', { ascending: false })
        .limit(1);
      if (lErr) throw lErr;

      const newCount = count || 0;
      const isNew = lastX402CountRef.current > 0 && newCount > lastX402CountRef.current;
      lastX402CountRef.current = newCount;

      setX402Heartbeat(prev => ({
        totalCalls: newCount,
        lastCallAt: latest?.[0]?.created_at || prev.lastCallAt,
        lastEndpoint: latest?.[0]?.endpoint || prev.lastEndpoint,
        pulsing: isNew,
      }));

      // Clear pulse after animation
      if (isNew) {
        setTimeout(() => setX402Heartbeat(prev => ({ ...prev, pulsing: false })), 1500);
      }
    } catch (err) {
      console.error('Failed to fetch x402 heartbeat:', err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchOverview(),
          fetchRecentTrades(),
          fetchNewMarkets(),
          fetchLeaderboard(),
          fetchIndexerHealth(),
          fetchX402Heartbeat(),
        ]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load insights');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchAll();

    // Realtime: trades INSERT → refresh trades + overview
    const tradesChannel = supabase
      .channel('insights-trades')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trades' },
        () => {
          fetchRecentTrades();
          fetchOverview();
        }
      )
      .subscribe();

    // Realtime: markets UPDATE → refresh overview
    const marketsChannel = supabase
      .channel('insights-markets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        () => {
          fetchOverview();
          fetchNewMarkets();
        }
      )
      .subscribe();

    // Realtime: x402_payments INSERT → pulse heartbeat
    const x402Channel = supabase
      .channel('insights-x402')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'x402_payments' },
        (payload) => {
          const row = payload.new as any;
          lastX402CountRef.current += 1;
          setX402Heartbeat({
            totalCalls: lastX402CountRef.current,
            lastCallAt: row.created_at || new Date().toISOString(),
            lastEndpoint: row.endpoint || null,
            pulsing: true,
          });
          setTimeout(() => setX402Heartbeat(prev => ({ ...prev, pulsing: false })), 1500);
        }
      )
      .subscribe();

    // 5-minute fallback poll for all data
    const interval = setInterval(() => {
      fetchOverview();
      fetchRecentTrades();
      fetchNewMarkets();
      fetchLeaderboard();
      fetchIndexerHealth();
    }, 300_000);

    return () => {
      cancelled = true;
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(marketsChannel);
      supabase.removeChannel(x402Channel);
      clearInterval(interval);
    };
  }, [fetchOverview, fetchRecentTrades, fetchNewMarkets, fetchLeaderboard, fetchIndexerHealth, fetchX402Heartbeat]);

  return { overview, recentTrades, newMarkets, leaderboard, indexerHealth, x402Heartbeat, isLoading, error };
}
