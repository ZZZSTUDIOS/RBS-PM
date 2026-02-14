-- Prevent the same trade from being linked more than once
-- First remove duplicate rows, keeping only the earliest attribution per tx_hash
DELETE FROM forum_attributions
WHERE id NOT IN (
  SELECT DISTINCT ON (tx_hash) id
  FROM forum_attributions
  ORDER BY tx_hash, created_at ASC
);

ALTER TABLE forum_attributions ADD CONSTRAINT forum_attributions_tx_hash_unique UNIQUE (tx_hash);
