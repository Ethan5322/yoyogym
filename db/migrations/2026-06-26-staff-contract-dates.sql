-- Migration: staff employment contract dates — 2026-06-26
-- Paste into each gym's Supabase SQL Editor → Run. Idempotent & safe.
alter table gym.admin_users add column if not exists contract_start date;
alter table gym.admin_users add column if not exists contract_end   date;
