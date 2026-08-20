-- Play Studio Manager — v8: cross-teacher cover requests, richer teacher self-service,
-- and a course/instrument catalog
-- Run this AFTER schema.sql through schema_v7.sql, in Supabase SQL Editor.

alter table lessons drop constraint if exists lessons_status_check;
alter table lessons add constraint lessons_status_check
  check (status in ('scheduled','attended','absent','needs-cover','missed-teacher','missed-student','rescheduled','cancelled'));

-- Let any teacher claim a lesson that's open for cover.
drop policy if exists "teacher claim open cover" on lessons;
create policy "teacher claim open cover" on lessons for update using (status = 'needs-cover');

-- Let teachers delete (remove) their own lesson rows.
drop policy if exists "teacher delete own lessons" on lessons;
create policy "teacher delete own lessons" on lessons for delete using (teacher_id = my_teacher_id());

-- Teachers may now also edit date/time/duration/instrument/room/status/reason on
-- their own lessons (covers Reschedule/Edit/Cancel from their side) — but never
-- price, payment status, or who the lesson belongs to. The one exception is
-- claiming an open needs-cover lesson, where changing teacher_id to themselves
-- is allowed instead.
create or replace function restrict_teacher_lesson_update() returns trigger as $$
begin
  if not is_admin() then
    if OLD.status = 'needs-cover' and NEW.status = 'scheduled' and NEW.teacher_id is distinct from OLD.teacher_id then
      if NEW.price is distinct from OLD.price
         or NEW.paid is distinct from OLD.paid
         or NEW.student_id is distinct from OLD.student_id
         or NEW.date is distinct from OLD.date
         or NEW.time is distinct from OLD.time
         or NEW.duration_min is distinct from OLD.duration_min then
        raise exception 'Claiming a cover lesson can only change status and teacher';
      end if;
    else
      if NEW.price is distinct from OLD.price
         or NEW.paid is distinct from OLD.paid
         or NEW.teacher_id is distinct from OLD.teacher_id
         or NEW.student_id is distinct from OLD.student_id then
        raise exception 'Teachers cannot change price, payment status, teacher, or student on a lesson';
      end if;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

-- Course / instrument catalog, used as a preset list across students, teachers, and rates
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_price numeric,
  created_at timestamptz default now()
);

alter table courses enable row level security;
create policy "authenticated read courses" on courses for select using (auth.role() = 'authenticated');
create policy "admin manage courses" on courses for all using (is_admin()) with check (is_admin());
