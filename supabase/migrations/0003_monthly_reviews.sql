-- Month tracker reviews: the user's own mood + reflection per budget cycle.
-- One review per (user, cycle); standard owner-scoped RLS.

create table public.monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_start date not null,
  mood int not null check (mood between 1 and 4),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cycle_start)
);

alter table public.monthly_reviews enable row level security;

create policy "reviews all own" on public.monthly_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
