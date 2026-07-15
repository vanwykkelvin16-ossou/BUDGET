-- Apply a friend's referral code after sign-up (or from the Plus page).
-- Credits the referrer, stores referred_by on the caller's profile, and
-- unlocks the R50 first-year discount for the caller.

create or replace function public.apply_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  clean text := upper(trim(coalesce(p_code, '')));
  referrer uuid;
  already text;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in required');
  end if;

  if length(clean) < 4 then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid referral code');
  end if;

  select referred_by into already from public.profiles where id = caller;
  if coalesce(already, '') <> '' then
    -- Already attributed — keep the discount unlockable.
    return jsonb_build_object('ok', true, 'code', already, 'already', true);
  end if;

  select id into referrer
  from public.profiles
  where referral_code = clean and id <> caller
  limit 1;

  if referrer is null then
    return jsonb_build_object('ok', false, 'error', 'That referral code was not found');
  end if;

  update public.profiles
  set referred_by = clean
  where id = caller and coalesce(referred_by, '') = '';

  insert into public.referrals (referred_user_id, referrer_user_id, code)
  values (caller, referrer, clean)
  on conflict (referred_user_id) do nothing;

  return jsonb_build_object('ok', true, 'code', clean);
end;
$$;

revoke all on function public.apply_referral_code(text) from public;
grant execute on function public.apply_referral_code(text) to authenticated;

-- Ensure memberships + referrals exist even if earlier migrations lagged on a remote.
create table if not exists public.memberships (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  paid_until   date not null,
  payment_ref  text not null default '',
  amount_cents integer not null default 20000,
  activated_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.memberships enable row level security;

drop policy if exists "memberships select own" on public.memberships;
create policy "memberships select own" on public.memberships
  for select using (auth.uid() = user_id);

alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by text not null default '';

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code)
  where referral_code is not null;

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

create table if not exists public.referrals (
  referred_user_id uuid primary key references auth.users (id) on delete cascade,
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  code             text not null,
  created_at       timestamptz not null default now()
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id);

alter table public.referrals enable row level security;

drop policy if exists "referrals select own" on public.referrals;
create policy "referrals select own" on public.referrals
  for select using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

-- Keep sign-up attribution in sync with the Plus referral model.
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
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    surname = excluded.surname,
    username = excluded.username,
    email = excluded.email,
    phone = excluded.phone,
    referral_code = coalesce(public.profiles.referral_code, excluded.referral_code),
    referred_by = case
      when coalesce(public.profiles.referred_by, '') = '' then excluded.referred_by
      else public.profiles.referred_by
    end;

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
    (new.id, 'cat-other',         'Other',            '📦', '#A8A29E', 'want', false, 11)
  on conflict do nothing;

  return new;
end;
$$;
