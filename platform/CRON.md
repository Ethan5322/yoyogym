# The platform cron

**It is not a Vercel cron job, deliberately.**

`vercel.json` cannot hold a comment — it is validated against a strict schema
and rejects unknown keys, which is what broke a deployment on 2026-09-22 when
the explanation was put there. So it lives here.

## Why it is not a Vercel cron

This project runs on the Hobby plan, which allows very few cron entries, and
the gym already uses three. Adding a fourth is the kind of thing that fails a
deploy rather than degrading quietly.

## How to run it

**By hand:** the button on `/platform/reconcile` in the panel.

**On a schedule:** any external scheduler, free ones included:

```
POST https://<your-domain>/api/platform/cron
Authorization: Bearer <PLATFORM_CRON_SECRET>
```

Once a day is plenty. Around 03:00 is what it was written for.

## What happens if it does not run

Very little, and that is by design.

- **Billing is idempotent.** One invoice per gym per billing period, enforced
  by a unique index, so a run that is a day late bills once rather than twice.
- **Retention only reports** until `PLATFORM_RETENTION_LIVE=true`, which is not
  set.
- **Billing only charges** when `PLATFORM_BILLING_LIVE=true`, which is not set
  either.

A missed day means warnings go out late. Nothing is lost and nothing double-bills.
