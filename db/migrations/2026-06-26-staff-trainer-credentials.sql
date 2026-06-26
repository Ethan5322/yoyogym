-- Migration: staff & trainer credentials (ID card + face + verify QR) — 2026-06-26
-- Apply to EACH existing gym's Supabase (SQL Editor → run). Idempotent & safe.
-- New tenants get these from db/schema.sql automatically.

-- Staff (admin_users) credential fields
alter table gym.admin_users add column if not exists staff_number      text;
alter table gym.admin_users add column if not exists verification_code text;
alter table gym.admin_users add column if not exists job_title         text;
alter table gym.admin_users add column if not exists phone             text;
alter table gym.admin_users add column if not exists photo_url         text;
-- unique staff numbers (allows many NULLs)
create unique index if not exists admin_users_staff_number_key on gym.admin_users(staff_number) where staff_number is not null;

-- Trainer credential fields (photo_url/face_descriptor already exist)
alter table gym.trainers add column if not exists photo_url         text;
alter table gym.trainers add column if not exists trainer_number    text;
alter table gym.trainers add column if not exists verification_code text;
create unique index if not exists trainers_trainer_number_key on gym.trainers(trainer_number) where trainer_number is not null;
