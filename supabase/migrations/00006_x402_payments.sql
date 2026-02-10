-- x402 Payment Tracking Enhancement
-- Enhances x402_payments table from 00005 with additional fields

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add amount_formatted if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'x402_payments' AND column_name = 'amount_formatted') THEN
    ALTER TABLE x402_payments ADD COLUMN amount_formatted TEXT;
  END IF;

  -- Add payer_address if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'x402_payments' AND column_name = 'payer_address') THEN
    ALTER TABLE x402_payments ADD COLUMN payer_address TEXT;
  END IF;

  -- Add request_params if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'x402_payments' AND column_name = 'request_params') THEN
    ALTER TABLE x402_payments ADD COLUMN request_params JSONB;
  END IF;

  -- Add settled if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'x402_payments' AND column_name = 'settled') THEN
    ALTER TABLE x402_payments ADD COLUMN settled BOOLEAN DEFAULT false;
  END IF;

  -- Add settlement_tx_hash if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'x402_payments' AND column_name = 'settlement_tx_hash') THEN
    ALTER TABLE x402_payments ADD COLUMN settlement_tx_hash TEXT;
  END IF;

  -- Add settled_at if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'x402_payments' AND column_name = 'settled_at') THEN
    ALTER TABLE x402_payments ADD COLUMN settled_at TIMESTAMPTZ;
  END IF;
END $$;

-- Indexes for querying (create if not exists)
CREATE INDEX IF NOT EXISTS idx_x402_payments_payer ON x402_payments(payer_address);
CREATE INDEX IF NOT EXISTS idx_x402_payments_created ON x402_payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_x402_payments_settled ON x402_payments(settled);

-- Summary view for analytics
CREATE OR REPLACE VIEW x402_payment_summary AS
SELECT
  endpoint,
  COUNT(*) as total_calls,
  SUM(CAST(amount AS BIGINT)) as total_amount_raw,
  COUNT(DISTINCT payer_address) as unique_payers,
  MIN(created_at) as first_payment,
  MAX(created_at) as last_payment
FROM x402_payments
GROUP BY endpoint
ORDER BY total_calls DESC;

-- Daily revenue view
CREATE OR REPLACE VIEW x402_daily_revenue AS
SELECT
  DATE(created_at) as date,
  endpoint,
  COUNT(*) as calls,
  SUM(CAST(amount AS BIGINT)) as revenue_raw,
  COUNT(DISTINCT payer_address) as unique_payers
FROM x402_payments
WHERE settled = true
GROUP BY DATE(created_at), endpoint
ORDER BY date DESC, revenue_raw DESC;

COMMENT ON TABLE x402_payments IS 'Tracks all x402 micropayments for API access';
