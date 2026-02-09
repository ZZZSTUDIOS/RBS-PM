// Supabase Database Types
// Generated from database schema - update if schema changes

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          wallet_address: string;
          display_name: string | null;
          avatar_url: string | null;
          nonce: string | null;
          nonce_expires_at: string | null;
          total_trades: number;
          total_volume: string;
          total_pnl: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          display_name?: string | null;
          avatar_url?: string | null;
          nonce?: string | null;
          nonce_expires_at?: string | null;
          total_trades?: number;
          total_volume?: string;
          total_pnl?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          nonce?: string | null;
          nonce_expires_at?: string | null;
          total_trades?: number;
          total_volume?: string;
          total_pnl?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      markets: {
        Row: {
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
        };
        Insert: {
          id?: string;
          address: string;
          question: string;
          yes_token_address: string;
          no_token_address: string;
          oracle_address: string;
          creator_address: string;
          protocol_fee_recipient?: string | null;
          resolution_time: string;
          alpha?: string | null;
          min_liquidity?: string | null;
          yes_price?: string;
          no_price?: string;
          yes_shares?: string;
          no_shares?: string;
          total_collateral?: string;
          liquidity_parameter?: string | null;
          status?: 'ACTIVE' | 'RESOLVED' | 'PAUSED';
          resolved?: boolean;
          yes_wins?: boolean | null;
          total_volume?: string;
          total_trades?: number;
          unique_traders?: number;
          category?: string | null;
          tags?: string[] | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
          creation_tx_hash?: string | null;
        };
        Update: {
          id?: string;
          address?: string;
          question?: string;
          yes_token_address?: string;
          no_token_address?: string;
          oracle_address?: string;
          creator_address?: string;
          protocol_fee_recipient?: string | null;
          resolution_time?: string;
          alpha?: string | null;
          min_liquidity?: string | null;
          yes_price?: string;
          no_price?: string;
          yes_shares?: string;
          no_shares?: string;
          total_collateral?: string;
          liquidity_parameter?: string | null;
          status?: 'ACTIVE' | 'RESOLVED' | 'PAUSED';
          resolved?: boolean;
          yes_wins?: boolean | null;
          total_volume?: string;
          total_trades?: number;
          unique_traders?: number;
          category?: string | null;
          tags?: string[] | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
          creation_tx_hash?: string | null;
        };
      };
      trades: {
        Row: {
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
        };
        Insert: {
          id?: string;
          market_id: string;
          user_id: string;
          trade_type: 'BUY' | 'SELL' | 'REDEEM';
          outcome: 'YES' | 'NO';
          shares: string;
          amount: string;
          price_at_trade?: string | null;
          trading_fee?: string;
          tx_hash: string;
          block_number?: number | null;
          block_timestamp?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          market_id?: string;
          user_id?: string;
          trade_type?: 'BUY' | 'SELL' | 'REDEEM';
          outcome?: 'YES' | 'NO';
          shares?: string;
          amount?: string;
          price_at_trade?: string | null;
          trading_fee?: string;
          tx_hash?: string;
          block_number?: number | null;
          block_timestamp?: string | null;
          created_at?: string;
        };
      };
      positions: {
        Row: {
          id: string;
          user_id: string;
          market_id: string;
          yes_shares: string;
          no_shares: string;
          yes_cost_basis: string;
          no_cost_basis: string;
          realized_pnl: string;
          avg_yes_entry_price: string;
          avg_no_entry_price: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          market_id: string;
          yes_shares?: string;
          no_shares?: string;
          yes_cost_basis?: string;
          no_cost_basis?: string;
          realized_pnl?: string;
          avg_yes_entry_price?: string;
          avg_no_entry_price?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          market_id?: string;
          yes_shares?: string;
          no_shares?: string;
          yes_cost_basis?: string;
          no_cost_basis?: string;
          realized_pnl?: string;
          avg_yes_entry_price?: string;
          avg_no_entry_price?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      market_snapshots: {
        Row: {
          id: string;
          market_id: string;
          yes_price: string;
          no_price: string;
          yes_shares: string;
          no_shares: string;
          total_collateral: string;
          liquidity_parameter: string | null;
          volume_since_last: string;
          trades_since_last: number;
          block_number: number | null;
          snapshot_time: string;
        };
        Insert: {
          id?: string;
          market_id: string;
          yes_price: string;
          no_price: string;
          yes_shares: string;
          no_shares: string;
          total_collateral: string;
          liquidity_parameter?: string | null;
          volume_since_last?: string;
          trades_since_last?: number;
          block_number?: number | null;
          snapshot_time?: string;
        };
        Update: {
          id?: string;
          market_id?: string;
          yes_price?: string;
          no_price?: string;
          yes_shares?: string;
          no_shares?: string;
          total_collateral?: string;
          liquidity_parameter?: string | null;
          volume_since_last?: string;
          trades_since_last?: number;
          block_number?: number | null;
          snapshot_time?: string;
        };
      };
      indexer_state: {
        Row: {
          id: string;
          chain_id: number;
          chain_name: string;
          last_indexed_block: number;
          last_indexed_at: string;
          is_syncing: boolean;
          sync_started_at: string | null;
          last_error: string | null;
          consecutive_errors: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chain_id: number;
          chain_name: string;
          last_indexed_block?: number;
          last_indexed_at?: string;
          is_syncing?: boolean;
          sync_started_at?: string | null;
          last_error?: string | null;
          consecutive_errors?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          chain_id?: number;
          chain_name?: string;
          last_indexed_block?: number;
          last_indexed_at?: string;
          is_syncing?: boolean;
          sync_started_at?: string | null;
          last_error?: string | null;
          consecutive_errors?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      auth_sessions: {
        Row: {
          id: string;
          user_id: string;
          session_token: string;
          expires_at: string;
          siwe_message: string | null;
          siwe_domain: string | null;
          siwe_uri: string | null;
          siwe_chain_id: number | null;
          siwe_issued_at: string | null;
          user_agent: string | null;
          ip_address: string | null;
          created_at: string;
          last_used_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_token: string;
          expires_at: string;
          siwe_message?: string | null;
          siwe_domain?: string | null;
          siwe_uri?: string | null;
          siwe_chain_id?: number | null;
          siwe_issued_at?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
          created_at?: string;
          last_used_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_token?: string;
          expires_at?: string;
          siwe_message?: string | null;
          siwe_domain?: string | null;
          siwe_uri?: string | null;
          siwe_chain_id?: number | null;
          siwe_issued_at?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
          created_at?: string;
          last_used_at?: string;
        };
      };
    };
    Views: {
      leaderboard: {
        Row: {
          id: string;
          wallet_address: string;
          display_name: string | null;
          avatar_url: string | null;
          total_trades: number;
          total_volume: string;
          total_pnl: string;
          markets_traded: number;
          created_at: string;
        };
      };
    };
    Functions: {
      get_or_create_user: {
        Args: {
          p_wallet_address: string;
          p_nonce?: string | null;
        };
        Returns: {
          id: string;
          wallet_address: string;
          display_name: string | null;
          is_new: boolean;
        }[];
      };
      verify_and_consume_nonce: {
        Args: {
          p_wallet_address: string;
          p_nonce: string;
        };
        Returns: {
          valid: boolean;
          user_id: string | null;
        }[];
      };
      get_user_portfolio: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          market_id: string;
          market_address: string;
          market_question: string;
          yes_shares: string;
          no_shares: string;
          yes_cost_basis: string;
          no_cost_basis: string;
          realized_pnl: string;
          current_yes_price: string;
          current_no_price: string;
          unrealized_pnl: string;
          market_resolved: boolean;
          market_yes_wins: boolean | null;
        }[];
      };
      sync_user_pnl: {
        Args: Record<string, never>;
        Returns: void;
      };
      cleanup_expired_sessions: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
  };
}

// Convenience types
export type User = Database['public']['Tables']['users']['Row'];
export type Market = Database['public']['Tables']['markets']['Row'];
export type Trade = Database['public']['Tables']['trades']['Row'];
export type Position = Database['public']['Tables']['positions']['Row'];
export type MarketSnapshot = Database['public']['Tables']['market_snapshots']['Row'];
export type LeaderboardEntry = Database['public']['Views']['leaderboard']['Row'];
