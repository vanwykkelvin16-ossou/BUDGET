-- Let signed-in users persist quest claims and earned badges from the client.
-- XP amounts still flow through award_xp (triggers + edge function); these
-- tables record durable progress the UI reloads from.

create policy "user_quests insert own" on public.user_quests
  for insert with check (auth.uid() = user_id);

create policy "user_quests update own" on public.user_quests
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_quests delete own" on public.user_quests
  for delete using (auth.uid() = user_id);

create policy "user_badges insert own" on public.user_badges
  for insert with check (auth.uid() = user_id);

create policy "user_badges delete own" on public.user_badges
  for delete using (auth.uid() = user_id);
