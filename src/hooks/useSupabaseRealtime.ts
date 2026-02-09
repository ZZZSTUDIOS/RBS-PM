// Real-time Subscriptions Hook
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Local types (simplified for runtime use)
interface Market {
  id: string;
  address: string;
  [key: string]: unknown;
}

interface Trade {
  id: string;
  market_id: string;
  [key: string]: unknown;
}

interface Position {
  id: string;
  market_id: string;
  user_id: string;
  [key: string]: unknown;
}

// Hook for subscribing to market updates
export function useMarketRealtime(
  marketAddress?: string,
  onUpdate?: (market: Market) => void
) {
  const [market, setMarket] = useState<Market | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!marketAddress) return;

    const channel = supabase
      .channel(`market-${marketAddress}`)
      .on(
        'postgres_changes' as 'system',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'markets',
          filter: `address=ilike.${marketAddress}`,
        } as unknown as { event: 'system' },
        (payload: RealtimePostgresChangesPayload<Market>) => {
          if (payload.new) {
            const newMarket = payload.new as Market;
            setMarket(newMarket);
            onUpdate?.(newMarket);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [marketAddress, onUpdate]);

  return { market };
}

// Hook for subscribing to all market updates
export function useMarketsRealtime(onUpdate?: (markets: Market[]) => void) {
  const [markets, setMarkets] = useState<Map<string, Market>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('all-markets')
      .on(
        'postgres_changes' as 'system',
        {
          event: '*',
          schema: 'public',
          table: 'markets',
        } as unknown as { event: 'system' },
        (payload: RealtimePostgresChangesPayload<Market>) => {
          setMarkets(prev => {
            const next = new Map(prev);
            if (payload.eventType === 'DELETE' && payload.old) {
              next.delete((payload.old as Market).address || '');
            } else if (payload.new) {
              const newMarket = payload.new as Market;
              next.set(newMarket.address, newMarket);
            }
            onUpdate?.(Array.from(next.values()));
            return next;
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [onUpdate]);

  return { markets: Array.from(markets.values()) };
}

// Hook for subscribing to trade updates
export function useTradesRealtime(
  filter?: { marketId?: string; userId?: string },
  onNewTrade?: (trade: Trade) => void
) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let filterString = '';
    if (filter?.marketId) {
      filterString = `market_id=eq.${filter.marketId}`;
    } else if (filter?.userId) {
      filterString = `user_id=eq.${filter.userId}`;
    }

    const channelName = filter?.marketId
      ? `trades-market-${filter.marketId}`
      : filter?.userId
      ? `trades-user-${filter.userId}`
      : 'all-trades';

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as 'system',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          ...(filterString ? { filter: filterString } : {}),
        } as unknown as { event: 'system' },
        (payload: RealtimePostgresChangesPayload<Trade>) => {
          if (payload.new) {
            const newTrade = payload.new as Trade;
            setTrades(prev => [newTrade, ...prev].slice(0, 100));
            onNewTrade?.(newTrade);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [filter?.marketId, filter?.userId, onNewTrade]);

  return { trades };
}

// Hook for subscribing to position updates
export function usePositionsRealtime(
  userId?: string,
  onUpdate?: (position: Position) => void
) {
  const [positions, setPositions] = useState<Map<string, Position>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`positions-${userId}`)
      .on(
        'postgres_changes' as 'system',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
          filter: `user_id=eq.${userId}`,
        } as unknown as { event: 'system' },
        (payload: RealtimePostgresChangesPayload<Position>) => {
          setPositions(prev => {
            const next = new Map(prev);
            if (payload.eventType === 'DELETE' && payload.old) {
              next.delete((payload.old as Position).market_id || '');
            } else if (payload.new) {
              const newPosition = payload.new as Position;
              next.set(newPosition.market_id, newPosition);
              onUpdate?.(newPosition);
            }
            return next;
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [userId, onUpdate]);

  return { positions: Array.from(positions.values()) };
}

// Generic hook for custom realtime subscriptions
export function useRealtimeSubscription<T extends Record<string, unknown>>(
  table: string,
  options: {
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    filter?: string;
    onInsert?: (data: T) => void;
    onUpdate?: (data: T, old: Partial<T>) => void;
    onDelete?: (old: Partial<T>) => void;
  } = {}
) {
  const [data, setData] = useState<T[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const { event = '*', filter, onInsert, onUpdate, onDelete } = options;

  useEffect(() => {
    const channelName = `${table}-${filter || 'all'}-${Date.now()}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as 'system',
        {
          event,
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        } as unknown as { event: 'system' },
        (payload: RealtimePostgresChangesPayload<T>) => {
          switch (payload.eventType) {
            case 'INSERT':
              if (payload.new) {
                const newData = payload.new as T;
                setData(prev => [newData, ...prev]);
                onInsert?.(newData);
              }
              break;
            case 'UPDATE':
              if (payload.new) {
                const newData = payload.new as T;
                setData(prev =>
                  prev.map(item =>
                    (item as Record<string, unknown>).id === (newData as Record<string, unknown>).id
                      ? newData
                      : item
                  )
                );
                onUpdate?.(newData, (payload.old || {}) as Partial<T>);
              }
              break;
            case 'DELETE':
              if (payload.old) {
                const oldData = payload.old as Partial<T>;
                setData(prev =>
                  prev.filter(
                    item => (item as Record<string, unknown>).id !== (oldData as Record<string, unknown>).id
                  )
                );
                onDelete?.(oldData);
              }
              break;
          }
        }
      )
      .subscribe((status: string) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [table, event, filter, onInsert, onUpdate, onDelete]);

  const unsubscribe = useCallback(() => {
    channelRef.current?.unsubscribe();
  }, []);

  return { data, isConnected, unsubscribe };
}

export default useRealtimeSubscription;
