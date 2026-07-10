-- Sign-up captures the full identity: surname, username, email and phone
-- live on the profile alongside the first name (display_name).

alter table public.profiles
  add column surname text not null default '',
  add column username text not null default '',
  add column email text not null default '',
  add column phone text not null default '';
