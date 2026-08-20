-- Play Studio Manager — v13: per-level pricing for courses
-- Run this AFTER schema.sql through schema_v12.sql, in Supabase SQL Editor.

alter table course_levels add column if not exists default_price numeric;
