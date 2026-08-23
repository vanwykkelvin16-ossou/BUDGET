-- The scheduled job authenticates to the sender with a shared token.
-- It is generated here and read back only by the runner function, so the
-- secret never has to be typed into a cron command (cron.job rows are
-- readable) or pasted anywhere.
alter table public.push_config
  add column if not exists cron_token text;

update public.push_config
set cron_token = replace(gen_random_uuid()::text, '-', '')
              || replace(gen_random_uuid()::text, '-', '')
where cron_token is null;
