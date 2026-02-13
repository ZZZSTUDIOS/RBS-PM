-- Lock down write access: anon role should NEVER be able to INSERT/UPDATE.
-- All writes go through edge functions which use service_role key (bypasses RLS).
--
-- Problem: RLS INSERT policies with `WITH CHECK (true)` allow any role
-- that has GRANT INSERT to write. Several tables had implicit or explicit
-- INSERT grants to anon/authenticated.

-- ============================================================
-- 1. Revoke INSERT/UPDATE/DELETE from anon on all sensitive tables
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON x402_payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON agent_reputation FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON markets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON trades FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON positions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON market_snapshots FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON indexer_state FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON agents FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON agent_sessions FROM anon, authenticated;

-- Keep existing SELECT grants (reads are fine — public transparency)
-- Keep existing UPDATE (display_name, avatar_url) on users for authenticated
-- Keep existing DELETE on auth_sessions for authenticated (logout)

-- ============================================================
-- 2. Clean up exploit test data injected during vulnerability testing
-- ============================================================

DELETE FROM x402_payments WHERE endpoint = 'exploit-test';
DELETE FROM agent_reputation WHERE endpoint = 'exploit-test';
