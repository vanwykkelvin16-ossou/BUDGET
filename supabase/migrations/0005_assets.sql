-- Net-worth tracker: assets (what you own) and liabilities (what you owe).
-- Amounts are stored positive; liabilities subtract at display time.

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default '💰',
  kind text not null check (kind in ('asset', 'liability')),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "assets all own" on public.assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
