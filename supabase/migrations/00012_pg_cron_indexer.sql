-- Enable pg_cron and pg_net for scheduled indexer invocation
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule the indexer to run every minute
-- Requires INDEXER_API_KEY to be stored in Vault:
--   INSERT INTO vault.secrets (name, secret) VALUES ('indexer_api_key', 'your-key-here');
SELECT cron.schedule(
  'run-indexer',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qkcytrdhdtemyphsswou.supabase.co/functions/v1/indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'indexer_api_key')
    ),
    body := '{"source": "pg_cron"}'::jsonb
  );
  $$
);
