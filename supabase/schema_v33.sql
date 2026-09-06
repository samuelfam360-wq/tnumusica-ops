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
