-- 2026-09-28 — where each gym's cover picture lives (CLAUDE.md §38.1 Q5).
--
-- A PUBLIC bucket: every member's app shows its gym's picture, and a public
-- URL is fast and cached by phones. Only the server writes to it, through
-- one-time upload links it signs itself (the same pattern as the private
-- `gym-applications` bucket for owner documents). Images only, 2 MB at most.
--
-- Nothing private is ever stored here: it holds what a gym chooses to show the
-- world — its cover picture and logo. Member photos and face data are NOT
-- here, and their storage is still undecided (§30).
--
-- Idempotent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-branding', 'gym-branding', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
