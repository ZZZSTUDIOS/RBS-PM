-- Add x402_payments to Supabase Realtime publication
-- Enables live heartbeat on the Insights page without polling
ALTER PUBLICATION supabase_realtime ADD TABLE x402_payments;
