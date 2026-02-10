-- Migration: Remove Protocol Fee from New Markets
--
-- Fee structure changed from:
--   1% trading fee split 50/50 (0.5% protocol + 0.5% creator)
-- To:
--   0.5% trading fee goes 100% to market creator (no protocol fee)
--
-- Revenue now comes from x402 API micropayments instead of on-chain trading fees.
--
-- NOTE: Keeping existing columns for backwards compatibility with historical data.
-- New trades will have protocol_fee = 0 and creator_fee = 100% of trading fee.

-- ============================================================
-- UPDATE COLUMN COMMENTS
-- ============================================================

COMMENT ON COLUMN trades.protocol_fee IS 'DEPRECATED: Protocol fee (legacy, no longer used in new contracts). New trades have 0.';
COMMENT ON COLUMN trades.creator_fee IS 'Creator fee (100% of 0.5% trading fee in new contracts)';
COMMENT ON COLUMN trades.trading_fee IS 'Total trading fee (0.5% in new contracts, all goes to creator)';

COMMENT ON COLUMN markets.total_protocol_fees IS 'DEPRECATED: Cumulative protocol fees (legacy markets only)';
COMMENT ON COLUMN markets.total_creator_fees IS 'Cumulative creator fees (100% of trading fees in new contracts)';

-- ============================================================
-- UPDATE TRIGGER: Only update creator_fees for new trades
-- Protocol fees are no longer sent on-chain
-- ============================================================
CREATE OR REPLACE FUNCTION update_market_fee_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE markets
    SET
        -- Protocol fee is deprecated, only update if present for legacy data
        total_protocol_fees = total_protocol_fees + COALESCE(NEW.protocol_fee, 0),
        -- Creator fee is now 100% of trading fee
        total_creator_fees = total_creator_fees + COALESCE(NEW.creator_fee, 0),
        updated_at = NOW()
    WHERE id = NEW.market_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ADD FUNCTION: Get creator fee summary (replaces protocol fee summary)
-- ============================================================
CREATE OR REPLACE FUNCTION get_creator_fee_summary()
RETURNS TABLE (
    total_creator_fees DECIMAL(78, 18),
    total_trades BIGINT,
    markets_with_fees BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(creator_fee), 0::DECIMAL(78, 18)) as total_creator_fees,
        COUNT(*)::BIGINT as total_trades,
        COUNT(DISTINCT market_id)::BIGINT as markets_with_fees
    FROM trades
    WHERE creator_fee > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- UPDATE VIEW: Market fee stats
-- ============================================================
CREATE OR REPLACE VIEW market_fee_stats AS
SELECT
    m.id as market_id,
    m.address as market_address,
    m.question,
    COALESCE(SUM(t.protocol_fee), 0) as total_protocol_fees,  -- Legacy
    COALESCE(SUM(t.creator_fee), 0) as total_creator_fees,
    COALESCE(SUM(t.trading_fee), 0) as total_trading_fees,
    COUNT(t.id) as total_trades
FROM markets m
LEFT JOIN trades t ON t.market_id = m.id
GROUP BY m.id, m.address, m.question;

COMMENT ON VIEW market_fee_stats IS 'Fee statistics per market. Note: protocol_fee is legacy (0 for new markets)';
