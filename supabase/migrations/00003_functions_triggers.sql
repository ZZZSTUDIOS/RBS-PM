-- Migration: Database Functions and Triggers
-- Auto-updates positions from trades, maintains stats

-- ============================================================
-- POSITION UPDATE FUNCTION
-- Called after each trade to update user position
-- ============================================================
CREATE OR REPLACE FUNCTION update_position_from_trade()
RETURNS TRIGGER AS $$
DECLARE
    v_position_id UUID;
    v_shares DECIMAL(78, 18);
    v_amount DECIMAL(78, 18);
    v_avg_cost DECIMAL(78, 18);
    v_cost_of_sold DECIMAL(78, 18);
BEGIN
    v_shares := NEW.shares;
    v_amount := NEW.amount;

    -- Get or create position
    SELECT id INTO v_position_id
    FROM positions
    WHERE user_id = NEW.user_id AND market_id = NEW.market_id;

    IF v_position_id IS NULL THEN
        INSERT INTO positions (user_id, market_id)
        VALUES (NEW.user_id, NEW.market_id)
        RETURNING id INTO v_position_id;
    END IF;

    -- Update position based on trade type
    IF NEW.trade_type = 'BUY' THEN
        IF NEW.outcome = 'YES' THEN
            UPDATE positions
            SET
                yes_shares = yes_shares + v_shares,
                yes_cost_basis = yes_cost_basis + v_amount,
                avg_yes_entry_price = CASE
                    WHEN yes_shares + v_shares > 0
                    THEN (yes_cost_basis + v_amount) / (yes_shares + v_shares)
                    ELSE 0
                END
            WHERE id = v_position_id;
        ELSE
            UPDATE positions
            SET
                no_shares = no_shares + v_shares,
                no_cost_basis = no_cost_basis + v_amount,
                avg_no_entry_price = CASE
                    WHEN no_shares + v_shares > 0
                    THEN (no_cost_basis + v_amount) / (no_shares + v_shares)
                    ELSE 0
                END
            WHERE id = v_position_id;
        END IF;

    ELSIF NEW.trade_type = 'SELL' THEN
        IF NEW.outcome = 'YES' THEN
            -- Calculate cost basis of sold shares
            SELECT avg_yes_entry_price INTO v_avg_cost FROM positions WHERE id = v_position_id;
            v_cost_of_sold := COALESCE(v_avg_cost, 0) * v_shares;

            UPDATE positions
            SET
                yes_shares = GREATEST(0, yes_shares - v_shares),
                yes_cost_basis = GREATEST(0, yes_cost_basis - v_cost_of_sold),
                realized_pnl = realized_pnl + (v_amount - v_cost_of_sold)
            WHERE id = v_position_id;
        ELSE
            SELECT avg_no_entry_price INTO v_avg_cost FROM positions WHERE id = v_position_id;
            v_cost_of_sold := COALESCE(v_avg_cost, 0) * v_shares;

            UPDATE positions
            SET
                no_shares = GREATEST(0, no_shares - v_shares),
                no_cost_basis = GREATEST(0, no_cost_basis - v_cost_of_sold),
                realized_pnl = realized_pnl + (v_amount - v_cost_of_sold)
            WHERE id = v_position_id;
        END IF;

    ELSIF NEW.trade_type = 'REDEEM' THEN
        IF NEW.outcome = 'YES' THEN
            SELECT avg_yes_entry_price INTO v_avg_cost FROM positions WHERE id = v_position_id;
            v_cost_of_sold := COALESCE(v_avg_cost, 0) * v_shares;

            UPDATE positions
            SET
                yes_shares = GREATEST(0, yes_shares - v_shares),
                yes_cost_basis = GREATEST(0, yes_cost_basis - v_cost_of_sold),
                realized_pnl = realized_pnl + (v_amount - v_cost_of_sold)
            WHERE id = v_position_id;
        ELSE
            SELECT avg_no_entry_price INTO v_avg_cost FROM positions WHERE id = v_position_id;
            v_cost_of_sold := COALESCE(v_avg_cost, 0) * v_shares;

            UPDATE positions
            SET
                no_shares = GREATEST(0, no_shares - v_shares),
                no_cost_basis = GREATEST(0, no_cost_basis - v_cost_of_sold),
                realized_pnl = realized_pnl + (v_amount - v_cost_of_sold)
            WHERE id = v_position_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_position
    AFTER INSERT ON trades
    FOR EACH ROW
    EXECUTE FUNCTION update_position_from_trade();

-- ============================================================
-- USER STATS UPDATE FUNCTION
-- Updates user stats after each trade
-- ============================================================
CREATE OR REPLACE FUNCTION update_user_stats_from_trade()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users
    SET
        total_trades = total_trades + 1,
        total_volume = total_volume + NEW.amount
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_user_stats
    AFTER INSERT ON trades
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_from_trade();

-- ============================================================
-- MARKET STATS UPDATE FUNCTION
-- Updates market stats after each trade
-- ============================================================
CREATE OR REPLACE FUNCTION update_market_stats_from_trade()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE markets
    SET
        total_trades = total_trades + 1,
        total_volume = total_volume + NEW.amount,
        unique_traders = (
            SELECT COUNT(DISTINCT user_id)
            FROM trades
            WHERE market_id = NEW.market_id
        )
    WHERE id = NEW.market_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_market_stats
    AFTER INSERT ON trades
    FOR EACH ROW
    EXECUTE FUNCTION update_market_stats_from_trade();

-- ============================================================
-- MARKET RESOLUTION UPDATE
-- Updates market status when resolved
-- ============================================================
CREATE OR REPLACE FUNCTION update_market_resolution()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.resolved = TRUE AND OLD.resolved = FALSE THEN
        NEW.status := 'RESOLVED';
        NEW.resolved_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_market_resolution
    BEFORE UPDATE OF resolved ON markets
    FOR EACH ROW
    EXECUTE FUNCTION update_market_resolution();

-- ============================================================
-- USER PNL SYNC FUNCTION
-- Periodically called to sync total_pnl from positions
-- ============================================================
CREATE OR REPLACE FUNCTION sync_user_pnl()
RETURNS void AS $$
BEGIN
    UPDATE users u
    SET total_pnl = COALESCE((
        SELECT SUM(p.realized_pnl)
        FROM positions p
        WHERE p.user_id = u.id
    ), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- GET OR CREATE USER FUNCTION
-- Used by auth to get/create user by wallet
-- ============================================================
CREATE OR REPLACE FUNCTION get_or_create_user(
    p_wallet_address TEXT,
    p_nonce TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    wallet_address TEXT,
    display_name TEXT,
    is_new BOOLEAN
) AS $$
DECLARE
    v_user_id UUID;
    v_is_new BOOLEAN := FALSE;
BEGIN
    -- Try to find existing user
    SELECT u.id INTO v_user_id
    FROM users u
    WHERE LOWER(u.wallet_address) = LOWER(p_wallet_address);

    -- Create if not exists
    IF v_user_id IS NULL THEN
        INSERT INTO users (wallet_address, nonce, nonce_expires_at)
        VALUES (
            LOWER(p_wallet_address),
            p_nonce,
            CASE WHEN p_nonce IS NOT NULL THEN NOW() + INTERVAL '5 minutes' ELSE NULL END
        )
        RETURNING users.id INTO v_user_id;
        v_is_new := TRUE;
    ELSIF p_nonce IS NOT NULL THEN
        -- Update nonce for existing user
        UPDATE users
        SET
            nonce = p_nonce,
            nonce_expires_at = NOW() + INTERVAL '5 minutes'
        WHERE users.id = v_user_id;
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.wallet_address,
        u.display_name,
        v_is_new as is_new
    FROM users u
    WHERE u.id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- VERIFY NONCE FUNCTION
-- Verifies and consumes a nonce
-- ============================================================
CREATE OR REPLACE FUNCTION verify_and_consume_nonce(
    p_wallet_address TEXT,
    p_nonce TEXT
)
RETURNS TABLE (
    valid BOOLEAN,
    user_id UUID
) AS $$
DECLARE
    v_user_id UUID;
    v_stored_nonce TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Get user's nonce
    SELECT u.id, u.nonce, u.nonce_expires_at
    INTO v_user_id, v_stored_nonce, v_expires_at
    FROM users u
    WHERE LOWER(u.wallet_address) = LOWER(p_wallet_address);

    -- Validate
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID;
        RETURN;
    END IF;

    IF v_stored_nonce IS NULL OR v_stored_nonce != p_nonce THEN
        RETURN QUERY SELECT FALSE, NULL::UUID;
        RETURN;
    END IF;

    IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
        -- Clear expired nonce
        UPDATE users SET nonce = NULL, nonce_expires_at = NULL WHERE id = v_user_id;
        RETURN QUERY SELECT FALSE, NULL::UUID;
        RETURN;
    END IF;

    -- Clear nonce after use
    UPDATE users SET nonce = NULL, nonce_expires_at = NULL WHERE id = v_user_id;

    RETURN QUERY SELECT TRUE, v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- CLEANUP EXPIRED SESSIONS FUNCTION
-- Called periodically to remove expired sessions
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM auth_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- GET USER PORTFOLIO FUNCTION
-- Returns user's complete portfolio with current values
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_portfolio(p_user_id UUID)
RETURNS TABLE (
    market_id UUID,
    market_address TEXT,
    market_question TEXT,
    yes_shares DECIMAL(78, 18),
    no_shares DECIMAL(78, 18),
    yes_cost_basis DECIMAL(78, 18),
    no_cost_basis DECIMAL(78, 18),
    realized_pnl DECIMAL(78, 18),
    current_yes_price DECIMAL(78, 18),
    current_no_price DECIMAL(78, 18),
    unrealized_pnl DECIMAL(78, 18),
    market_resolved BOOLEAN,
    market_yes_wins BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id as market_id,
        m.address as market_address,
        m.question as market_question,
        p.yes_shares,
        p.no_shares,
        p.yes_cost_basis,
        p.no_cost_basis,
        p.realized_pnl,
        m.yes_price as current_yes_price,
        m.no_price as current_no_price,
        CASE
            WHEN m.resolved THEN
                CASE
                    WHEN m.yes_wins THEN p.yes_shares - p.yes_cost_basis - p.no_cost_basis
                    ELSE p.no_shares - p.yes_cost_basis - p.no_cost_basis
                END
            ELSE
                (p.yes_shares * m.yes_price) + (p.no_shares * m.no_price) - p.yes_cost_basis - p.no_cost_basis
        END as unrealized_pnl,
        m.resolved as market_resolved,
        m.yes_wins as market_yes_wins
    FROM positions p
    JOIN markets m ON p.market_id = m.id
    WHERE p.user_id = p_user_id
    AND (p.yes_shares > 0.0001 OR p.no_shares > 0.0001 OR ABS(p.realized_pnl) > 0.0001);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ENABLE REALTIME FOR KEY TABLES
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE markets;
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE positions;
