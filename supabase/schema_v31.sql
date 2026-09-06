-- Play Studio Manager — v31: instrument tag on the book/materials catalog
-- Run this in Supabase SQL Editor. Safe to run more than once.

alter table book_items add column if not exists instrument text;
