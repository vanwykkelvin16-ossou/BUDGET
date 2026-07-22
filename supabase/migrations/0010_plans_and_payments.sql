-- PennyPlay Plus goes multi-plan: monthly (R25, auto-billed) and yearly
-- (R200, once-off). Memberships learn which plan they're on plus the
-- PayFast subscription token needed to cancel, and every ITN PayFast
-- sends is kept in a payments ledger (complete, failed and cancelled
-- alike) for payment history, failure surfacing and idempotency.

-- 1) Plan + lifecycle columns on memberships.
alter table public.memberships
  add column if not exists plan text not null default 'yearly'
    check (plan in ('monthly', 'yearly')),
  add column if not exists status text not null default 'active'
    check (status in ('active', 'cancelled')),
  add column if not exists payfast_token text not null default '',
  add column if not exists cancelled_at timestamptz;

-- 2) Payments ledger: one row per PayFast notification. Written only by
--    the payfast-itn edge function (service role); users read their own.
create table if not exists public.payments (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  pf_payment_id  text not null,
  m_payment_id   text not null default '',
  plan           text not null default 'yearly',
  status         text not null, -- complete | failed | cancelled | pending
  amount_cents   integer not null default 0,
  item_name      text not null default '',
  created_at     timestamptz not null default now()
);

-- The same PayFast payment id may legitimately appear once per status
-- transition (e.g. PENDING then COMPLETE), but a repeat of the same
-- (payment, status) pair is a redelivery and must not double-process.
create unique index if not exists payments_pf_payment_status_key
  on public.payments (pf_payment_id, status)
  where pf_payment_id <> '';

create index if not exists payments_user_created_idx
  on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;

create policy "payments select own" on public.payments
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: the ITN edge function (service role)
-- is the only writer.
