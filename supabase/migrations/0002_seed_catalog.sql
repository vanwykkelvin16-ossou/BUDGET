-- Quest & badge catalogs. Mirrors src/lib/gamification/{quests,badges}.ts —
-- keep the two in sync when adding content.

insert into public.quests (id, title, description, icon, kind, metric, target, category_id, reward_xp)
values
  ('q-log-week', 'Log every expense for 7 days',
   'Open the app and log something every day this week.',
   '📝', 'weekly', 'log_days', 7, null, 150),
  ('q-eating-out', 'Keep Eating Out under R500',
   'Finish the week with less than R500 spent on Eating Out.',
   '🍔', 'weekly', 'category_under', 50000, 'cat-eating-out', 120),
  ('q-no-spend-weekend', 'No-spend weekend',
   'Get through Saturday and Sunday without spending a cent.',
   '🥷', 'weekly', 'no_spend_weekend', 2, null, 100),
  ('q-goal-500', 'Add R500 to a goal',
   'Contribute at least R500 to any savings goal this week.',
   '🎯', 'weekly', 'goal_contribution', 50000, null, 130),
  ('q-boss', 'Beat the Budget',
   'End the cycle with your savings target hit. Defeat the boss, claim the glory.',
   '🐲', 'boss', 'beat_budget', 100, null, 500)
on conflict (id) do nothing;

insert into public.badges (id, name, description, emoji, tier)
values
  ('first-save',     'First Save',          'Make your first goal contribution.',            '💰', 'bronze'),
  ('kickstart',      'Kickstart',           'Save your first R1 000.',                       '🌟', 'bronze'),
  ('sweeper',        'Sweep Machine',       'Sweep leftover Wants into Savings.',            '🧹', 'bronze'),
  ('streak-7',       '7-Day Streak',        'Log something 7 days in a row.',                '🔥', 'bronze'),
  ('streak-30',      'Monthly Flame',       'Keep a 30-day logging streak alive.',           '⚡', 'gold'),
  ('saved-10k',      'R10k Saved',          'Stack R10 000 into your goals.',                '🏆', 'gold'),
  ('date-night',     'Date Night Champion', 'Log five date nights. Romance, budgeted.',      '❤️', 'silver'),
  ('no-spend-ninja', 'No-Spend Ninja',      'Complete five no-spend days.',                  '🥷', 'silver'),
  ('side-hustle',    'Side-Hustle Hero',    'Log three extra income payments.',              '💼', 'silver'),
  ('boss-slayer',    'Boss Slayer',         'Beat the Budget — hit a cycle savings target.', '🐲', 'gold'),
  ('quest-addict',   'Quest Addict',        'Claim ten quest rewards.',                      '🎯', 'silver'),
  ('money-master',   'Money Master',        'Reach level 10.',                               '💎', 'gold'),
  ('rand-royalty',   'Rand Royalty',        'Reach level 20. Bow before the crown.',         '👑', 'legendary')
on conflict (id) do nothing;
