-- The app persists the profile with an upsert (insert … on conflict update).
-- Row-level security needs an INSERT policy for that even when the row
-- already exists (created by the handle_new_user trigger), otherwise every
-- profile save from the client fails with 403. Users may only ever insert
-- their own row.

create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);
