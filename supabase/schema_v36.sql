-- Play Studio Manager — v36: let teachers insert their own replacement lessons
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- The original schema only ever granted INSERT on lessons to admins
-- ("admin insert lessons"). Teachers were never given a way to insert a
-- row at all — only to update one that already exists. That's invisible
-- for most of the app (admin creates everything up front), but two
-- teacher-portal actions insert a brand-new lesson row directly: arranging
-- their own replacement for a missed lesson, and filling an open
-- (holiday-freed) slot with their own owed makeup. Both were silently
-- failing — the database rejected the insert, nothing checked for the
-- error, and the screen behaved as if it had worked.
drop policy if exists "teacher insert own lessons" on lessons;
create policy "teacher insert own lessons" on lessons
  for insert with check (teacher_id = my_teacher_id());
