-- Migration: Fix Agent Trade Logging
-- Re-add agent_trade_intents since it's used by x402-agent-trade endpoint

-- ============================================================
-- Recreate agent_trade_intents (trade requests before execution)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_trade_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_address TEXT NOT NULL,
  trader_address TEXT NOT NULL,
  agent_id UUID REFERENCES agents(id),
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  outcome TEXT NOT NULL CHECK (outcome IN ('yes', 'no')),
  amount TEXT NOT NULL,
  executed BOOLEAN DEFAULT false,
  execution_tx_hash TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_intents_trader ON agent_trade_intents(trader_address);
CREATE INDEX IF NOT EXISTS idx_trade_intents_created ON agent_trade_intents(created_at DESC);

-- RLS
ALTER TABLE agent_trade_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trade intents are publicly readable"
  ON agent_trade_intents FOR SELECT USING (true);

CREATE POLICY "Trade intents insertable by system"
  ON agent_trade_intents FOR INSERT WITH CHECK (true);

CREATE POLICY "Trade intents updatable by system"
  ON agent_trade_intents FOR UPDATE USING (true);

COMMENT ON TABLE agent_trade_intents IS 'Trade requests made via x402-agent-trade (before execution)';

-- ============================================================
-- Also make agent_trades.tx_hash nullable for pending trades
-- ============================================================
ALTER TABLE agent_trades ALTER COLUMN tx_hash DROP NOT NULL;
