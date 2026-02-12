-- Migration: Add market analytics columns for velocity, stress, fragility, heat score
-- These are computed by the indexer every minute from market_snapshots + trades

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS velocity_1m DECIMAL(78,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS velocity_5m DECIMAL(78,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS velocity_15m DECIMAL(78,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acceleration DECIMAL(78,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stress_score DECIMAL(78,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fragility DECIMAL(78,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_velocity_24h DECIMAL(78,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heat_score DECIMAL(78,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume_24h DECIMAL(78,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trades_24h INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_markets_heat_score ON markets(heat_score DESC);
