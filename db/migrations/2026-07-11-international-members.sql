-- Migration: international members — 2026-07-11
-- Apply to EACH gym's Supabase (SQL Editor → run). Idempotent & safe.
--
-- WHY: registration was South-Africa-only (SA ID, 4-digit postal, ZAR fees).
-- MuleSoo sells this system to gyms that take members from anywhere, so the
-- flow now asks NATIONALITY (which decides SA ID vs passport) and RESIDENCE
-- COUNTRY (which decides address format, phone dialling code, medical-aid
-- options and the currency prices are DISPLAYED in). Money is still charged in
-- ZAR — display_currency only drives the "≈ local amount" hint.
--
-- Codes are ISO-3166 alpha-2 (e.g. 'ZA', 'ET'); display_currency is ISO-4217
-- (e.g. 'ZAR', 'ETB', 'USD'). All nullable so existing SA members are untouched.

alter table gym.members add column if not exists nationality       text;  -- ISO-3166 alpha-2
alter table gym.members add column if not exists residence_country text;  -- ISO-3166 alpha-2
alter table gym.members add column if not exists display_currency  text;  -- ISO-4217

-- Backfill existing members as South African (the only market until now), so
-- their ID/address/currency continue to be treated exactly as before.
update gym.members
   set nationality = 'ZA'
 where nationality is null;
update gym.members
   set residence_country = 'ZA'
 where residence_country is null;
update gym.members
   set display_currency = 'ZAR'
 where display_currency is null;
