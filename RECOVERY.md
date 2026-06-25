# Disaster Recovery — Yoyo GYM

How to fully restore this system on a **brand-new computer** if this one is lost,
stolen, or dies. Follow top to bottom.

> The 3-2-1 rule this project follows: **3 copies** of the code (this machine,
> GitHub, OneDrive), on **2 media** (local disk + cloud), with **1 off-site**
> (GitHub + OneDrive are both off-site). Secrets and the database live in
> independent clouds (see below).

---

## Where everything lives

| Asset | Primary | Backup(s) |
|---|---|---|
| **Code** | GitHub `Ethan5322/yoyogym` (branch `main`) | OneDrive folder + `OneDrive\Backups\yoyogym\*.bundle` |
| **Secrets (`.env`)** | OneDrive (synced with the project folder) | Vercel → Project → Settings → Environment Variables; **+ a password manager (do this!)** |
| **Database** | Supabase project (cloud) | Supabase automatic backups / `supabase db dump`; schema in `db/schema.sql` |
| **Live site** | Vercel `yoyogym.vercel.app` | Redeploys automatically from GitHub `main` |

`.env` is intentionally **NOT** in GitHub (it holds secrets). It IS in OneDrive
and Vercel. Keep a third copy in a password manager so no single provider loss
locks you out.

---

## Restore from scratch (new computer)

### 1. Install tools
- Git, Node.js LTS, then `npm i -g vercel` (optional), `npm i -g supabase` (optional).

### 2. Get the code (any ONE of these)
```bash
# A) from GitHub (preferred)
git clone https://github.com/Ethan5322/yoyogym.git
cd yoyogym

# B) from the OneDrive bundle (if GitHub is unavailable)
#    (download the .bundle from OneDrive first)
git clone yoyogym-YYYY-MM-DD.bundle yoyogym
cd yoyogym
git remote set-url origin https://github.com/Ethan5322/yoyogym.git

# C) the OneDrive project folder already IS a full git repo — just open it.
```

### 3. Restore secrets (`.env`)
Recreate `.env` in the project root. Get the values from, in order of preference:
1. Your **password manager**, or
2. **Vercel** → project → Settings → Environment Variables (copy each value), or
3. The **OneDrive** copy of this project folder (it contains `.env`).

The required variable **names** are documented in `.env.example`. Never commit `.env`.

### 4. Install & run
```bash
npm install
npm run dev        # frontend (Vite)
npm run dev:api    # local API (separate terminal)
```

### 5. Database
- The data lives in **Supabase** (cloud) — it is NOT on this computer, so it
  survives losing the machine. Just point `.env` at the same Supabase project.
- To stand up a **fresh** Supabase project: run `db/schema.sql` in the SQL Editor,
  then `npm run seed:owner` and `npm run seed:catalog`. See `db/README.md`.

### 6. Redeploy
- Pushing to GitHub `main` auto-deploys to Vercel. Or run `vercel --prod`.
- Confirm: open `https://YOUR-DOMAIN/api/health` → `{ "status": "ok" }`.

---

## Make a fresh code snapshot any time
```bash
git bundle create "C:/Users/<you>/OneDrive/Backups/yoyogym/yoyogym-$(date +%F).bundle" --all
git bundle verify <that file>   # should say "records a complete history"
```

## Recommended one-time hardening (do these once)
- [ ] Put every `.env` value into a **password manager** (Bitwarden/1Password).
- [ ] Confirm all env vars are set in **Vercel** (Production + Preview).
- [ ] In **Supabase** → Database → **Backups**, confirm automatic backups (enable
      Point-in-Time Recovery if your plan allows) and take a manual `db dump`.
- [ ] Verify **OneDrive** is actually syncing (the folder shows a green check),
      not "paused".
- [ ] Optional: add a second git remote (e.g. GitLab) and push there too:
      `git remote add gitlab <url> && git push gitlab main`.
