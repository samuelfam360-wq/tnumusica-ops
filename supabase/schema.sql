-- Play Studio Manager — database schema for Supabase
-- Run this in Supabase: Project > SQL Editor > New query > paste all > Run

create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','teacher')),
  created_at timestamptz default now()
);

create table teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  pay_type text not null check (pay_type in ('flat','percent')),
  rate numeric not null default 0,
  created_at timestamptz default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  created_at timestamptz default now()
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time not null,
  teacher_id uuid not null references teachers(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  price numeric not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled','attended','missed-teacher','missed-student','rescheduled')),
  reason text,
  paid boolean not null default false,
  replacement_of uuid references lessons(id) on delete set null,
  created_at timestamptz default now()
);

create table blocked_dates (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz default now()
);

-- Row level security

alter table profiles enable row level security;
alter table teachers enable row level security;
alter table students enable row level security;
alter table lessons enable row level security;
alter table blocked_dates enable row level security;

create or replace function is_admin() returns boolean as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer stable;

create or replace function my_teacher_id() returns uuid as $$
  select id from teachers where user_id = auth.uid();
$$ language sql security definer stable;

-- profiles
create policy "read own profile" on profiles for select using (id = auth.uid());
create policy "admin read all profiles" on profiles for select using (is_admin());
create policy "admin manage profiles" on profiles for all using (is_admin()) with check (is_admin());

-- teachers
create policy "authenticated read teachers" on teachers for select using (auth.role() = 'authenticated');
create policy "admin insert teachers" on teachers for insert with check (is_admin());
create policy "admin update teachers" on teachers for update using (is_admin());
create policy "admin delete teachers" on teachers for delete using (is_admin());

-- students
create policy "authenticated read students" on students for select using (auth.role() = 'authenticated');
create policy "admin insert students" on students for insert with check (is_admin());
create policy "admin update students" on students for update using (is_admin());
create policy "admin delete students" on students for delete using (is_admin());

-- lessons
create policy "authenticated read lessons" on lessons for select using (auth.role() = 'authenticated');
create policy "admin insert lessons" on lessons for insert with check (is_admin());
create policy "admin update lessons" on lessons for update using (is_admin());
create policy "teacher update own lessons" on lessons for update using (teacher_id = my_teacher_id());
create policy "admin delete lessons" on lessons for delete using (is_admin());

-- a teacher may only ever change status/reason on their own lesson rows, never price/paid/date/who
create or replace function restrict_teacher_lesson_update() returns trigger as $$
begin
  if not is_admin() then
    if NEW.price is distinct from OLD.price
       or NEW.paid is distinct from OLD.paid
       or NEW.teacher_id is distinct from OLD.teacher_id
       or NEW.student_id is distinct from OLD.student_id
       or NEW.date is distinct from OLD.date
       or NEW.time is distinct from OLD.time then
      raise exception 'Teachers can only update lesson status and reason';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger lessons_teacher_update_guard before update on lessons
for each row execute function restrict_teacher_lesson_update();

-- blocked_dates
create policy "authenticated read blocked_dates" on blocked_dates for select using (auth.role() = 'authenticated');
create policy "admin manage blocked_dates" on blocked_dates for all using (is_admin()) with check (is_admin());
create policy "teacher insert own blocked_dates" on blocked_dates for insert with check (teacher_id = my_teacher_id());
create policy "teacher delete own blocked_dates" on blocked_dates for delete using (teacher_id = my_teacher_id());
