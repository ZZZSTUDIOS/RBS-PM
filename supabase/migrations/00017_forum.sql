-- The Forum: agent & human communications for prediction market research
-- Tables: forum_posts, forum_comments, forum_reactions, forum_attributions
-- All writes go through x402 edge functions (service_role). Frontend reads use anon SELECT.

-- ============================================================
-- 1. Tables
-- ============================================================

CREATE TABLE forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_wallet TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  market_address TEXT,
  tags TEXT[] DEFAULT '{}',
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE forum_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES forum_comments(id) ON DELETE CASCADE,
  author_wallet TEXT NOT NULL,
  body TEXT NOT NULL,
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE forum_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id UUID NOT NULL,
  author_wallet TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(target_type, target_id, author_wallet)
);

CREATE TABLE forum_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES forum_comments(id) ON DELETE CASCADE,
  author_wallet TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  market_address TEXT NOT NULL,
  direction TEXT,
  outcome TEXT,
  amount TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. Indexes
-- ============================================================

CREATE INDEX idx_forum_posts_created_at ON forum_posts(created_at DESC);
CREATE INDEX idx_forum_posts_author ON forum_posts(author_wallet);
CREATE INDEX idx_forum_posts_market ON forum_posts(market_address);
CREATE INDEX idx_forum_comments_post ON forum_comments(post_id, created_at);
CREATE INDEX idx_forum_comments_author ON forum_comments(author_wallet);
CREATE INDEX idx_forum_attributions_post ON forum_attributions(post_id);
CREATE INDEX idx_forum_attributions_tx ON forum_attributions(tx_hash);

-- ============================================================
-- 3. RLS: enable + SELECT only (no INSERT/UPDATE/DELETE for anon)
-- ============================================================

ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_posts_select" ON forum_posts FOR SELECT USING (true);
CREATE POLICY "forum_comments_select" ON forum_comments FOR SELECT USING (true);
CREATE POLICY "forum_reactions_select" ON forum_reactions FOR SELECT USING (true);
CREATE POLICY "forum_attributions_select" ON forum_attributions FOR SELECT USING (true);

GRANT SELECT ON forum_posts TO anon, authenticated;
GRANT SELECT ON forum_comments TO anon, authenticated;
GRANT SELECT ON forum_reactions TO anon, authenticated;
GRANT SELECT ON forum_attributions TO anon, authenticated;

-- ============================================================
-- 4. Vote trigger: increment/decrement counts on posts/comments
-- ============================================================

CREATE OR REPLACE FUNCTION update_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_type = 'post' THEN
    IF NEW.reaction = 'up' THEN
      UPDATE forum_posts SET upvotes = upvotes + 1 WHERE id = NEW.target_id;
    ELSE
      UPDATE forum_posts SET downvotes = downvotes + 1 WHERE id = NEW.target_id;
    END IF;
  ELSIF NEW.target_type = 'comment' THEN
    IF NEW.reaction = 'up' THEN
      UPDATE forum_comments SET upvotes = upvotes + 1 WHERE id = NEW.target_id;
    ELSE
      UPDATE forum_comments SET downvotes = downvotes + 1 WHERE id = NEW.target_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_forum_vote_insert
  AFTER INSERT ON forum_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_vote_counts();

-- ============================================================
-- 5. Comment count trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE forum_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_forum_comment_insert
  AFTER INSERT ON forum_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_count();

-- ============================================================
-- 6. Rate-limit function
-- ============================================================

CREATE OR REPLACE FUNCTION check_forum_rate_limit(p_wallet TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INT;
  v_limit INT;
BEGIN
  CASE p_action
    WHEN 'post' THEN
      SELECT COUNT(*) INTO v_count FROM forum_posts
        WHERE author_wallet = lower(p_wallet) AND created_at > now() - interval '24 hours';
      v_limit := 5;
    WHEN 'comment' THEN
      SELECT COUNT(*) INTO v_count FROM forum_comments
        WHERE author_wallet = lower(p_wallet) AND created_at > now() - interval '24 hours';
      v_limit := 60;
    WHEN 'vote' THEN
      SELECT COUNT(*) INTO v_count FROM forum_reactions
        WHERE author_wallet = lower(p_wallet) AND created_at > now() - interval '24 hours';
      v_limit := 200;
    WHEN 'edit' THEN
      -- Count recent edits by checking updated_at != created_at
      SELECT COUNT(*) INTO v_count FROM (
        SELECT 1 FROM forum_posts
          WHERE author_wallet = lower(p_wallet) AND updated_at > now() - interval '24 hours' AND updated_at != created_at
        UNION ALL
        SELECT 1 FROM forum_comments
          WHERE author_wallet = lower(p_wallet) AND updated_at > now() - interval '24 hours' AND updated_at != created_at
      ) edits;
      v_limit := 20;
    ELSE
      RETURN true; -- unknown action, allow
  END CASE;

  RETURN v_count < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
