-- Server-only PayFast merchant config. Edge functions (service role) read
-- this when Deno.env secrets are not set. No client policies on purpose:
-- anon/authenticated cannot SELECT/INSERT/UPDATE/DELETE.
create table if not exists public.payfast_config (
  id            smallint primary key default 1 check (id = 1),
  merchant_id   text not null,
  merchant_key  text not null,
  passphrase    text not null default '',
  sandbox       boolean not null default false,
  updated_at    timestamptz not null default now()
);

alter table public.payfast_config enable row level security;

revoke all on public.payfast_config from anon, authenticated;
grant select on public.payfast_config to service_role;
