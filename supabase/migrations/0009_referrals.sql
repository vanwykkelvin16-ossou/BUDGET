-- Give PennyPlay, get R50: referral codes, the referrals ledger, and the
-- sign-up hook that credits the referrer when a friend actually signs up.

-- 1) Codes on the profile.
alter table public.profiles
  add column if not exists referral_code text unique,
  add column if not exists referred_by text not null default '';

-- Backfill codes for existing users (6 chars, unambiguous alphabet).
create or replace function public.generate_referral_code()
returns text
language sql volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32))::int + 1, 1),
    ''
  )
  from generate_series(1, 6);
$$;

update public.profiles
set referral_code = public.generate_referral_code()
where referral_code is null;

-- 2) One row per successful referral: friend signed up on my link.
create table if not exists public.referrals (
  referred_user_id uuid primary key references auth.users (id) on delete cascade,
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  code             text not null,
  created_at       timestamptz not null default now()
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id);

alter table public.referrals enable row level security;

create policy "referrals select own" on public.referrals
  for select using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);
-- No client writes: rows are created by handle_new_user (security definer).

-- 3) Sign-up hook: assign a code, persist identity, and credit the referrer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  ref_code text := upper(coalesce(new.raw_user_meta_data ->> 'referred_by', ''));
  referrer uuid;
begin
  insert into public.profiles (id, display_name, surname, username, email, phone, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'surname', ''),
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    public.generate_referral_code(),
    ref_code
  );

  -- Friend signed up on a share link → credit the code's owner (never
  -- yourself, one credit row per new account).
  if ref_code <> '' then
    select id into referrer from public.profiles
    where referral_code = ref_code and id <> new.id
    limit 1;
    if referrer is not null then
      insert into public.referrals (referred_user_id, referrer_user_id, code)
      values (new.id, referrer, ref_code)
      on conflict (referred_user_id) do nothing;
    end if;
  end if;

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
