-- Migration: Cleanup Database & Fix x402 Payments
-- Consolidates schema and fixes x402_payments table

-- ============================================================
-- FIX: x402_payments table - make payment_header nullable
-- The logPayment function doesn't have access to the raw header
-- ============================================================

ALTER TABLE x402_payments ALTER COLUMN payment_header DROP NOT NULL;

-- Set default for existing NULL values
UPDATE x402_payments SET payment_header = 'n/a' WHERE payment_header IS NULL;

-- ============================================================
-- Tables we're keeping (core functionality):
-- ============================================================
-- users              - wallet users (SIWE auth)
-- markets            - prediction markets
-- trades             - trade history
-- positions          - user positions per market
-- market_snapshots   - price history for charts
-- indexer_state      - blockchain sync state
-- auth_sessions      - SIWE login sessions
-- x402_payments      - x402 micropayment tracking (FIXED)

-- ============================================================
-- Tables we're keeping (agent functionality):
-- ============================================================
-- agents             - agent identities (Moltbook/ERC-8004)
-- agent_sessions     - agent JWT sessions
-- agent_trades       - executed trades with context
-- agent_heartbeats   - health monitoring

-- ============================================================
-- Tables we can DROP (not actively used):
-- ============================================================

-- Drop agent_reputation (not implemented in any endpoint)
DROP TABLE IF EXISTS agent_reputation CASCADE;

-- Drop agent_trade_intents (redundant with agent_trades)
DROP TABLE IF EXISTS agent_trade_intents CASCADE;

-- Drop agent_research (not implemented in any endpoint)
DROP TABLE IF EXISTS agent_research CASCADE;

-- Drop protocol_fee_transfers (fees tracked in trades table already)
DROP TABLE IF EXISTS protocol_fee_transfers CASCADE;

-- ============================================================
-- Drop unused views
-- ============================================================

DROP VIEW IF EXISTS agent_performance CASCADE;
DROP VIEW IF EXISTS market_agent_activity CASCADE;
DROP VIEW IF EXISTS daily_agent_activity CASCADE;
DROP VIEW IF EXISTS agent_health_summary CASCADE;
DROP VIEW IF EXISTS protocol_fee_stats CASCADE;
DROP VIEW IF EXISTS market_fee_stats CASCADE;

-- ============================================================
-- Drop unused functions
-- ============================================================

DROP FUNCTION IF EXISTS get_or_create_agent_moltbook CASCADE;
DROP FUNCTION IF EXISTS get_or_create_agent_erc8004 CASCADE;
DROP FUNCTION IF EXISTS create_agent_session CASCADE;
DROP FUNCTION IF EXISTS record_x402_payment CASCADE;
DROP FUNCTION IF EXISTS update_agent_reputation CASCADE;
DROP FUNCTION IF EXISTS get_agent_stats CASCADE;
DROP FUNCTION IF EXISTS record_agent_trade CASCADE;
DROP FUNCTION IF EXISTS record_agent_heartbeat CASCADE;
DROP FUNCTION IF EXISTS get_protocol_fee_summary CASCADE;

-- ============================================================
-- Recreate essential views
-- ============================================================

-- x402 payment summary
CREATE OR REPLACE VIEW x402_payment_summary AS
SELECT
  endpoint,
  COUNT(*) as total_calls,
  SUM(CAST(amount AS BIGINT)) as total_amount_raw,
  COUNT(DISTINCT payer_address) as unique_payers,
  MIN(created_at) as first_payment,
  MAX(created_at) as last_payment
FROM x402_payments
GROUP BY endpoint
ORDER BY total_calls DESC;

-- Daily x402 revenue
CREATE OR REPLACE VIEW x402_daily_revenue AS
SELECT
  DATE(created_at) as date,
  endpoint,
  COUNT(*) as calls,
  SUM(CAST(amount AS BIGINT)) as revenue_raw,
  COUNT(DISTINCT payer_address) as unique_payers
FROM x402_payments
WHERE settled = true OR settled IS NULL
GROUP BY DATE(created_at), endpoint
ORDER BY date DESC, revenue_raw DESC;

-- Leaderboard
CREATE OR REPLACE VIEW leaderboard AS
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
-- Add helpful comments
-- ============================================================

COMMENT ON TABLE users IS 'Human users authenticated via SIWE (wallet signature)';
COMMENT ON TABLE markets IS 'LS-LMSR prediction markets on Monad';
COMMENT ON TABLE trades IS 'All buy/sell/redeem transactions indexed from chain';
COMMENT ON TABLE positions IS 'Aggregated user positions per market';
COMMENT ON TABLE market_snapshots IS 'Historical price snapshots for charts';
COMMENT ON TABLE indexer_state IS 'Blockchain indexer sync state';
COMMENT ON TABLE auth_sessions IS 'Active SIWE authentication sessions';
COMMENT ON TABLE agents IS 'AI agent identities (Moltbook or ERC-8004)';
COMMENT ON TABLE agent_sessions IS 'AI agent JWT sessions';
COMMENT ON TABLE x402_payments IS 'x402 micropayment logs for API access';
COMMENT ON TABLE agent_trades IS 'AI agent trades with research context';
COMMENT ON TABLE agent_heartbeats IS 'AI agent health monitoring logs';

-- ============================================================
-- Final table list after cleanup:
-- ============================================================
-- 1.  users
-- 2.  markets
-- 3.  trades
-- 4.  positions
-- 5.  market_snapshots
-- 6.  indexer_state
-- 7.  auth_sessions
-- 8.  agents
-- 9.  agent_sessions
-- 10. x402_payments
-- 11. agent_trades
-- 12. agent_heartbeats
