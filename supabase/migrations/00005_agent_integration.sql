-- Migration: Agent Integration (x402, ERC-8004, Moltbook)
-- Adds support for AI agent authentication, payments, and reputation

-- Agents table - stores both ERC-8004 and Moltbook agent identities
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ERC-8004 identity
  identity_token_id BIGINT UNIQUE,
  -- Moltbook identity
  moltbook_id TEXT UNIQUE,
  moltbook_name TEXT,
  moltbook_karma INTEGER,
  -- Common fields
  controller_address TEXT NOT NULL,
  name TEXT,
  description TEXT,
  -- Stats
  total_trades INTEGER DEFAULT 0,
  reputation_score TEXT DEFAULT '0',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent sessions - JWT sessions for authenticated agents
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  auth_method TEXT NOT NULL CHECK (auth_method IN ('moltbook', 'erc8004')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- x402 payments tracking - records all micropayments for premium endpoints
CREATE TABLE x402_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  endpoint TEXT NOT NULL,
  amount TEXT NOT NULL,
  payment_header TEXT NOT NULL,
  status TEXT DEFAULT 'verified',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent reputation history - tracks reputation changes per action
CREATE TABLE agent_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  market_id UUID REFERENCES markets(id),
  action_type TEXT NOT NULL,
  reputation_delta TEXT NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_agents_controller ON agents(controller_address);
CREATE INDEX idx_agents_moltbook_id ON agents(moltbook_id);
CREATE INDEX idx_agents_identity_token ON agents(identity_token_id);
CREATE INDEX idx_agent_sessions_token ON agent_sessions(session_token);
CREATE INDEX idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX idx_agent_sessions_expires ON agent_sessions(expires_at);
CREATE INDEX idx_x402_payments_agent ON x402_payments(agent_id);
CREATE INDEX idx_x402_payments_endpoint ON x402_payments(endpoint);
CREATE INDEX idx_agent_reputation_agent ON agent_reputation(agent_id);
CREATE INDEX idx_agent_reputation_market ON agent_reputation(market_id);

-- Update timestamp trigger for agents
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get or create agent by Moltbook ID
CREATE OR REPLACE FUNCTION get_or_create_agent_moltbook(
  p_moltbook_id TEXT,
  p_moltbook_name TEXT,
  p_moltbook_karma INTEGER,
  p_controller_address TEXT
)
RETURNS TABLE (
  id UUID,
  moltbook_id TEXT,
  moltbook_name TEXT,
  moltbook_karma INTEGER,
  controller_address TEXT,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent agents%ROWTYPE;
  v_is_new BOOLEAN := FALSE;
BEGIN
  -- Try to find existing agent
  SELECT * INTO v_agent
  FROM agents a
  WHERE a.moltbook_id = p_moltbook_id;

  IF v_agent.id IS NULL THEN
    -- Create new agent
    INSERT INTO agents (moltbook_id, moltbook_name, moltbook_karma, controller_address)
    VALUES (p_moltbook_id, p_moltbook_name, p_moltbook_karma, LOWER(p_controller_address))
    RETURNING * INTO v_agent;
    v_is_new := TRUE;
  ELSE
    -- Update existing agent's Moltbook data
    UPDATE agents
    SET moltbook_name = p_moltbook_name,
        moltbook_karma = p_moltbook_karma,
        updated_at = NOW()
    WHERE agents.id = v_agent.id
    RETURNING * INTO v_agent;
  END IF;

  RETURN QUERY SELECT
    v_agent.id,
    v_agent.moltbook_id,
    v_agent.moltbook_name,
    v_agent.moltbook_karma,
    v_agent.controller_address,
    v_is_new;
END;
$$;

-- Function to get or create agent by ERC-8004 token ID
CREATE OR REPLACE FUNCTION get_or_create_agent_erc8004(
  p_identity_token_id BIGINT,
  p_controller_address TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  identity_token_id BIGINT,
  controller_address TEXT,
  name TEXT,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent agents%ROWTYPE;
  v_is_new BOOLEAN := FALSE;
BEGIN
  -- Try to find existing agent
  SELECT * INTO v_agent
  FROM agents a
  WHERE a.identity_token_id = p_identity_token_id;

  IF v_agent.id IS NULL THEN
    -- Create new agent
    INSERT INTO agents (identity_token_id, controller_address, name)
    VALUES (p_identity_token_id, LOWER(p_controller_address), p_name)
    RETURNING * INTO v_agent;
    v_is_new := TRUE;
  END IF;

  RETURN QUERY SELECT
    v_agent.id,
    v_agent.identity_token_id,
    v_agent.controller_address,
    v_agent.name,
    v_is_new;
END;
$$;

-- Function to create agent session
CREATE OR REPLACE FUNCTION create_agent_session(
  p_agent_id UUID,
  p_session_token TEXT,
  p_auth_method TEXT,
  p_expires_in_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  session_id UUID,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
  v_session_id UUID;
BEGIN
  v_expires_at := NOW() + (p_expires_in_hours || ' hours')::INTERVAL;

  INSERT INTO agent_sessions (agent_id, session_token, auth_method, expires_at)
  VALUES (p_agent_id, p_session_token, p_auth_method, v_expires_at)
  RETURNING id INTO v_session_id;

  RETURN QUERY SELECT v_session_id, v_expires_at;
END;
$$;

-- Function to record x402 payment
CREATE OR REPLACE FUNCTION record_x402_payment(
  p_agent_id UUID,
  p_endpoint TEXT,
  p_amount TEXT,
  p_payment_header TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment_id UUID;
BEGIN
  INSERT INTO x402_payments (agent_id, endpoint, amount, payment_header)
  VALUES (p_agent_id, p_endpoint, p_amount, p_payment_header)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

-- Function to update agent reputation
CREATE OR REPLACE FUNCTION update_agent_reputation(
  p_agent_id UUID,
  p_market_id UUID,
  p_action_type TEXT,
  p_reputation_delta TEXT,
  p_tx_hash TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Record the reputation change
  INSERT INTO agent_reputation (agent_id, market_id, action_type, reputation_delta, tx_hash)
  VALUES (p_agent_id, p_market_id, p_action_type, p_reputation_delta, p_tx_hash);

  -- Update the agent's total reputation score
  UPDATE agents
  SET reputation_score = (
    COALESCE(reputation_score::NUMERIC, 0) + p_reputation_delta::NUMERIC
  )::TEXT,
  updated_at = NOW()
  WHERE id = p_agent_id;
END;
$$;

-- Function to get agent stats summary
CREATE OR REPLACE FUNCTION get_agent_stats(p_agent_id UUID)
RETURNS TABLE (
  total_trades INTEGER,
  reputation_score TEXT,
  total_x402_spent TEXT,
  markets_traded INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.total_trades,
    a.reputation_score,
    COALESCE((SELECT SUM(amount::NUMERIC)::TEXT FROM x402_payments WHERE agent_id = p_agent_id), '0'),
    COALESCE((SELECT COUNT(DISTINCT market_id)::INTEGER FROM agent_reputation WHERE agent_id = p_agent_id), 0)
  FROM agents a
  WHERE a.id = p_agent_id;
END;
$$;

-- RLS Policies for agents table
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents are publicly readable"
  ON agents FOR SELECT
  USING (true);

CREATE POLICY "Agents can update own record"
  ON agents FOR UPDATE
  USING (true); -- Controller verification happens in edge functions

-- RLS Policies for agent_sessions table
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sessions are accessible by system"
  ON agent_sessions FOR ALL
  USING (true); -- Session management through edge functions

-- RLS Policies for x402_payments table
ALTER TABLE x402_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payments are publicly readable"
  ON x402_payments FOR SELECT
  USING (true);

CREATE POLICY "Payments are insertable by system"
  ON x402_payments FOR INSERT
  WITH CHECK (true);

-- RLS Policies for agent_reputation table
ALTER TABLE agent_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reputation is publicly readable"
  ON agent_reputation FOR SELECT
  USING (true);

CREATE POLICY "Reputation is insertable by system"
  ON agent_reputation FOR INSERT
  WITH CHECK (true);

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_or_create_agent_moltbook TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_agent_erc8004 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_agent_session TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_x402_payment TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_agent_reputation TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_agent_stats TO anon, authenticated;
