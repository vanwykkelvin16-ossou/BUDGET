-- PennyPlay is free. Remove every payment gateway artifact and the
-- referral scheme that only existed to discount a paid plan.

-- Referral RPC first: it reads referrals + profiles.referred_by.
drop function if exists public.apply_referral_code(text);

-- Payment + referral tables. payfast_config held live merchant
-- credentials (merchant id, key, salt passphrase) — it must not survive.
drop table if exists public.payfast_config;
drop table if exists public.payments;
drop table if exists public.memberships;
drop table if exists public.referrals;

-- Referral code generator, now unreferenced.
drop function if exists public.generate_referral_code();

-- Referral columns on profiles.
alter table public.profiles
  drop column if exists referral_code,
  drop column if exists referred_by;
