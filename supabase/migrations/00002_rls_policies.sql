-- Migration: Row Level Security Policies
-- Secures all tables with appropriate access controls

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE indexer_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS POLICIES
-- ============================================================

-- Anyone can read public user profiles
CREATE POLICY "Users are viewable by everyone"
    ON users FOR SELECT
    USING (true);

-- Users can only update their own profile
CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (
        wallet_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
    );

-- New users can be created via edge functions (service role)
CREATE POLICY "Service role can insert users"
    ON users FOR INSERT
    WITH CHECK (true);

-- ============================================================
-- MARKETS POLICIES
-- ============================================================

-- Anyone can view markets
CREATE POLICY "Markets are viewable by everyone"
    ON markets FOR SELECT
    USING (true);

-- Service role can insert/update markets (from indexer)
CREATE POLICY "Service role can insert markets"
    ON markets FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role can update markets"
    ON markets FOR UPDATE
    USING (true);

-- ============================================================
-- TRADES POLICIES
-- ============================================================

-- Anyone can view all trades (transparency)
CREATE POLICY "Trades are viewable by everyone"
    ON trades FOR SELECT
    USING (true);

-- Service role can insert trades (from indexer)
CREATE POLICY "Service role can insert trades"
    ON trades FOR INSERT
    WITH CHECK (true);

-- ============================================================
-- POSITIONS POLICIES
-- ============================================================

-- Users can view all positions (market transparency)
CREATE POLICY "Positions are viewable by everyone"
    ON positions FOR SELECT
    USING (true);

-- Service role handles position updates (from triggers/indexer)
CREATE POLICY "Service role can manage positions"
    ON positions FOR ALL
    USING (true);

-- ============================================================
-- MARKET_SNAPSHOTS POLICIES
-- ============================================================

-- Anyone can view snapshots
CREATE POLICY "Snapshots are viewable by everyone"
    ON market_snapshots FOR SELECT
    USING (true);

-- Only service role can insert snapshots
CREATE POLICY "Service role can insert snapshots"
    ON market_snapshots FOR INSERT
    WITH CHECK (true);

-- ============================================================
-- INDEXER_STATE POLICIES
-- ============================================================

-- Only service role can access indexer state
CREATE POLICY "Service role only for indexer state"
    ON indexer_state FOR ALL
    USING (true); -- Service role bypasses RLS anyway

-- ============================================================
-- AUTH_SESSIONS POLICIES
-- ============================================================

-- Users can only see their own sessions
CREATE POLICY "Users can view their own sessions"
    ON auth_sessions FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM users
            WHERE wallet_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
        )
    );

-- Users can delete their own sessions (logout)
CREATE POLICY "Users can delete their own sessions"
    ON auth_sessions FOR DELETE
    USING (
        user_id IN (
            SELECT id FROM users
            WHERE wallet_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
        )
    );

-- Service role can manage sessions
CREATE POLICY "Service role can manage sessions"
    ON auth_sessions FOR ALL
    USING (true);

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant select on public tables
GRANT SELECT ON users, markets, trades, positions, market_snapshots, leaderboard TO anon, authenticated;

-- Authenticated users can update their own profile
GRANT UPDATE (display_name, avatar_url) ON users TO authenticated;

-- Grant delete on sessions for logout
GRANT DELETE ON auth_sessions TO authenticated;
