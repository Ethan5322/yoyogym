---
aliases: ["Confirmed Existing Features", "Feature Inventory"]
tags: [existing-system, inventory]
stage: "Stage 2"
status: complete
updated: 2026-09-21
---

# 02 — Confirmed Existing Features

The feature inventory of the single-gym system, at the granularity needed to decide subscription
tiers ([[11 - Subscription Decisions]]) and to know what a tenant inherits
([[06 - Tenant Architecture]]). Detail and evidence live in [[01 - Existing Yoyo Gym Audit]].

Markers: **[C]** confirmed · **[P]** partial · **[M]** missing · **[?]** unclear.

## Public / member-facing

| Feature | Status | Notes |
|---|---|---|
| Splash / landing with QR source tracking | **[C]** | `/?src=qr` logs to `qr_scan_analytics` |
| Registration chatbot, 38 steps | **[C]** | Rule-based, not AI |
| Server-side validation + server-side pricing | **[C]** | Client amounts never trusted |
| PAR-Q health screening + medical-clearance flag | **[C]** | 7 questions → `parq_flag` |
| Indemnity + contract agreement with signature | **[C]** | Both required to register |
| Face enrolment during registration | **[C]** | Optional; ID photo required either way |
| ID photo (scan **or** gallery upload) | **[C]** | Every card must carry a photo (Q-25) |
| Member login (membership number + phone) | **[C]** | No password, no email login |
| Member face login | **[C]** | ArcFace path or face-api fallback |
| Member portal — 6 tabs | **[C]** | Status, Check-in, Classes, Progress, History, Contact |
| Self check-in | **[C]** | Blocks inactive members, prevents duplicates |
| Class browse + book + cancel | **[C]** | Tier eligibility, capacity, waitlist, 2h cancel flag |
| Progress tracking | **[C]** | `progress_entries` |
| Attendance + booking history | **[C]** | Includes trainer workout notes |
| Two-way messaging with management | **[C]** | Threaded, email-notified |
| Announcements / gym news | **[C]** | Published by admin |
| Self-service profile edit | **[C]** | Contact details only |
| Pay outstanding balance online | **[C]** | `/api/member/pay` |
| Request plan change | **[C]** | Request only — members never self-bill |
| Refer a friend | **[C]** | `referrals` + admin alert |
| Face re-enrolment (self-service) | **[C]** | "Update scan" |
| Data-deletion request | **[P]** | Flags the record; erasure is manual |
| Public profile page | **[C]** | `/p/:type/:key` for member and trainer |
| Installable PWA | **[C]** | Network-first SW, `start_url: /member` |
| Member WhatsApp notifications | **[M]** | CallMeBot is owner-only |
| Member password / email login | **[M]** | By design |
| AI conversational registration | **[P]** | Documented seam, scripted today |

## Staff / admin-facing

| Feature | Status | Roles |
|---|---|---|
| Admin login + lockout + 8h session | **[C]** | all |
| Admin face login | **[C]** | all |
| Self-service password change | **[C]** | all |
| Dashboard with deep links into filtered queues | **[C]** | owner, manager |
| Member verification (code or number) with auto check-in | **[C]** | + reception |
| Biometric turnstile / face scan | **[C]** | + reception |
| Live attendance board (~30s poll) | **[C]** | + reception |
| Visitor day passes | **[C]** | + reception |
| Incident logging + owner alert | **[C]** | + reception |
| Member list: search, status/tier/PAR-Q filters, pagination | **[C]** | owner, manager |
| Member 360 detail + quick actions | **[C]** | owner, manager |
| Manual member registration | **[C]** | + reception |
| CSV member import | **[C]** | owner, manager |
| CSV export (members, payments, audit) | **[C]** | owner, manager |
| Class CRUD, bookings, waitlist promote, attended/no-show | **[C]** | owner, manager |
| Trainer CRUD + credentials | **[C]** | owner, manager |
| PT session logging + workout notes | **[C]** | + trainer (own only) |
| Payments list, breakdown, manual cash/EFT capture | **[C]** | owner, manager |
| AR aging buckets + dunning email | **[C]** | owner, manager |
| Receipts (A4 branded PDF) | **[C]** | owner, manager |
| Analytics: check-ins, tier mix, churn, peak hours, revenue | **[C]** | owner, manager |
| Board report PDF | **[C]** | owner, manager |
| Calendar events + blocked days | **[C]** | owner, manager |
| Bulk email broadcast by filter | **[C]** | owner, manager |
| Notification history | **[C]** | owner, manager |
| Announcements | **[C]** | owner, manager |
| Admin inbox + threaded replies + unread badge | **[C]** | owner, manager |
| Audit log with search/category/date + CSV | **[C]** | owner, manager |
| QR code generation + scan analytics | **[C]** | owner, manager |
| Catalog: plans + add-on services CRUD | **[C]** | owner, manager |
| Gym settings + branding | **[C]** | **owner only** |
| Staff accounts: create, disable, reset, delete | **[C]** | **owner only** |
| Staff/trainer ID cards + credential + contract PDFs | **[C]** | owner only |
| 2FA | **[M]** | Explicitly deferred |
| Staff on the door face scanner | **[M]** | Member + trainer only (Q-29) |

## Automation

| Job | Scheduled? | Notes |
|---|---|---|
| `daily` orchestrator (06:00) | **[C]** yes | Runs the rest in isolated sequence |
| `daily-summary` (20:00) | **[C]** yes | Owner summary |
| `weekly-schedule` (Mon 07:00) | **[C]** yes | Class schedule email |
| `billing`, `expiry`, `retry-suspend`, `reengagement`, `class-reminders`, `attendance-alerts` | **[P]** | Written and callable, but ride the daily orchestrator — plan-limit driven |

## Cross-cutting

Notification channels (Brevo email, CallMeBot WhatsApp/Telegram) with full send logging **[C]** ·
dynamic white-label branding from `settings` **[C]** · rate limiting **[C]** · error capture **[C]** ·
audit trail **[C]** · 42 passing unit tests **[C]** · GitHub Actions CI **[C]** ·
integration/E2E tests **[M]**.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[03 - Protected Existing Functions]] ·
[[11 - Subscription Decisions]] · [[17 - Open Questions]] · [[18 - Decision Log]]
