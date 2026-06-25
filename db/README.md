# Database — `gym` schema

Version-controlled PostgreSQL/Supabase schema for the Premium AI Gym System.
One Supabase project per gym tenant.

## Files
- **`schema.sql`** — the canonical, repeatable schema. Reconstructed from the
  application code; it is the *minimal complete* set of tables/columns the code
  reads and writes. Run this once to stand up a brand-new gym.

## Stand up a new tenant
1. Supabase → **SQL Editor** → paste all of `schema.sql` → **Run**.
2. Seed the first owner + default catalog:
   ```bash
   npm run seed:owner
   npm run seed:catalog
   ```
3. Verify: open `https://YOUR-DOMAIN/api/health` → `{ "status": "ok", "schema": "gym" }`.

## Keeping it in sync with a live database
`schema.sql` is maintained by hand from the code. If you have already added
columns directly in Supabase (e.g. during later phases), capture the **exact**
live schema with the Supabase CLI and commit it next to this file:

```bash
supabase db dump --schema gym -f db/schema.live.sql
```

Treat `schema.live.sql` (if present) as the source of truth for an existing
production gym, and `schema.sql` as the clean install script for new tenants.
When they diverge, fold the differences back into `schema.sql`.

## Security model
- The server uses the Supabase **service-role** key (server-side only), which
  bypasses RLS.
- RLS is **enabled on every table with no policies** → anon/authenticated roles
  are denied by default. This satisfies the POPIA requirement that browsers/
  clients never read personal data directly.
- Member-owned tables cascade on `members` delete (POPIA right to erasure).
