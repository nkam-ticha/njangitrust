-- Run this in the Supabase SQL Editor after deployment variables are known.
-- First enable the pg_cron, pg_net, and Supabase Vault extensions in Dashboard > Database > Extensions.
-- Replace only the two values below before executing. Do not commit them to this repository.

-- SELECT vault.create_secret('https://YOUR-API.vercel.app/api/cron', 'njangi_api_cron_url');
-- SELECT vault.create_secret('YOUR-CRON-SECRET', 'njangi_api_cron_secret');

-- Re-running this block updates the job instead of creating a duplicate.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'njangi-vercel-job-processor';

SELECT cron.schedule(
  'njangi-vercel-job-processor',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'njangi_api_cron_url'),
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'njangi_api_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $$
);

-- Confirm the schedule and inspect later runs in the Supabase Cron dashboard.
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'njangi-vercel-job-processor';
