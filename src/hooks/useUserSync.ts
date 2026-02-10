// Auto-sync user to Supabase when wallet connects
import { useEffect, useCallback, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { supabase } from '../lib/supabase';

interface SyncedUser {
  id: string;
  wallet_address: string;
  display_name: string | null;
  is_new: boolean;
}

/**
 * Automatically creates/updates a user in Supabase when wallet connects.
 * No signature required - just tracks wallet addresses.
 */
export function useUserSync() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [user, setUser] = useState<SyncedUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const syncUser = useCallback(async (walletAddress: string): Promise<SyncedUser | null> => {
    setIsLoading(true);
    try {
      // Use the database function to get or create user
      const { data, error } = await supabase.rpc('get_or_create_user', {
        p_wallet_address: walletAddress.toLowerCase(),
        p_nonce: null, // No nonce needed for simple sync
      });

      if (error) {
        console.error('Failed to sync user:', JSON.stringify(error, null, 2));
        console.error('Error code:', error.code, 'Message:', error.message, 'Details:', error.details);
        return null;
      }

      const userData = data?.[0] as SyncedUser | undefined;
      if (userData) {
        console.log(`User synced: ${walletAddress} (${userData.is_new ? 'new' : 'existing'})`);
        setUser(userData);
        return userData;
      }
      return null;
    } catch (err) {
      console.error('Error syncing user:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-sync when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      syncUser(address);
    } else {
      setUser(null);
    }
  }, [isConnected, address, syncUser]);

  // Sync a trade to Supabase (looks up market by address)
  // Note: 0.5% trading fee goes 100% to market creator (no protocol fee)
  const syncTrade = useCallback(async (trade: {
    marketAddress: string;
    tradeType: 'BUY' | 'SELL' | 'REDEEM';
    outcome: 'YES' | 'NO';
    shares: string;
    amount: string;
    txHash: string;
    priceAtTrade?: string;
    creatorFee?: string;  // Creator fee (100% of 0.5% trading fee)
  }): Promise<boolean> => {
    if (!user?.id) {
      console.log('No user ID, skipping trade sync');
      return false;
    }

    try {
      // First, get market ID by address
      const { data: marketData, error: marketError } = await supabase
        .from('markets')
        .select('id')
        .ilike('address', trade.marketAddress)
        .single();

      if (marketError || !marketData) {
        console.log('Market not found in Supabase, skipping trade sync');
        return false;
      }

      // Fetch transaction receipt for block info
      let blockNumber: number | null = null;
      let blockTimestamp: string | null = null;

      if (publicClient) {
        try {
          const receipt = await publicClient.getTransactionReceipt({
            hash: trade.txHash as `0x${string}`,
          });
          blockNumber = Number(receipt.blockNumber);

          // Get block for timestamp
          const block = await publicClient.getBlock({
            blockNumber: receipt.blockNumber,
          });
          blockTimestamp = new Date(Number(block.timestamp) * 1000).toISOString();
        } catch (err) {
          console.log('Could not fetch block info:', err);
        }
      }

      // Trading fee is now 100% creator fee
      const tradingFee = trade.creatorFee;

      // Insert trade with fee information
      const { data: tradeData, error } = await supabase.from('trades').upsert({
        market_id: marketData.id,
        user_id: user.id,
        trade_type: trade.tradeType,
        outcome: trade.outcome,
        shares: trade.shares,
        amount: trade.amount,
        tx_hash: trade.txHash,
        price_at_trade: trade.priceAtTrade,
        block_number: blockNumber,
        block_timestamp: blockTimestamp,
        creator_fee: trade.creatorFee,
        trading_fee: tradingFee,
      } as Record<string, unknown>, {
        onConflict: 'tx_hash,outcome'
      }).select('id').single();

      if (error) {
        console.error('Failed to sync trade:', error);
        return false;
      }

      console.log('Trade synced to Supabase:', trade.txHash, trade.creatorFee ? `(creator fee: ${trade.creatorFee})` : '');
      return true;
    } catch (err) {
      console.error('Error syncing trade:', err);
      return false;
    }
  }, [user?.id, publicClient]);

  return { user, userId: user?.id || null, isLoading, syncUser, syncTrade };
}

/**
 * Hook to fetch creator fee statistics from Supabase
 * Note: Trading fee is 0.5% and goes 100% to market creator (no protocol fee)
 */
export function useCreatorFeeStats() {
  const [stats, setStats] = useState<{
    totalCreatorFees: string;
    marketsWithFees: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      // Sum creator fees from all trades
      const { data, error } = await supabase
        .from('trades')
        .select('creator_fee');

      if (error) {
        console.error('Failed to fetch creator fee stats:', error);
        return;
      }

      const totalFees = (data || []).reduce((sum, t) => {
        return sum + (parseFloat(t.creator_fee || '0'));
      }, 0);

      // Count unique markets with fees
      const marketsWithFees = new Set(
        (data || []).filter(t => parseFloat(t.creator_fee || '0') > 0)
      ).size;

      setStats({
        totalCreatorFees: totalFees.toString(),
        marketsWithFees,
      });
    } catch (err) {
      console.error('Error fetching creator fee stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, refetch: fetchStats };
}

/**
 * Hook to fetch creator fees for a specific market
 * Note: Trading fee is 0.5% and goes 100% to market creator (no protocol fee)
 */
export function useMarketCreatorFees(marketAddress: string | undefined) {
  const [fees, setFees] = useState<{
    totalCreatorFees: string;
    tradeCount: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchFees = useCallback(async () => {
    if (!marketAddress) {
      setFees(null);
      return;
    }

    setIsLoading(true);
    try {
      // Get market ID first
      const { data: marketData, error: marketError } = await supabase
        .from('markets')
        .select('id, total_creator_fees')
        .ilike('address', marketAddress)
        .single();

      if (marketError || !marketData) {
        console.log('Market not found in Supabase');
        setFees(null);
        return;
      }

      // Count trades with creator fees
      const { count, error: countError } = await supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('market_id', marketData.id)
        .gt('creator_fee', '0');

      if (countError) {
        console.error('Failed to count trades:', countError);
      }

      setFees({
        totalCreatorFees: marketData.total_creator_fees || '0',
        tradeCount: count || 0,
      });
    } catch (err) {
      console.error('Error fetching market creator fees:', err);
      setFees(null);
    } finally {
      setIsLoading(false);
    }
  }, [marketAddress]);

  useEffect(() => {
    fetchFees();
  }, [fetchFees]);

  return { fees, isLoading, refetch: fetchFees };
}

export default useUserSync;
