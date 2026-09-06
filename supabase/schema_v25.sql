-- Play Studio Manager — v25: cancellation requests for in-progress orders
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- The existing "teacher cancel own submitted book_orders" policy only lets a
-- teacher cancel outright while every item is still untouched. For orders
-- already in progress, a teacher can now flag a cancellation *request*
-- instead — the order stays 'submitted' and admin approves or dismisses it.

alter table book_orders add column if not exists cancel_requested boolean not null default false;
alter table book_orders add column if not exists cancel_reason text;

drop policy if exists "teacher request cancel own submitted book_orders" on book_orders;
create policy "teacher request cancel own submitted book_orders" on book_orders for update
using (teacher_id = my_teacher_id() and status = 'submitted')
with check (teacher_id = my_teacher_id() and status = 'submitted');
