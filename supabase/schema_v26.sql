-- Play Studio Manager — v26: upfront payments to teachers
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- Sometimes admin decides to pay a teacher for a lesson the student still
-- owes a replacement for (status 'missed-student'), before that replacement
-- has actually happened. This flag distinguishes that from a normal payment
-- for a completed ('attended') lesson, so the payment voucher can label it
-- clearly instead of it looking like a regular lesson payment.

alter table lessons add column if not exists is_upfront_payment boolean not null default false;
