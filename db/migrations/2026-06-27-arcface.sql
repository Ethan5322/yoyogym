-- Migration: high-accuracy ArcFace embeddings (InsightFace) — 2026-06-27
-- Apply to EACH gym's Supabase (SQL Editor → run). Idempotent & safe.
-- Stores the 512-D ArcFace embedding alongside the legacy 128-D face-api one.
-- Members re-enrol once on the new engine; matching uses cosine similarity.

alter table gym.members add column if not exists arcface_embedding jsonb;
