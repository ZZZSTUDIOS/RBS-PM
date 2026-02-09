-- Migration: Initial Schema for Prediction Market
-- Creates tables for users, markets, trades, positions, and indexer state

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS TABLE
-- Stores wallet addresses and user profiles
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    nonce TEXT, -- For SIWE authentication
    nonce_expires_at TIMESTAMPTZ,

    -- Stats (updated by triggers)
    total_trades INTEGER DEFAULT 0,
    total_volume DECIMAL(78, 18) DEFAULT 0,
    total_pnl DECIMAL(78, 18) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for wallet lookup
CREATE INDEX idx_users_wallet ON users(LOWER(wallet_address));

-- ============================================================
-- MARKETS TABLE
-- Stores all prediction markets
-- ============================================================
CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address TEXT NOT NULL UNIQUE, -- Contract address
    question TEXT NOT NULL,

    -- Token addresses
    yes_token_address TEXT NOT NULL,
    no_token_address TEXT NOT NULL,

    -- Market parameters
    oracle_address TEXT NOT NULL,
    creator_address TEXT NOT NULL,
    protocol_fee_recipient TEXT,
    resolution_time TIMESTAMPTZ NOT NULL,
    alpha DECIMAL(78, 18), -- LS-LMSR spread parameter
    min_liquidity DECIMAL(78, 18),

    -- Current state (updated by indexer)
    yes_price DECIMAL(78, 18) DEFAULT 0.5,
    no_price DECIMAL(78, 18) DEFAULT 0.5,
    yes_shares DECIMAL(78, 18) DEFAULT 0,
    no_shares DECIMAL(78, 18) DEFAULT 0,
    total_collateral DECIMAL(78, 18) DEFAULT 0,
    liquidity_parameter DECIMAL(78, 18),

    -- Status
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESOLVED', 'PAUSED')),
    resolved BOOLEAN DEFAULT FALSE,
    yes_wins BOOLEAN,

    -- Stats (updated by triggers)
    total_volume DECIMAL(78, 18) DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    unique_traders INTEGER DEFAULT 0,

    -- Metadata
    category TEXT,
    tags TEXT[],

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    -- Creation transaction
    creation_tx_hash TEXT
);

-- Indexes for common queries
CREATE INDEX idx_markets_address ON markets(LOWER(address));
CREATE INDEX idx_markets_status ON markets(status);
CREATE INDEX idx_markets_created_at ON markets(created_at DESC);
CREATE INDEX idx_markets_volume ON markets(total_volume DESC);
CREATE INDEX idx_markets_resolution_time ON markets(resolution_time);
CREATE INDEX idx_markets_creator ON markets(LOWER(creator_address));

-- ============================================================
-- TRADES TABLE
-- Records all buy/sell/redeem transactions
-- ============================================================
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Trade details
    trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL', 'REDEEM')),
    outcome TEXT NOT NULL CHECK (outcome IN ('YES', 'NO')),
    shares DECIMAL(78, 18) NOT NULL,
    amount DECIMAL(78, 18) NOT NULL, -- MON spent (buy) or received (sell/redeem)
    price_at_trade DECIMAL(78, 18), -- Price when trade executed

    -- Fee info
    trading_fee DECIMAL(78, 18) DEFAULT 0,

    -- Transaction info
    tx_hash TEXT NOT NULL,
    block_number BIGINT,
    block_timestamp TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique trades
    UNIQUE(tx_hash, outcome)
);

-- Indexes for trade queries
CREATE INDEX idx_trades_market ON trades(market_id);
CREATE INDEX idx_trades_user ON trades(user_id);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX idx_trades_tx_hash ON trades(tx_hash);
CREATE INDEX idx_trades_block ON trades(block_number);

-- ============================================================
-- POSITIONS TABLE
-- Aggregated user positions per market (maintained by triggers)
-- ============================================================
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,

    -- Position state
    yes_shares DECIMAL(78, 18) DEFAULT 0,
    no_shares DECIMAL(78, 18) DEFAULT 0,
    yes_cost_basis DECIMAL(78, 18) DEFAULT 0,
    no_cost_basis DECIMAL(78, 18) DEFAULT 0,
    realized_pnl DECIMAL(78, 18) DEFAULT 0,

    -- For quick unrealized PnL calculation
    avg_yes_entry_price DECIMAL(78, 18) DEFAULT 0,
    avg_no_entry_price DECIMAL(78, 18) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One position per user per market
    UNIQUE(user_id, market_id)
);

-- Indexes
CREATE INDEX idx_positions_user ON positions(user_id);
CREATE INDEX idx_positions_market ON positions(market_id);

-- ============================================================
-- MARKET_SNAPSHOTS TABLE
-- Historical price data for charts
-- ============================================================
CREATE TABLE market_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,

    -- Snapshot data
    yes_price DECIMAL(78, 18) NOT NULL,
    no_price DECIMAL(78, 18) NOT NULL,
    yes_shares DECIMAL(78, 18) NOT NULL,
    no_shares DECIMAL(78, 18) NOT NULL,
    total_collateral DECIMAL(78, 18) NOT NULL,
    liquidity_parameter DECIMAL(78, 18),

    -- Volume in this period
    volume_since_last DECIMAL(78, 18) DEFAULT 0,
    trades_since_last INTEGER DEFAULT 0,

    block_number BIGINT,
    snapshot_time TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for time-series queries
CREATE INDEX idx_snapshots_market_time ON market_snapshots(market_id, snapshot_time DESC);
CREATE INDEX idx_snapshots_time ON market_snapshots(snapshot_time DESC);

-- ============================================================
-- INDEXER_STATE TABLE
-- Track last indexed block per chain
-- ============================================================
CREATE TABLE indexer_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain_id INTEGER NOT NULL UNIQUE,
    chain_name TEXT NOT NULL,
    last_indexed_block BIGINT DEFAULT 0,
    last_indexed_at TIMESTAMPTZ DEFAULT NOW(),
    is_syncing BOOLEAN DEFAULT FALSE,
    sync_started_at TIMESTAMPTZ,

    -- Error tracking
    last_error TEXT,
    consecutive_errors INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize Monad Testnet
INSERT INTO indexer_state (chain_id, chain_name, last_indexed_block)
VALUES (10143, 'Monad Testnet', 0);

-- ============================================================
-- AUTH_SESSIONS TABLE
-- Store active SIWE sessions
-- ============================================================
CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Session info
    session_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,

    -- SIWE message details
    siwe_message TEXT,
    siwe_domain TEXT,
    siwe_uri TEXT,
    siwe_chain_id INTEGER,
    siwe_issued_at TIMESTAMPTZ,

    -- Client info
    user_agent TEXT,
    ip_address TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_sessions_token ON auth_sessions(session_token);
CREATE INDEX idx_sessions_expires ON auth_sessions(expires_at);

-- ============================================================
-- LEADERBOARD VIEW
-- Aggregated user stats for leaderboard
-- ============================================================
CREATE VIEW leaderboard AS
SELECT
    u.id,
    u.wallet_address,
    u.display_name,
    u.avatar_url,
    u.total_trades,
    u.total_volume,
    u.total_pnl,
    COUNT(DISTINCT p.market_id) as markets_traded,
    u.created_at
FROM users u
LEFT JOIN positions p ON u.id = p.user_id
GROUP BY u.id
ORDER BY u.total_pnl DESC;

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markets_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_indexer_state_updated_at
    BEFORE UPDATE ON indexer_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
