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
