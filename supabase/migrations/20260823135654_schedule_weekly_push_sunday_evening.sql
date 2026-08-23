-- Invokes the push-weekly edge function, supplying the shared token itself
-- so it never appears in the cron command.
--
-- force => ignore the "inactive for a week" filter. Handy for testing:
--   select public.run_weekly_push(true);
create or replace function public.run_weekly_push(force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tok text;
begin
  select cron_token into tok from public.push_config where id = 1;
  if tok is null then
    raise notice 'no cron token configured; skipping weekly push';
    return;
  end if;

  perform net.http_post(
    url := 'https://ewvaykmaoxcumkmrjvkm.supabase.co/functions/v1/push-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', tok
    ),
    body := jsonb_build_object('force', force)
  );
end;
$$;

revoke all on function public.run_weekly_push(boolean) from public, anon, authenticated;

-- Sunday 18:00 SAST (16:00 UTC): the natural "plan the week" moment.
select cron.unschedule('pennyplay-weekly-nudge')
where exists (select 1 from cron.job where jobname = 'pennyplay-weekly-nudge');

select cron.schedule(
  'pennyplay-weekly-nudge',
  '0 16 * * 0',
  $cron$select public.run_weekly_push()$cron$
);
