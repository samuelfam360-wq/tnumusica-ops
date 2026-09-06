-- Play Studio Manager — v24: reject (admin) and cancel (teacher) for book orders
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- These are new terminal statuses, not deletions — the order/item stays in
-- place so both sides can still see what happened to it.

alter table book_orders drop constraint if exists book_orders_status_check;
alter table book_orders add constraint book_orders_status_check check (status in ('draft','submitted','cancelled'));
alter table book_orders add column if not exists note text;

alter table book_order_items drop constraint if exists book_order_items_status_check;
alter table book_order_items add constraint book_order_items_status_check check (status in ('requested','ordered','received','given','rejected'));
alter table book_order_items add column if not exists note text;

-- A teacher can cancel their own SUBMITTED order — but only while every item
-- on it is still untouched ('requested'). Once admin has started acting on
-- any item (ordered/received/given/rejected), it's too late to unilaterally
-- cancel; that has to go through admin instead.
drop policy if exists "teacher cancel own submitted book_orders" on book_orders;
create policy "teacher cancel own submitted book_orders" on book_orders for update
using (
  teacher_id = my_teacher_id() and status = 'submitted'
  and not exists (select 1 from book_order_items boi where boi.order_id = book_orders.id and boi.status <> 'requested')
)
with check (teacher_id = my_teacher_id() and status = 'cancelled');
