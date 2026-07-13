-- PennyPlay Plus memberships (R200/year, billed yearly) + persist the
-- sign-up identity onto the profile row at account creation.

-- 1) Memberships: one row per user, written only by the payfast-itn edge
--    function (service role). Clients may read their own row.
create table if not exists public.memberships (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  paid_until  date not null,
  payment_ref text not null default '',
  amount_cents integer not null default 20000,
  activated_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.memberships enable row level security;

create policy "memberships select own" on public.memberships
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: writes happen with the service role
-- inside the payment-confirmation edge function only.

-- 2) Sign-up identity: the Auth form sends name, surname, username and
--    phone as user metadata — copy it onto the profile at creation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, surname, username, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'surname', ''),
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  );

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
