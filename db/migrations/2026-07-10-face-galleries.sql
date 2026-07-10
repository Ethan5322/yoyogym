-- Migration: multi-template face galleries — 2026-07-10
-- Apply to EACH gym's Supabase (SQL Editor → run). Idempotent & safe.
--
-- WHY: a single stored face template freezes one look (one hairstyle, one beard,
-- one face of makeup). When the person changes, their new embedding drifts off
-- that frozen point and a strict threshold locks them out. These columns hold a
-- GALLERY of templates per person — several looks captured at enrolment, plus
-- new looks learned automatically on high-confidence logins — so matching scores
-- against the closest stored look instead of a single frozen one.
--
-- Each gallery is a JSON array of { "v": number[], "src": "enrol"|"adaptive",
-- "at": iso8601 }. The legacy single-vector columns are kept in step (their
-- first template) so an un-migrated read path still works.

-- Members: 512-D ArcFace gallery + 128-D face-api gallery.
alter table gym.members add column if not exists arcface_templates jsonb;
alter table gym.members add column if not exists face_templates    jsonb;

-- Admin users: face-login gallery (both engines).
alter table gym.admin_users add column if not exists face_templates    jsonb;
alter table gym.admin_users add column if not exists arcface_embedding  jsonb;
alter table gym.admin_users add column if not exists arcface_templates  jsonb;

-- Trainers: turnstile-recognition gallery (both engines).
alter table gym.trainers add column if not exists face_templates    jsonb;
alter table gym.trainers add column if not exists arcface_embedding  jsonb;
alter table gym.trainers add column if not exists arcface_templates  jsonb;

-- Backfill: seed each gallery from the existing single template so members and
-- staff enrolled before this migration match immediately, before their next
-- scan tops the gallery up. Wrapped as [{ v, src:'enrol' }].
update gym.members
   set arcface_templates = jsonb_build_array(jsonb_build_object('v', arcface_embedding, 'src', 'enrol'))
 where arcface_embedding is not null and arcface_templates is null;
update gym.members
   set face_templates = jsonb_build_array(jsonb_build_object('v', face_descriptor, 'src', 'enrol'))
 where face_descriptor is not null and face_templates is null;

update gym.admin_users
   set face_templates = jsonb_build_array(jsonb_build_object('v', face_descriptor, 'src', 'enrol'))
 where face_descriptor is not null and face_templates is null;

update gym.trainers
   set face_templates = jsonb_build_array(jsonb_build_object('v', face_descriptor, 'src', 'enrol'))
 where face_descriptor is not null and face_templates is null;
