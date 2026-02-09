-- Migration: Protocol Fee Tracking
-- Adds columns and tables to track protocol fees that are auto-transferred on every trade

-- ============================================================
-- ADD FEE COLUMNS TO TRADES TABLE
-- ============================================================

-- Add protocol_fee and creator_fee columns to trades
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS protocol_fee DECIMAL(78, 18) DEFAULT 0,
ADD COLUMN IF NOT EXISTS creator_fee DECIMAL(78, 18) DEFAULT 0;

-- Update trading_fee to be calculated from protocol + creator
COMMENT ON COLUMN trades.trading_fee IS 'Total trading fee (protocol_fee + creator_fee)';
COMMENT ON COLUMN trades.protocol_fee IS 'Protocol fee auto-transferred to 0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE';
COMMENT ON COLUMN trades.creator_fee IS 'Creator fee accumulated in contract, claimable after resolution';

-- ============================================================
-- PROTOCOL FEE TRANSFERS TABLE
-- Tracks all protocol fee transfers (for auditing/transparency)
-- ============================================================
CREATE TABLE IF NOT EXISTS protocol_fee_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Link to trade that generated this fee
    trade_id UUID REFERENCES trades(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,

    -- Transfer details
    amount DECIMAL(78, 18) NOT NULL,
    recipient TEXT NOT NULL DEFAULT '0x048c2c9E869594a70c6Dc7CeAC168E724425cdFE',

    -- Transaction info
    tx_hash TEXT NOT NULL,
    block_number BIGINT,
    block_timestamp TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Index for lookups
    UNIQUE(tx_hash, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_protocol_fee_transfers_market ON protocol_fee_transfers(market_id);
CREATE INDEX IF NOT EXISTS idx_protocol_fee_transfers_created ON protocol_fee_transfers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_protocol_fee_transfers_recipient ON protocol_fee_transfers(LOWER(recipient));

-- ============================================================
-- PROTOCOL FEE STATS VIEW
-- Aggregated protocol fee statistics
-- ============================================================
CREATE OR REPLACE VIEW protocol_fee_stats AS
SELECT
    recipient,
    COUNT(*) as total_transfers,
    SUM(amount) as total_fees_received,
    MIN(created_at) as first_fee_at,
    MAX(created_at) as last_fee_at
FROM protocol_fee_transfers
GROUP BY recipient;

-- ============================================================
-- MARKET FEE STATS VIEW
-- Per-market fee statistics
-- ============================================================
CREATE OR REPLACE VIEW market_fee_stats AS
SELECT
    m.id as market_id,
    m.address as market_address,
    m.question,
    COALESCE(SUM(t.protocol_fee), 0) as total_protocol_fees,
    COALESCE(SUM(t.creator_fee), 0) as total_creator_fees,
    COALESCE(SUM(t.trading_fee), 0) as total_trading_fees,
    COUNT(t.id) as total_trades
FROM markets m
LEFT JOIN trades t ON t.market_id = m.id
GROUP BY m.id, m.address, m.question;

-- ============================================================
-- ADD PROTOCOL FEE COLUMNS TO MARKETS TABLE
-- Track cumulative fees per market
-- ============================================================
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS total_protocol_fees DECIMAL(78, 18) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_creator_fees DECIMAL(78, 18) DEFAULT 0;

COMMENT ON COLUMN markets.total_protocol_fees IS 'Cumulative protocol fees sent from this market';
COMMENT ON COLUMN markets.total_creator_fees IS 'Cumulative creator fees accumulated (may be claimed)';

-- ============================================================
-- TRIGGER: Update market fee totals when trade is inserted
-- ============================================================
CREATE OR REPLACE FUNCTION update_market_fee_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE markets
    SET
        total_protocol_fees = total_protocol_fees + COALESCE(NEW.protocol_fee, 0),
        total_creator_fees = total_creator_fees + COALESCE(NEW.creator_fee, 0),
        updated_at = NOW()
    WHERE id = NEW.market_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_market_fee_totals ON trades;
CREATE TRIGGER trigger_update_market_fee_totals
    AFTER INSERT ON trades
    FOR EACH ROW
    EXECUTE FUNCTION update_market_fee_totals();

-- ============================================================
-- FUNCTION: Get protocol fee summary
-- ============================================================
CREATE OR REPLACE FUNCTION get_protocol_fee_summary()
RETURNS TABLE (
    total_fees_collected DECIMAL(78, 18),
    total_transfers BIGINT,
    markets_with_fees BIGINT,
    first_fee_at TIMESTAMPTZ,
    last_fee_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(amount), 0::DECIMAL(78, 18)) as total_fees_collected,
        COUNT(*)::BIGINT as total_transfers,
        COUNT(DISTINCT market_id)::BIGINT as markets_with_fees,
        MIN(created_at) as first_fee_at,
        MAX(created_at) as last_fee_at
    FROM protocol_fee_transfers;
END;
$$ LANGUAGE plpgsql;
