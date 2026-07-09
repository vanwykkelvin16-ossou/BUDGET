-- Pulse Budget — initial schema.
-- Every user-owned table has RLS with auth.uid() scoping. XP is awarded
-- exclusively by security-definer trigger functions and the award-xp edge
-- function (service role): clients can read xp_events but never write them.

create type bucket as enum ('need', 'want', 'saving');

/* ------------------------------------------------------------------ */
/*  Profiles                                                           */
/* ------------------------------------------------------------------ */

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'You',
  salary_cents bigint not null default 0 check (salary_cents >= 0),
  pay_date int not null default 25 check (pay_date between 1 and 31),
  splits jsonb not null default '{"need": 50, "want": 30, "saving": 20}'::jsonb,
  fun_fund_cents bigint not null default 0 check (fun_fund_cents >= 0),
  xp int not null default 0,
  level int not null default 1,
  streak_count int not null default 0,
  longest_streak int not null default 0,
  streak_freezes int not null default 1,
  last_log_date date,
  last_freeze_earned_month text,
  weekly_streak int not null default 0,
  last_evaluated_date date,
  theme_id text not null default 'rookie',
  dark_mode boolean not null default true,
  sound_enabled boolean not null default true,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/*  User data                                                          */
/* ------------------------------------------------------------------ */

create table public.categories (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default '📦',
  color text not null default '#A8A29E',
  bucket bucket not null default 'want',
  is_fun_fund boolean not null default false,
  is_custom boolean not null default false,
  sort_order int not null default 0,
  primary key (user_id, id)
);

create table public.income_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  source text not null default 'other',
  note text,
  date date not null,
  occurrence_key text,
  created_at timestamptz not null default now()
);
create index income_entries_user_date on public.income_entries (user_id, date);
create unique index income_entries_occurrence
  on public.income_entries (user_id, occurrence_key)
  where occurrence_key is not null;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  category_id text not null,
  note text,
  date date not null,
  occurrence_key text,
  created_at timestamptz not null default now()
);
create index transactions_user_date on public.transactions (user_id, date);
create unique index transactions_occurrence
  on public.transactions (user_id, occurrence_key)
  where occurrence_key is not null;

create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  name text not null,
  amount_cents bigint not null check (amount_cents > 0),
  day_of_month int not null check (day_of_month between 1 and 31),
  category_id text,
  source text,
  active boolean not null default true,
  last_materialized date,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default '🎯',
  color text not null default '#22D3EE',
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0,
  auto_allocate_cents bigint not null default 0,
  celebrated_milestones jsonb not null default '[]'::jsonb,
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  date date not null,
  source text not null default 'manual' check (source in ('manual', 'auto', 'sweep')),
  created_at timestamptz not null default now()
);
create index goal_contributions_user_date on public.goal_contributions (user_id, date);

create table public.monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_start date not null,
  cycle_end date not null,
  income_cents bigint not null default 0,
  allocated jsonb not null default '{}'::jsonb,
  spent_by_bucket jsonb not null default '{}'::jsonb,
  spent_by_category jsonb not null default '{}'::jsonb,
  saved_cents bigint not null default 0,
  swept_cents bigint not null default 0,
  swept boolean not null default false,
  boss_defeated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, cycle_start)
);

/* ------------------------------------------------------------------ */
/*  Gamification                                                       */
/* ------------------------------------------------------------------ */

-- Catalog tables (global, read-only for clients).
create table public.quests (
  id text primary key,
  title text not null,
  description text not null,
  icon text not null default '🎯',
  kind text not null check (kind in ('weekly', 'boss')),
  metric text not null,
  target bigint not null,
  category_id text,
  reward_xp int not null
);

create table public.badges (
  id text primary key,
  name text not null,
  description text not null,
  emoji text not null,
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'legendary'))
);

create table public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quest_id text not null references public.quests (id),
  period_key text not null,
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, quest_id, period_key)
);

create table public.user_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id text not null references public.badges (id),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- Audit log of every XP gain. Written only by triggers / service role.
create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount int not null,
  reason text not null,
  ref_id text not null,
  date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, ref_id)
);

/* ------------------------------------------------------------------ */
/*  Row-level security — every table, no exceptions                    */
/* ------------------------------------------------------------------ */

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.income_entries enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_items enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.monthly_snapshots enable row level security;
alter table public.quests enable row level security;
alter table public.badges enable row level security;
alter table public.user_quests enable row level security;
alter table public.user_badges enable row level security;
alter table public.xp_events enable row level security;

-- Profiles: owner only (row is created by the signup trigger).
create policy "profiles select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Standard owner policies for user data tables.
create policy "categories all own" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "income all own" on public.income_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions all own" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring all own" on public.recurring_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals all own" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contributions all own" on public.goal_contributions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "snapshots all own" on public.monthly_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Catalogs: readable by any signed-in user; never writable from clients.
create policy "quests readable" on public.quests
  for select to authenticated using (true);
create policy "badges readable" on public.badges
  for select to authenticated using (true);

-- Claims & badges: readable by owner; writes go through the award-xp edge
-- function (service role) so completion is verified server-side.
create policy "user_quests select own" on public.user_quests
  for select using (auth.uid() = user_id);
create policy "user_badges select own" on public.user_badges
  for select using (auth.uid() = user_id);

-- XP audit log: owner can read, nobody can write from the client.
create policy "xp select own" on public.xp_events
  for select using (auth.uid() = user_id);

/* ------------------------------------------------------------------ */
/*  Server-side XP awarding                                            */
/* ------------------------------------------------------------------ */

-- Level thresholds mirror src/lib/gamification/levels.ts:
-- cumulative XP to reach level n = 50 * (n-1) * n.
create or replace function public.level_for_xp(total_xp int)
returns int
language sql immutable
as $$
  select coalesce(max(n), 1)
  from generate_series(1, 60) as n
  where 50 * (n - 1) * n <= total_xp
$$;

-- The one true way XP enters the system. SECURITY DEFINER so triggers can
-- write past RLS; unique (user_id, ref_id) makes every award idempotent.
create or replace function public.award_xp(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_ref_id text,
  p_date date
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.xp_events (user_id, amount, reason, ref_id, date)
  values (p_user_id, p_amount, p_reason, p_ref_id, p_date)
  on conflict (user_id, ref_id) do nothing;

  if found then
    update public.profiles
    set xp = xp + p_amount,
        level = public.level_for_xp(xp + p_amount)
    where id = p_user_id;
  end if;
end;
$$;

-- +10 XP for every logged expense (recurring materialisations included).
create or replace function public.xp_on_transaction()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.award_xp(new.user_id, 10, 'log_expense', new.id::text, new.date);
  return new;
end;
$$;

create trigger transactions_award_xp
  after insert on public.transactions
  for each row execute function public.xp_on_transaction();

-- +100 XP for every savings contribution, and keep the goal total in sync.
create or replace function public.xp_on_contribution()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.award_xp(new.user_id, 100, 'savings_contribution', new.id::text, new.date);
  update public.goals
  set saved_cents = saved_cents + new.amount_cents,
      achieved_at = case
        when achieved_at is null and saved_cents + new.amount_cents >= target_cents then now()
        else achieved_at
      end
  where id = new.goal_id and user_id = new.user_id;
  return new;
end;
$$;

create trigger contributions_award_xp
  after insert on public.goal_contributions
  for each row execute function public.xp_on_contribution();

/* ------------------------------------------------------------------ */
/*  New-user bootstrap: profile + default categories                   */
/* ------------------------------------------------------------------ */

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.categories (user_id, id, name, icon, color, bucket, is_fun_fund, sort_order)
  values
    (new.id, 'cat-housing',       'Housing',          '🏠', '#8B5CF6', 'need', false, 0),
    (new.id, 'cat-groceries',     'Groceries',        '🛒', '#A3E635', 'need', false, 1),
    (new.id, 'cat-transport',     'Transport / Fuel', '⛽', '#38BDF8', 'need', false, 2),
    (new.id, 'cat-medical',       'Medical Aid',      '🏥', '#F472B6', 'need', false, 3),
    (new.id, 'cat-insurance',     'Insurance',        '🛡️', '#94A3B8', 'need', false, 4),
    (new.id, 'cat-subscriptions', 'Subscriptions',    '📺', '#C084FC', 'need', false, 5),
    (new.id, 'cat-eating-out',    'Eating Out',       '🍔', '#FB923C', 'want', false, 6),
    (new.id, 'cat-date-nights',   'Date Nights',      '❤️', '#FF5C7A', 'want', true,  7),
    (new.id, 'cat-entertainment', 'Entertainment',    '🎮', '#22D3EE', 'want', false, 8),
    (new.id, 'cat-personal-care', 'Personal Care',    '💇', '#E879F9', 'want', false, 9),
    (new.id, 'cat-giving',        'Giving',           '🎁', '#FACC15', 'want', false, 10),
    (new.id, 'cat-other',         'Other',            '📦', '#A8A29E', 'want', false, 11);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
