-- Play Studio Manager — v19: children vs adult pricing per level
-- Run this in Supabase SQL Editor. Safe to run more than once.

alter table course_levels add column if not exists default_price_child numeric;
alter table course_levels add column if not exists default_price_adult numeric;

-- Seed the new columns from the old single price so nothing looks empty
-- right after migrating — edit them apart afterwards as needed.
update course_levels
set default_price_child = coalesce(default_price_child, default_price),
    default_price_adult = coalesce(default_price_adult, default_price)
where default_price is not null;

alter table students add column if not exists age_group text check (age_group in ('child','adult'));
