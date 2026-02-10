-- Migration: Drop unused agent_trades table
-- Nothing writes to it, trades are tracked via indexer -> trades table

DROP TABLE IF EXISTS agent_trades CASCADE;

-- Also drop agent_heartbeats if not being used
-- (SDK has heartbeat code but doesn't POST to any endpoint)
DROP TABLE IF EXISTS agent_heartbeats CASCADE;

-- Final table list (11 tables):
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
-- 11. agent_trade_intents
