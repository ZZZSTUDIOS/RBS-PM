// Data Migration Hook
// Migrates existing localStorage data to Supabase when user signs in

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Address } from 'viem';

interface LocalStorageMarket {
  id: number;
  address: Address;
  question: string;
  status: string;
  yesToken: Address;
  noToken: Address;
  resolution: string;
}

interface LocalStorageTrade {
  id: string;
  timestamp: number;
  marketAddress: Address;
  marketQuestion?: string;
  type: 'buy' | 'sell' | 'redeem';
  outcome: 'YES' | 'NO';
  amount: string;
  shares: string;
  txHash: string;
}

interface MigrationResult {
  success: boolean;
  marketsImported: number;
  tradesImported: number;
  errors: string[];
}

export function useDataMigration(userId?: string) {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  // Check if there's data to migrate
  const hasDataToMigrate = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;

    const markets = localStorage.getItem('lmsr-markets');
    const trades = localStorage.getItem('lmsr-trades');

    const marketsData = markets ? JSON.parse(markets) : [];
    const tradesData = trades ? JSON.parse(trades) : [];

    return marketsData.length > 0 || tradesData.length > 0;
  }, []);

  // Migrate localStorage data to Supabase
  const migrateData = useCallback(async (): Promise<MigrationResult> => {
    if (!userId) {
      return {
        success: false,
        marketsImported: 0,
        tradesImported: 0,
        errors: ['User not authenticated'],
      };
    }

    setIsMigrating(true);
    const errors: string[] = [];
    let marketsImported = 0;
    let tradesImported = 0;

    try {
      // Get localStorage data
      const marketsJson = localStorage.getItem('lmsr-markets');
      const tradesJson = localStorage.getItem('lmsr-trades');

      const markets: LocalStorageMarket[] = marketsJson ? JSON.parse(marketsJson) : [];
      const trades: LocalStorageTrade[] = tradesJson ? JSON.parse(tradesJson) : [];

      // Import markets
      for (const market of markets) {
        try {
          // Check if market already exists
          const { data: existing } = await supabase
            .from('markets')
            .select('id')
            .ilike('address', market.address)
            .single();

          if (!existing) {
            const { error } = await supabase.from('markets').insert({
              address: market.address.toLowerCase(),
              question: market.question,
              yes_token_address: market.yesToken.toLowerCase(),
              no_token_address: market.noToken.toLowerCase(),
              oracle_address: '0x0000000000000000000000000000000000000000', // Will be updated by indexer
              creator_address: '0x0000000000000000000000000000000000000000', // Will be updated by indexer
              resolution_time: new Date(market.resolution).toISOString(),
              status: market.status === 'ACTIVE' ? 'ACTIVE' : 'RESOLVED',
            } as Record<string, unknown>);

            if (error) {
              errors.push(`Market ${market.address}: ${error.message}`);
            } else {
              marketsImported++;
            }
          }
        } catch (err) {
          errors.push(
            `Market ${market.address}: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      }

      // Import trades
      for (const trade of trades) {
        try {
          // Get market ID from address
          const { data: marketData } = await supabase
            .from('markets')
            .select('id')
            .ilike('address', trade.marketAddress)
            .single();

          if (!marketData) {
            // Create market entry if it doesn't exist
            const { data: newMarket, error: marketError } = await supabase
              .from('markets')
              .insert({
                address: trade.marketAddress.toLowerCase(),
                question: trade.marketQuestion || 'Unknown Market',
                yes_token_address: '0x0000000000000000000000000000000000000000',
                no_token_address: '0x0000000000000000000000000000000000000000',
                oracle_address: '0x0000000000000000000000000000000000000000',
                creator_address: '0x0000000000000000000000000000000000000000',
                resolution_time: new Date().toISOString(),
              } as Record<string, unknown>)
              .select('id')
              .single();

            if (marketError) {
              errors.push(`Trade ${trade.txHash}: Failed to create market`);
              continue;
            }

            const marketId = (newMarket as Record<string, unknown>)?.id;

            // Insert trade
            const { error: tradeError } = await supabase.from('trades').upsert(
              {
                market_id: marketId,
                user_id: userId,
                trade_type: trade.type.toUpperCase() as 'BUY' | 'SELL' | 'REDEEM',
                outcome: trade.outcome,
                shares: trade.shares,
                amount: trade.amount,
                tx_hash: trade.txHash,
                created_at: new Date(trade.timestamp).toISOString(),
              } as Record<string, unknown>,
              { onConflict: 'tx_hash,outcome' }
            );

            if (tradeError) {
              errors.push(`Trade ${trade.txHash}: ${tradeError.message}`);
            } else {
              tradesImported++;
            }
          } else {
            // Insert trade with existing market
            const { error: tradeError } = await supabase.from('trades').upsert(
              {
                market_id: (marketData as Record<string, unknown>).id,
                user_id: userId,
                trade_type: trade.type.toUpperCase() as 'BUY' | 'SELL' | 'REDEEM',
                outcome: trade.outcome,
                shares: trade.shares,
                amount: trade.amount,
                tx_hash: trade.txHash,
                created_at: new Date(trade.timestamp).toISOString(),
              } as Record<string, unknown>,
              { onConflict: 'tx_hash,outcome' }
            );

            if (tradeError) {
              if (!tradeError.message.includes('duplicate')) {
                errors.push(`Trade ${trade.txHash}: ${tradeError.message}`);
              }
            } else {
              tradesImported++;
            }
          }
        } catch (err) {
          errors.push(
            `Trade ${trade.txHash}: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      }

      const result: MigrationResult = {
        success: errors.length === 0,
        marketsImported,
        tradesImported,
        errors,
      };

      setMigrationResult(result);
      return result;
    } catch (err) {
      const result: MigrationResult = {
        success: false,
        marketsImported,
        tradesImported,
        errors: [err instanceof Error ? err.message : 'Migration failed'],
      };
      setMigrationResult(result);
      return result;
    } finally {
      setIsMigrating(false);
    }
  }, [userId]);

  // Clear localStorage after successful migration
  const clearLocalStorage = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Keep a backup just in case
    const markets = localStorage.getItem('lmsr-markets');
    const trades = localStorage.getItem('lmsr-trades');

    if (markets) {
      localStorage.setItem('lmsr-markets-backup', markets);
      localStorage.removeItem('lmsr-markets');
    }

    if (trades) {
      localStorage.setItem('lmsr-trades-backup', trades);
      localStorage.removeItem('lmsr-trades');
    }
  }, []);

  // Restore from backup
  const restoreFromBackup = useCallback(() => {
    if (typeof window === 'undefined') return;

    const marketsBackup = localStorage.getItem('lmsr-markets-backup');
    const tradesBackup = localStorage.getItem('lmsr-trades-backup');

    if (marketsBackup) {
      localStorage.setItem('lmsr-markets', marketsBackup);
    }

    if (tradesBackup) {
      localStorage.setItem('lmsr-trades', tradesBackup);
    }
  }, []);

  return {
    isMigrating,
    migrationResult,
    hasDataToMigrate,
    migrateData,
    clearLocalStorage,
    restoreFromBackup,
  };
}

export default useDataMigration;
