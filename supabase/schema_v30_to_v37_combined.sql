-- Play Studio Manager — combined catch-up: schema_v30 through schema_v37
-- Run this once in Supabase SQL Editor. Every statement in here is safe to
-- run again even if some of it was already applied — each uses IF NOT
-- EXISTS / DROP-then-CREATE, so nothing gets duplicated or overwritten
-- destructively. This exists because is_extra (schema_v33) was found to
-- have never been applied, which strongly suggests other migrations in
-- this range may have been missed too — safest to just run all of them.

-- ===== schema_v30.sql =====
-- Play Studio Manager — v30: prevent duplicate lesson rows at the database level
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- Why this exists: v29 fixed one specific cause of duplicate lessons (two live
-- deployments both running the auto-top-up on the same day). But that only
-- closes that one path — any other bug, retry, or race condition that inserts
-- the same lesson twice would still get through, because nothing in the
-- database itself was stopping it. This adds that stop: a partial unique index
-- so the database rejects a second "live" lesson for the same
-- student + teacher + date + time + instrument, no matter what code path
-- tried to create it. Cancelled and rescheduled rows are excluded on purpose —
-- those are meant to sit alongside a replacement in the same slot.
--
-- IMPORTANT: run the cleanup in the app's Health Check tab ("Duplicate lesson
-- rows") FIRST, before running this — if any duplicates still exist in the
-- table, this index creation will fail until they're removed.

create unique index if not exists lessons_no_duplicates
  on lessons (student_id, teacher_id, date, time, coalesce(instrument, ''))
  where status not in ('cancelled', 'rescheduled');

-- ===== schema_v31.sql =====
-- Play Studio Manager — v31: instrument tag on the book/materials catalog
-- Run this in Supabase SQL Editor. Safe to run more than once.

alter table book_items add column if not exists instrument text;

-- ===== schema_v32.sql =====
-- Play Studio Manager — v32: trial lessons + temporary-stop tracking
-- Run this in Supabase SQL Editor. Safe to run more than once.

-- Per-lesson trial pricing by grade/level, separate from the existing
-- default_price_child/adult (which are monthly-rate suggestions). A trial
-- is always a one-off, so it needs its own per-lesson figure.
alter table course_levels add column if not exists trial_price_child numeric;
alter table course_levels add column if not exists trial_price_adult numeric;

-- Marks a student record created from the Trial Lesson form, so they can be
-- told apart from a regular enrolled student (e.g. excluded from normal
-- health checks expecting a full weekly schedule).
alter table students add column if not exists is_trial boolean not null default false;

-- Remembers the month a "Temporary stop" took effect, so Resume can default
-- sensibly and the student's profile can show why their schedule is empty.
alter table students add column if not exists paused_from date;

-- ===== schema_v33.sql =====
-- Play Studio Manager — v33: extra (one-off, per-lesson) classes
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- An "extra class" is a genuinely additional lesson for an already-enrolled
-- student — outside their usual weekly schedule, billed separately per
-- lesson even if their regular course is billed monthly. Without a flag,
-- effectiveLessonPrice() would see it as just another lesson under the same
-- instrument that month and fold it into the monthly-fee split, silently
-- diluting the value of every other lesson that month. is_extra keeps it
-- out of that split entirely — it's always priced from its own stored
-- price, and it's excluded from other lessons' sibling count too.

alter table lessons add column if not exists is_extra boolean not null default false;

-- ===== schema_v34.sql =====
-- Play Studio Manager — v34: let teachers actually adjust their own lesson times
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- Bug: the teacher-update guard trigger (restrict_teacher_lesson_update)
-- has always rejected any change to a lesson's date or time from a non-admin,
-- raising "Teachers can only update lesson status and reason" — even for a
-- teacher editing their OWN lesson via the app's own "Adjust time" button.
-- That button (and the self-reschedule flow it powers) was built assuming
-- this was allowed; it never was, and the failure was silent because the
-- app code didn't check for the error either (fixed separately in-app).
--
-- This widens the trigger to allow date/time changes, but only for a
-- teacher's own lesson (RLS already restricts updates to teacher_id =
-- my_teacher_id(), so this can't be used to move someone else's lesson).
-- Everything else stays exactly as restrictive as before: price, paid,
-- student_id, and teacher_id (outside the existing needs-cover-claim
-- exception) remain admin-only.

create or replace function restrict_teacher_lesson_update() returns trigger as $$
begin
  if not is_admin() then
    if NEW.teacher_id is distinct from OLD.teacher_id then
      if not (OLD.status = 'needs-cover' and NEW.status = 'scheduled') then
        raise exception 'Teachers can only update lesson status, reason, date, and time';
      end if;
    end if;
    if NEW.price is distinct from OLD.price
       or NEW.paid is distinct from OLD.paid
       or NEW.student_id is distinct from OLD.student_id then
      raise exception 'Teachers can only update lesson status, reason, date, and time';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

-- ===== schema_v35.sql =====
-- Play Studio Manager — v35: durable trial-lesson marker + pay-category label
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- is_trial lives on the STUDENT, and gets cleared to false once a trial
-- resolves into a real enrollment — so by the time payments/reports look
-- back at that lesson, there's no way to tell it was ever a trial. This
-- column marks the trial lesson itself, permanently, at creation time.
alter table lessons add column if not exists is_trial_lesson boolean not null default false;

-- ===== schema_v36.sql =====
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

-- ===== schema_v37.sql =====
-- Play Studio Manager — v37: add a 'staff' role (limited-scope admin)
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- 'staff' is for someone who mostly contacts parents, arranges
-- replacements, adds students, and updates student data — the same daily
-- work as the Master account, but they only need Calendar, Teachers,
-- Students, Courses, and Replacements, not Payments, Settings, Health
-- Check, Invoices, Materials, or Reports.
--
-- IMPORTANT — the security model here is simple by design: 'staff' is
-- granted the exact same database permissions as 'admin' (is_admin() below
-- returns true for both), so every existing admin-only policy on every
-- table — including ones this role's screens never touch, like payments —
-- already works for them with zero new policies to write or maintain. The
-- actual restriction is enforced by the app only showing them five tabs,
-- not by the database. That's the right tradeoff for a trusted staff
-- member doing front-desk work, not for an account you don't fully trust —
-- if that's ever a concern, this needs real table-level RLS scoping
-- instead, which is a bigger change than this migration makes.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin','teacher','staff'));
alter table profiles add column if not exists name text;

create or replace function is_admin() returns boolean as $$
  select exists(select 1 from profiles where id = auth.uid() and role in ('admin','staff'));
$$ language sql security definer stable;

