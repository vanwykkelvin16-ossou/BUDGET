-- Sign-up captures date of birth (used only to confirm the account holder
-- is 18 or older). Also drops all referral logic from the signup trigger:
-- the app is free, so there is nothing to refer anyone for.

alter table public.profiles
  add column if not exists date_of_birth date;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, surname, username, email, phone, date_of_birth)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'surname', ''),
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
  )
  on conflict (id) do update set
    display_name  = excluded.display_name,
    surname       = excluded.surname,
    username      = excluded.username,
    email         = excluded.email,
    phone         = excluded.phone,
    date_of_birth = coalesce(excluded.date_of_birth, public.profiles.date_of_birth);

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
