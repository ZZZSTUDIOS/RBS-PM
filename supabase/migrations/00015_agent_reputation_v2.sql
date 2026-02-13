-- Agent Reputation System v2
-- Tracks reputation points earned from x402 API usage.
-- Health = active in last 24h. Tiers = cumulative score thresholds.
-- Daily decay of -5 points for inactive agents via pg_cron.

CREATE TABLE agent_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_wallet TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  points INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_rep_wallet ON agent_reputation(agent_wallet);
CREATE INDEX idx_agent_rep_created ON agent_reputation(created_at DESC);

-- Summary view: reputation, health, tier, activity breakdown
CREATE OR REPLACE VIEW agent_reputation_summary AS
SELECT
  agent_wallet,
  GREATEST(SUM(points), 0) as total_reputation,
  COUNT(*) FILTER (WHERE points > 0) as total_x402_calls,
  MAX(created_at) FILTER (WHERE points > 0) as last_active,
  CASE WHEN MAX(created_at) FILTER (WHERE points > 0) > NOW() - INTERVAL '24 hours'
       THEN true ELSE false END as healthy,
  CASE
    WHEN GREATEST(SUM(points), 0) >= 1000 THEN 'diamond'
    WHEN GREATEST(SUM(points), 0) >= 200 THEN 'gold'
    WHEN GREATEST(SUM(points), 0) >= 50 THEN 'silver'
    WHEN GREATEST(SUM(points), 0) >= 10 THEN 'bronze'
    ELSE 'unranked'
  END as tier,
  COUNT(*) FILTER (WHERE endpoint = 'x402-agent-trade') as trade_calls,
  COUNT(*) FILTER (WHERE endpoint LIKE 'x402-deploy%' OR endpoint = 'x402-create-market') as market_creation_calls,
  COUNT(*) FILTER (WHERE endpoint = 'x402-resolve') as resolution_calls
FROM agent_reputation
GROUP BY agent_wallet;

-- RLS: public reads, service-role inserts
ALTER TABLE agent_reputation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reputation is publicly readable" ON agent_reputation FOR SELECT USING (true);
CREATE POLICY "Service role can insert reputation" ON agent_reputation FOR INSERT WITH CHECK (true);

GRANT SELECT ON agent_reputation TO anon, authenticated;
GRANT SELECT ON agent_reputation_summary TO anon, authenticated;

-- Daily decay function: -5 points for wallets with no positive activity in 24h
CREATE OR REPLACE FUNCTION decay_agent_reputation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO agent_reputation (agent_wallet, endpoint, points)
  SELECT agent_wallet, 'decay', -5
  FROM agent_reputation
  GROUP BY agent_wallet
  HAVING SUM(points) > 0
    AND MAX(created_at) FILTER (WHERE points > 0) < NOW() - INTERVAL '24 hours';
END;
$$;

-- Schedule daily decay at midnight UTC
SELECT cron.schedule(
  'decay-agent-reputation',
  '0 0 * * *',
  $$SELECT decay_agent_reputation()$$
);
