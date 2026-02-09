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
  // Includes protocol fee tracking - fees are auto-transferred on every trade
  const syncTrade = useCallback(async (trade: {
    marketAddress: string;
    tradeType: 'BUY' | 'SELL' | 'REDEEM';
    outcome: 'YES' | 'NO';
    shares: string;
    amount: string;
    txHash: string;
    priceAtTrade?: string;
    protocolFee?: string; // Protocol fee auto-sent to 0x048c...cdFE
    creatorFee?: string;  // Creator fee accumulated in contract
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

      // Calculate total trading fee if we have the individual fees
      const tradingFee = trade.protocolFee && trade.creatorFee
        ? (parseFloat(trade.protocolFee) + parseFloat(trade.creatorFee)).toString()
        : undefined;

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
        protocol_fee: trade.protocolFee,
        creator_fee: trade.creatorFee,
        trading_fee: tradingFee,
      } as Record<string, unknown>, {
        onConflict: 'tx_hash,outcome'
      }).select('id').single();

      if (error) {
        console.error('Failed to sync trade:', error);
        return false;
      }

      // If we have a protocol fee, also record it in protocol_fee_transfers for transparency
      if (trade.protocolFee && parseFloat(trade.protocolFee) > 0 && tradeData?.id) {
        await supabase.from('protocol_fee_transfers').upsert({
          trade_id: tradeData.id,
          market_id: marketData.id,
          amount: trade.protocolFee,
          recipient: '0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE',
          tx_hash: trade.txHash,
          block_number: blockNumber,
          block_timestamp: blockTimestamp,
        } as Record<string, unknown>, {
          onConflict: 'tx_hash,trade_id'
        });
      }

      console.log('Trade synced to Supabase:', trade.txHash, trade.protocolFee ? `(protocol fee: ${trade.protocolFee})` : '');
      return true;
    } catch (err) {
      console.error('Error syncing trade:', err);
      return false;
    }
  }, [user?.id, publicClient]);

  return { user, userId: user?.id || null, isLoading, syncUser, syncTrade };
}

/**
 * Hook to fetch protocol fee statistics from Supabase
 */
export function useProtocolFeeStats() {
  const [stats, setStats] = useState<{
    totalFeesCollected: string;
    totalTransfers: number;
    marketsWithFees: number;
    firstFeeAt: string | null;
    lastFeeAt: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_protocol_fee_summary');

      if (error) {
        console.error('Failed to fetch protocol fee stats:', error);
        return;
      }

      if (data && data.length > 0) {
        const row = data[0];
        setStats({
          totalFeesCollected: row.total_fees_collected || '0',
          totalTransfers: row.total_transfers || 0,
          marketsWithFees: row.markets_with_fees || 0,
          firstFeeAt: row.first_fee_at,
          lastFeeAt: row.last_fee_at,
        });
      }
    } catch (err) {
      console.error('Error fetching protocol fee stats:', err);
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
 * Hook to fetch protocol fee transfers for a specific market
 */
export function useMarketProtocolFees(marketAddress: string | undefined) {
  const [fees, setFees] = useState<{
    totalProtocolFees: string;
    totalCreatorFees: string;
    transfers: Array<{
      id: string;
      amount: string;
      txHash: string;
      blockTimestamp: string | null;
    }>;
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
        .select('id, total_protocol_fees, total_creator_fees')
        .ilike('address', marketAddress)
        .single();

      if (marketError || !marketData) {
        console.log('Market not found in Supabase');
        setFees(null);
        return;
      }

      // Get all protocol fee transfers for this market
      const { data: transfers, error: transfersError } = await supabase
        .from('protocol_fee_transfers')
        .select('id, amount, tx_hash, block_timestamp')
        .eq('market_id', marketData.id)
        .order('created_at', { ascending: false });

      if (transfersError) {
        console.error('Failed to fetch protocol fee transfers:', transfersError);
      }

      setFees({
        totalProtocolFees: marketData.total_protocol_fees || '0',
        totalCreatorFees: marketData.total_creator_fees || '0',
        transfers: (transfers || []).map(t => ({
          id: t.id,
          amount: t.amount,
          txHash: t.tx_hash,
          blockTimestamp: t.block_timestamp,
        })),
      });
    } catch (err) {
      console.error('Error fetching market protocol fees:', err);
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
