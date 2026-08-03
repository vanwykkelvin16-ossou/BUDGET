-- Sign-up now also captures date of birth (used only to confirm the
-- account holder is 18 or older). Stored alongside the rest of the
-- identity fields captured at signup.

alter table public.profiles
  add column if not exists date_of_birth date;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  ref_code text := upper(coalesce(new.raw_user_meta_data ->> 'referred_by', ''));
  referrer uuid;
begin
  insert into public.profiles (id, display_name, surname, username, email, phone, date_of_birth, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'surname', ''),
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    public.generate_referral_code(),
    ref_code
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    surname = excluded.surname,
    username = excluded.username,
    email = excluded.email,
    phone = excluded.phone,
    date_of_birth = coalesce(excluded.date_of_birth, public.profiles.date_of_birth),
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
