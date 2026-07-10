-- Personalisable Fun Fund: users name the fund and describe what it's for.

alter table public.profiles
  add column fun_fund_name text not null default 'date nights',
  add column fun_fund_note text not null default 'Fun Fund';
