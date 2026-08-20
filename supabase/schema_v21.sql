-- Play Studio Manager — v21: fix "Claim this" in Open for Cover
-- Run this in Supabase SQL Editor. Safe to run more than once.
--
-- Bug: claiming a needs-cover lesson updates teacher_id + status on a lesson
-- that isn't the claiming teacher's own row. Two things were blocking it:
--   1. "teacher update own lessons" only allows a teacher to update a lesson
--      that is ALREADY theirs — a claim is, by definition, someone else's row.
--   2. The update trigger below flatly rejects any teacher_id change from a
--      non-admin, with no exception for claiming.
-- This adds a narrow RLS policy plus a matching trigger exception, scoped
-- specifically to "row was needs-cover, becomes scheduled under the claiming
-- teacher" — nothing else a teacher can already do is loosened.

create policy "teacher claim needs-cover lessons" on lessons for update
using (status = 'needs-cover')
with check (status = 'scheduled' and teacher_id = my_teacher_id());

create or replace function restrict_teacher_lesson_update() returns trigger as $$
begin
  if not is_admin() then
    if NEW.teacher_id is distinct from OLD.teacher_id then
      if not (OLD.status = 'needs-cover' and NEW.status = 'scheduled') then
        raise exception 'Teachers can only update lesson status and reason';
      end if;
    end if;
    if NEW.price is distinct from OLD.price
       or NEW.paid is distinct from OLD.paid
       or NEW.student_id is distinct from OLD.student_id
       or NEW.date is distinct from OLD.date
       or NEW.time is distinct from OLD.time then
      raise exception 'Teachers can only update lesson status and reason';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;
