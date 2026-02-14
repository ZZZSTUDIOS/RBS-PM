-- Add idempotency key support for forum comments
-- Agents send a deterministic key (sha256 of wallet+market+text+time_window))
-- to prevent duplicate comments without needing to call getComments() first.

ALTER TABLE forum_comments
  ADD COLUMN idempotency_key TEXT;

-- Unique index on idempotency_key (nullable — old comments won't have one)
CREATE UNIQUE INDEX idx_forum_comments_idempotency_key
  ON forum_comments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
