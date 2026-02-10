-- Migration: Agent Activity Tracking
-- Adds tables for tracking agent trades, heartbeats, and research

-- ============================================================
-- Agent Trade Intents (from x402-agent-trade endpoint)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_trade_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Market info
  market_address TEXT NOT NULL,

  -- Trader info
  trader_address TEXT NOT NULL,
  agent_id UUID REFERENCES agents(id),

  -- Trade details
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  outcome TEXT NOT NULL CHECK (outcome IN ('yes', 'no')),
  amount TEXT NOT NULL,

  -- Execution status
  executed BOOLEAN DEFAULT false,
  execution_tx_hash TEXT,
  executed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trade_intents_market ON agent_trade_intents(market_address);
CREATE INDEX idx_trade_intents_trader ON agent_trade_intents(trader_address);
CREATE INDEX idx_trade_intents_agent ON agent_trade_intents(agent_id);
CREATE INDEX idx_trade_intents_created ON agent_trade_intents(created_at DESC);

-- ============================================================
-- Agent Trades (actual executed trades)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Agent info
  agent_id UUID REFERENCES agents(id),
  wallet_address TEXT NOT NULL,

  -- Market info
  market_address TEXT NOT NULL,
  market_question TEXT,

  -- Trade details
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  outcome TEXT NOT NULL CHECK (outcome IN ('yes', 'no')),
  amount_usdc TEXT NOT NULL,              -- Amount in USDC
  shares_received TEXT,                   -- Shares received/sold

  -- Execution
  tx_hash TEXT NOT NULL,
  block_number BIGINT,

  -- Pre-trade analysis
  market_price_before NUMERIC,            -- Market price before trade
  agent_prediction NUMERIC,               -- Agent's predicted probability
  edge NUMERIC,                           -- Edge = prediction - market_price
  confidence NUMERIC,                     -- Agent's confidence in prediction
  research_summary TEXT,                  -- Summary of research done

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_trades_agent ON agent_trades(agent_id);
CREATE INDEX idx_agent_trades_wallet ON agent_trades(wallet_address);
CREATE INDEX idx_agent_trades_market ON agent_trades(market_address);
CREATE INDEX idx_agent_trades_created ON agent_trades(created_at DESC);

-- ============================================================
-- Agent Heartbeats (health monitoring)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Agent info
  agent_id UUID REFERENCES agents(id),
  wallet_address TEXT NOT NULL,

  -- Balances
  mon_balance TEXT NOT NULL,
  usdc_balance TEXT NOT NULL,

  -- Status
  healthy BOOLEAN NOT NULL,
  can_trade BOOLEAN NOT NULL,
  errors TEXT[],                          -- Array of error messages

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_heartbeats_agent ON agent_heartbeats(agent_id);
CREATE INDEX idx_heartbeats_wallet ON agent_heartbeats(wallet_address);
CREATE INDEX idx_heartbeats_created ON agent_heartbeats(created_at DESC);
CREATE INDEX idx_heartbeats_healthy ON agent_heartbeats(healthy);

-- Keep only last 24 hours of heartbeats (run as cron job)
-- SELECT cron.schedule('clean-old-heartbeats', '0 * * * *',
--   $$DELETE FROM agent_heartbeats WHERE created_at < NOW() - INTERVAL '24 hours'$$
-- );

-- ============================================================
-- Agent Research (market analysis)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Agent info
  agent_id UUID REFERENCES agents(id),
  wallet_address TEXT NOT NULL,

  -- Market info
  market_address TEXT NOT NULL,
  market_question TEXT NOT NULL,

  -- Research results
  prediction NUMERIC NOT NULL,            -- Agent's predicted probability (0-1)
  confidence NUMERIC NOT NULL,            -- Confidence level (0-1)
  base_rate NUMERIC,                      -- Historical base rate if known

  -- Analysis
  bullish_factors TEXT[],
  bearish_factors TEXT[],
  research_summary TEXT,
  sources TEXT[],

  -- Market state at time of research
  market_yes_price NUMERIC,
  market_no_price NUMERIC,
  calculated_edge NUMERIC,                -- prediction - market_yes_price

  -- Action taken
  trade_executed BOOLEAN DEFAULT false,
  trade_id UUID REFERENCES agent_trades(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_research_agent ON agent_research(agent_id);
CREATE INDEX idx_research_market ON agent_research(market_address);
CREATE INDEX idx_research_created ON agent_research(created_at DESC);

-- ============================================================
-- Views for Analytics
-- ============================================================

-- Agent performance summary
CREATE OR REPLACE VIEW agent_performance AS
SELECT
  a.id as agent_id,
  a.controller_address,
  COALESCE(a.moltbook_name, a.name, 'Anonymous') as agent_name,
  COUNT(t.id) as total_trades,
  SUM(CAST(t.amount_usdc AS NUMERIC)) as total_volume,
  AVG(t.edge) as avg_edge,
  AVG(t.confidence) as avg_confidence,
  COUNT(DISTINCT t.market_address) as markets_traded,
  MAX(t.created_at) as last_trade
FROM agents a
LEFT JOIN agent_trades t ON a.id = t.agent_id
GROUP BY a.id, a.controller_address, a.moltbook_name, a.name;

-- Market activity by agents
CREATE OR REPLACE VIEW market_agent_activity AS
SELECT
  t.market_address,
  t.market_question,
  COUNT(DISTINCT t.agent_id) as unique_agents,
  COUNT(t.id) as total_trades,
  SUM(CAST(t.amount_usdc AS NUMERIC)) as total_volume,
  AVG(t.agent_prediction) as avg_agent_prediction,
  MAX(t.created_at) as last_trade
FROM agent_trades t
GROUP BY t.market_address, t.market_question;

-- Daily agent activity
CREATE OR REPLACE VIEW daily_agent_activity AS
SELECT
  DATE(created_at) as date,
  COUNT(DISTINCT agent_id) as active_agents,
  COUNT(DISTINCT wallet_address) as active_wallets,
  COUNT(*) as total_trades,
  SUM(CAST(amount_usdc AS NUMERIC)) as total_volume
FROM agent_trades
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Agent health summary
CREATE OR REPLACE VIEW agent_health_summary AS
SELECT
  wallet_address,
  COUNT(*) as total_heartbeats,
  SUM(CASE WHEN healthy THEN 1 ELSE 0 END) as healthy_count,
  SUM(CASE WHEN NOT healthy THEN 1 ELSE 0 END) as unhealthy_count,
  (SELECT mon_balance FROM agent_heartbeats h2
   WHERE h2.wallet_address = agent_heartbeats.wallet_address
   ORDER BY created_at DESC LIMIT 1) as latest_mon,
  (SELECT usdc_balance FROM agent_heartbeats h2
   WHERE h2.wallet_address = agent_heartbeats.wallet_address
   ORDER BY created_at DESC LIMIT 1) as latest_usdc,
  MAX(created_at) as last_heartbeat
FROM agent_heartbeats
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY wallet_address;

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE agent_trade_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_research ENABLE ROW LEVEL SECURITY;

-- All tables publicly readable (for transparency)
CREATE POLICY "Trade intents are publicly readable" ON agent_trade_intents FOR SELECT USING (true);
CREATE POLICY "Agent trades are publicly readable" ON agent_trades FOR SELECT USING (true);
CREATE POLICY "Heartbeats are publicly readable" ON agent_heartbeats FOR SELECT USING (true);
CREATE POLICY "Research is publicly readable" ON agent_research FOR SELECT USING (true);

-- Insertable by system (edge functions)
CREATE POLICY "Trade intents insertable by system" ON agent_trade_intents FOR INSERT WITH CHECK (true);
CREATE POLICY "Agent trades insertable by system" ON agent_trades FOR INSERT WITH CHECK (true);
CREATE POLICY "Heartbeats insertable by system" ON agent_heartbeats FOR INSERT WITH CHECK (true);
CREATE POLICY "Research insertable by system" ON agent_research FOR INSERT WITH CHECK (true);

-- ============================================================
-- Helper Functions
-- ============================================================

-- Record a trade with full context
CREATE OR REPLACE FUNCTION record_agent_trade(
  p_wallet_address TEXT,
  p_market_address TEXT,
  p_market_question TEXT,
  p_direction TEXT,
  p_outcome TEXT,
  p_amount_usdc TEXT,
  p_shares_received TEXT,
  p_tx_hash TEXT,
  p_market_price_before NUMERIC DEFAULT NULL,
  p_agent_prediction NUMERIC DEFAULT NULL,
  p_confidence NUMERIC DEFAULT NULL,
  p_research_summary TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trade_id UUID;
  v_agent_id UUID;
  v_edge NUMERIC;
BEGIN
  -- Find agent by wallet address
  SELECT id INTO v_agent_id FROM agents
  WHERE controller_address = LOWER(p_wallet_address);

  -- Calculate edge if we have prediction and market price
  IF p_agent_prediction IS NOT NULL AND p_market_price_before IS NOT NULL THEN
    v_edge := p_agent_prediction - p_market_price_before;
  END IF;

  -- Insert trade
  INSERT INTO agent_trades (
    agent_id, wallet_address, market_address, market_question,
    direction, outcome, amount_usdc, shares_received, tx_hash,
    market_price_before, agent_prediction, edge, confidence, research_summary
  ) VALUES (
    v_agent_id, LOWER(p_wallet_address), LOWER(p_market_address), p_market_question,
    p_direction, p_outcome, p_amount_usdc, p_shares_received, p_tx_hash,
    p_market_price_before, p_agent_prediction, v_edge, p_confidence, p_research_summary
  )
  RETURNING id INTO v_trade_id;

  -- Update agent stats if we have an agent
  IF v_agent_id IS NOT NULL THEN
    UPDATE agents
    SET total_trades = total_trades + 1,
        updated_at = NOW()
    WHERE id = v_agent_id;
  END IF;

  RETURN v_trade_id;
END;
$$;

-- Record heartbeat
CREATE OR REPLACE FUNCTION record_agent_heartbeat(
  p_wallet_address TEXT,
  p_mon_balance TEXT,
  p_usdc_balance TEXT,
  p_healthy BOOLEAN,
  p_can_trade BOOLEAN,
  p_errors TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_heartbeat_id UUID;
  v_agent_id UUID;
BEGIN
  -- Find agent by wallet address
  SELECT id INTO v_agent_id FROM agents
  WHERE controller_address = LOWER(p_wallet_address);

  INSERT INTO agent_heartbeats (
    agent_id, wallet_address, mon_balance, usdc_balance, healthy, can_trade, errors
  ) VALUES (
    v_agent_id, LOWER(p_wallet_address), p_mon_balance, p_usdc_balance,
    p_healthy, p_can_trade, p_errors
  )
  RETURNING id INTO v_heartbeat_id;

  RETURN v_heartbeat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_agent_trade TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_agent_heartbeat TO anon, authenticated;

COMMENT ON TABLE agent_trade_intents IS 'Trade intents requested via x402-agent-trade endpoint';
COMMENT ON TABLE agent_trades IS 'Actual executed trades by agents with full context';
COMMENT ON TABLE agent_heartbeats IS 'Agent health check logs';
COMMENT ON TABLE agent_research IS 'Agent market research and analysis logs';
