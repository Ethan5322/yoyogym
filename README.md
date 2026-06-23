# Premium AI Gym Membership & Booking System

MuleSoo Digital Solutions — single-tenant deployment (one gym per Supabase + Vercel project).

## Stack
React + Vite + Tailwind (frontend) · Vercel serverless functions (`/api`) · Supabase Postgres (schema `gym`). The browser never talks to Supabase directly — all data goes through `/api` using the service-role key (POPIA-compliant).

---

## Phase 1 — Setup

### 1. Database
Already done: the 16-table schema was run in the Supabase SQL Editor (schema `gym`), and `gym` is added to **Settings → API → Exposed schemas**.

### 2. Environment variables
```bash
cp .env.example .env
```
Fill in:
- `SUPABASE_URL` — from Supabase → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — **service_role** key (secret, server-only)
- `SUPABASE_SCHEMA` — `gym`
- `JWT_SECRET` — generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` — for the first owner account

### 3. Install & seed the owner account
```bash
npm install
npm run seed:owner
```

### 4. Run locally
```bash
npm i -g vercel      # once
vercel dev           # serves the app + /api functions together
```
Then open the app, go to `/admin/login`, and sign in with the seeded owner.
(`npm run dev` runs Vite alone and proxies `/api` to `vercel dev` on :3000.)

### 5. Deploy
Push to GitHub, import into Vercel, add the same env vars in Vercel Project Settings, deploy.

---

## Routes
| Route | Access | Status |
|---|---|---|
| `/` | public | Splash / landing |
| `/register` | public | Phase 2 (placeholder) |
| `/member` | public | Phase 6 (placeholder) |
| `/admin/login` | public | Admin login |
| `/admin` | owner, manager | Dashboard shell |
| `/admin/verify` | owner, manager, reception | Phase 7 (placeholder) |
| `/admin/clients` | owner, manager, trainer | Phase 7 (placeholder) |

## Roles (RBAC)
`owner` (full) · `manager` (full except settings) · `reception` (verify/check-in/booking) · `trainer` (own clients).

## Health check
`GET /api/health` confirms env vars + `gym` schema connectivity after deploy.
