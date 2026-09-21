---
aliases: ["Authentication and Roles", "Auth and RBAC"]
tags: [auth, rbac, security, existing-system]
stage: "Stage 2"
status: complete
updated: 2026-09-21
---

# 13 — Authentication and Roles

Everything below is **[C]** confirmed in code unless marked otherwise.

## Three separate identity systems

| System | Credential | Token | Lifetime | Audience |
|---|---|---|---|---|
| **Admin / staff** | username + password (bcrypt) | JWT | 8h (`JWT_EXPIRES_IN`) | *(none)* |
| **Member** | membership number + phone | JWT | 12h | **`member`** |
| **Face** (both) | face image or descriptor | issues the matching token above | — | — |

The **JWT `audience: 'member'`** claim is what stops a member token reaching admin endpoints —
`verifyMemberToken()` verifies with `{ audience: 'member' }`, and `server/lib/auth.js` verifies
without it. Both share `JWT_SECRET`, so the audience claim is the *only* separator.
→ [[03 - Protected Existing Functions]]

## Admin login — `server/handlers/auth/login.js`

- bcrypt verify, cost `BCRYPT_ROUNDS` (default 12)
- **Generic error** `Invalid username or password` — never reveals whether the username exists
- Disabled accounts: distinct message, `is_active` check
- **5 failed attempts → `locked_until` = now + 15 min**; counter resets on success
- Rate limit 10 / 60s; JWT payload `{ sub, username, role, full_name, trainer_id }`
- Companions: `GET /api/auth/me` (revalidates against the live row),
  `POST /api/auth/change-password` (verifies current first),
  `POST /api/auth/face-login`

## Member login — `server/handlers/member/login.js`

- `membership_number` uppercased and trimmed; phone compared via `normalizePhone()`
- Generic failure message; rate limit 10 / 60s
- **No password, no email login, no password-reset path** — a member who changes phone number must
  be helped by staff
- Face alternative: `POST /api/member/face-login`, `{ image }` (ArcFace) or `{ descriptor }` (legacy)

## Roles and enforcement

Four roles: `owner`, `manager`, `reception`, `trainer` (`server/lib/auth.js`).

**Enforcement is server-side in every handler** via `requireRole(req, res, [...])`. The React guard
`src/components/ProtectedRoute.jsx` only redirects — it is **UX, not security**.

| Scope | Roles | Count |
|---|---|---|
| Owner only | `owner` | 2 handlers — `settings`, `staff` |
| Management | `owner`, `manager` | 21 handlers |
| Front desk | + `reception` | 9 handlers |
| Trainer-inclusive | `owner`, `manager`, `trainer` | 2 — `clients`, `training-session` |
| Any staff | all four | 1 — `message` |

**Row-level scoping also exists**: `clients` returns only the signed-in trainer's own sessions;
`training-session` logs against the trainer's own profile unless owner/manager overrides.

## Member activation — resolves Q-26

Two paths change a member's status, and only two:

1. **Payment-driven (authoritative)** — `activatePayment()` in `server/lib/activation.js`, called
   by **exactly two** callers: `payments/verify.js` and `payments/webhook.js`. It is **idempotent**
   (returns immediately if `payment.status === 'received'`), and sets:
   `payments → received` (+ stores `paystack_auth_code` for recurring billing) ·
   `memberships → active` · `members → active` · then fires member receipt + owner alert.
2. **Manual admin override** — `PATCH /api/admin/member?id=` with `{ status }`, owner/manager only,
   free-form status value, audited as `member.status`.

`admin/member-action.js` does **not** activate; its actions are `checkin`, `regenerate_code`,
`renew`, `change_plan`.

## Future — undecided

Platform roles must live in a **separate namespace** so a gym `owner` never satisfies a
platform-owner check **[R]**. Additional sign-in methods (email/password, phone verification,
Google, Apple, device biometrics) are all **[?]** — see Q-15, and [[08 - Member Workflows]].

2FA is **[M]**, explicitly deferred by the user.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[03 - Protected Existing Functions]] ·
[[08 - Member Workflows]] · [[05 - Main Platform Admin Panel]] · [[14 - Security and Privacy]] ·
[[17 - Open Questions]] · [[18 - Decision Log]]
