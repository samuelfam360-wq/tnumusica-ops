-- Play Studio Manager — v23: books & materials ordering
-- Run this in Supabase SQL Editor. Safe to run more than once (drops/recreates policies).

create table if not exists book_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  stock_on_hand int not null default 0,
  stock_on_order int not null default 0,
  created_at timestamptz default now()
);
alter table book_items enable row level security;
drop policy if exists "authenticated read book_items" on book_items;
create policy "authenticated read book_items" on book_items for select using (auth.role() = 'authenticated');
drop policy if exists "admin manage book_items" on book_items;
create policy "admin manage book_items" on book_items for all using (is_admin()) with check (is_admin());

-- One "cart" per submission. order_type='student' bills the student (via the
-- normal invoice engine) once given; 'teacher_personal' never bills anyone —
-- it's just a paper trail of what the teacher ordered for their own use.
create table if not exists book_orders (
  id uuid primary key default gen_random_uuid(),
  order_type text not null check (order_type in ('student','teacher_personal')),
  student_id uuid references students(id) on delete set null,
  teacher_id uuid not null references teachers(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz default now()
);
alter table book_orders enable row level security;
drop policy if exists "admin manage book_orders" on book_orders;
create policy "admin manage book_orders" on book_orders for all using (is_admin()) with check (is_admin());
drop policy if exists "teacher read own book_orders" on book_orders;
create policy "teacher read own book_orders" on book_orders for select using (teacher_id = my_teacher_id());
drop policy if exists "teacher insert own book_orders" on book_orders;
create policy "teacher insert own book_orders" on book_orders for insert with check (teacher_id = my_teacher_id());
drop policy if exists "teacher update own draft book_orders" on book_orders;
create policy "teacher update own draft book_orders" on book_orders for update
using (teacher_id = my_teacher_id() and status = 'draft')
with check (teacher_id = my_teacher_id());
drop policy if exists "teacher delete own draft book_orders" on book_orders;
create policy "teacher delete own draft book_orders" on book_orders for delete
using (teacher_id = my_teacher_id() and status = 'draft');

-- Per-item fulfillment status, independent per line so a cart with several
-- books can have some already given and others still on order.
create table if not exists book_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references book_orders(id) on delete cascade,
  book_item_id uuid references book_items(id) on delete set null,
  custom_name text,
  quantity int not null default 1,
  price numeric not null default 0,
  status text not null default 'requested' check (status in ('requested','ordered','received','given')),
  invoice_id uuid references invoices(id) on delete set null,
  created_at timestamptz default now()
);
alter table book_order_items enable row level security;
drop policy if exists "admin manage book_order_items" on book_order_items;
create policy "admin manage book_order_items" on book_order_items for all using (is_admin()) with check (is_admin());
drop policy if exists "teacher read own book_order_items" on book_order_items;
create policy "teacher read own book_order_items" on book_order_items for select using (
  exists (select 1 from book_orders bo where bo.id = order_id and bo.teacher_id = my_teacher_id())
);
drop policy if exists "teacher insert own draft book_order_items" on book_order_items;
create policy "teacher insert own draft book_order_items" on book_order_items for insert with check (
  exists (select 1 from book_orders bo where bo.id = order_id and bo.teacher_id = my_teacher_id() and bo.status = 'draft')
);
drop policy if exists "teacher update own draft book_order_items" on book_order_items;
create policy "teacher update own draft book_order_items" on book_order_items for update
using (exists (select 1 from book_orders bo where bo.id = order_id and bo.teacher_id = my_teacher_id() and bo.status = 'draft'))
with check (exists (select 1 from book_orders bo where bo.id = order_id and bo.teacher_id = my_teacher_id() and bo.status = 'draft'));
drop policy if exists "teacher delete own draft book_order_items" on book_order_items;
create policy "teacher delete own draft book_order_items" on book_order_items for delete
using (exists (select 1 from book_orders bo where bo.id = order_id and bo.teacher_id = my_teacher_id() and bo.status = 'draft'));
