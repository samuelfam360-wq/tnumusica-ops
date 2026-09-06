-- Play Studio Manager — v35: durable trial-lesson marker + pay-category label
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- is_trial lives on the STUDENT, and gets cleared to false once a trial
-- resolves into a real enrollment — so by the time payments/reports look
-- back at that lesson, there's no way to tell it was ever a trial. This
-- column marks the trial lesson itself, permanently, at creation time.
alter table lessons add column if not exists is_trial_lesson boolean not null default false;
