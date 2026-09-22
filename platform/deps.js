// Real dependency wiring for the platform router.
//
// Everything the platform does is injected, so the logic is testable without a
// database. This is the one file that reaches a real one.
//
// The platform lives in its own `platform` schema. Under D-096 all gyms share a
// Supabase project with a schema each, so the platform schema can live in that
// same project — PLATFORM_SUPABASE_URL falls back to SUPABASE_URL for exactly
// that case.
import { createClient } from '@supabase/supabase-js';
import { verifyPassword, hashPassword, verifyTotp, base32Decode, verifyRecoveryCode } from './auth.js';
import { schemaNameFor } from './provisioning.js';
import { approveApplication, rejectApplication, requestMoreInfo } from './applications.js';
import { provisionGym } from './provisioning.js';
import { schemaRunnerDeps, gymSchemaChecksum, runSql } from './schema-runner.js';
import { runBilling } from './billing-runner.js';
import { issueActivation, activationLookupHash } from './activation.js';
import { DOCUMENT_BUCKET } from './documents.js';
import { reconcileSchemas } from './reconciliation.js';
import { GRACE_DAYS } from './billing.js';
import { chargeAuthorization, paystackConfigured } from './paystack.js';

let _db = null;

/** The platform database client, scoped to the `platform` schema. */
export function platformDb() {
  if (_db) return _db;

  const url = process.env.PLATFORM_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.PLATFORM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing PLATFORM_SUPABASE_URL / PLATFORM_SUPABASE_SERVICE_KEY (or SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'
    );
  }

  _db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'platform' },
  });
  return _db;
}

/** Append to the platform audit log. Never throws into a request. */
async function audit(db, entry) {
  try {
    await db.from('platform_audit_log').insert({
      actor_user_id: entry.actor_user_id ?? null,
      actor_kind: entry.actor_kind ?? 'platform_staff',
      action: entry.action,
      entity: entry.entity ?? null,
      entity_id: entry.entity_id ?? null,
      detail: entry.detail ?? null,
    });
  } catch (err) {
    console.error('platform audit failed:', err?.message);
  }
}

/** The permissions granted to a platform user, via their roles. */
async function permissionsFor(db, userId) {
  const { data } = await db
    .from('platform_user_roles')
    .select('platform_roles(platform_role_permissions(platform_permissions(key)))')
    .eq('user_id', userId);

  const keys = new Set();
  for (const row of data || []) {
    for (const rp of row.platform_roles?.platform_role_permissions || []) {
      const key = rp.platform_permissions?.key;
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

export function platformDeps() {
  const db = platformDb();

  return {
    // ---- authentication ------------------------------------------------
    findUserByEmail: async (email) => {
      const { data } = await db.from('platform_users').select('*').eq('email', email).maybeSingle();
      return data ?? null;
    },

    verifyPassword: (plain, hash) => (hash ? verifyPassword(plain, hash) : Promise.resolve(false)),

    /**
     * The second factor. A recovery code is accepted in place of a TOTP code,
     * because losing a phone must not mean losing the platform — and a used
     * recovery code is consumed immediately.
     */
    verifySecondFactor: async (user, code) => {
      if (!user?.totp_enabled || !user.totp_secret) return false;

      if (verifyTotp(base32Decode(user.totp_secret), code)) return true;

      const hashes = Array.isArray(user.recovery_code_hashes) ? user.recovery_code_hashes : [];
      if (!hashes.length) return false;

      const result = await verifyRecoveryCode(hashes, code);
      if (!result.ok) return false;

      await db
        .from('platform_users')
        .update({ recovery_code_hashes: result.remainingHashes, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      await audit(db, { action: 'platform.recovery_code.used', actor_user_id: user.id });
      return true;
    },

    // ---- applications ----------------------------------------------------
    listApplications: async () => {
      const { data } = await db
        .from('gym_applications')
        .select('id, proposed_gym_name, status, city, country, submitted_at')
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .limit(200);
      return data ?? [];
    },

    getApplicationView: async (id) => {
      const { data: application } = await db.from('gym_applications').select('*').eq('id', id).maybeSingle();
      if (!application) return null;

      const [{ data: documents }, { data: events }] = await Promise.all([
        db.from('application_documents').select('*').eq('application_id', id),
        db.from('application_events').select('*').eq('application_id', id).order('created_at', { ascending: false }),
      ]);

      return { application, documents: documents ?? [], events: events ?? [] };
    },

    /**
     * Carry out a decision.
     *
     * Provisioning defaults to a DRY RUN. Going live is an explicit
     * environment setting, so a stray approval cannot create real
     * infrastructure before anyone intends it to.
     */
    decide: async (applicationId, session, action, reason) => {
      const actor = {
        id: session.sub,
        email: session.email,
        permissions: await permissionsFor(db, session.sub),
      };

      const appDeps = {
        getApplication: async () => {
          const { data } = await db.from('gym_applications').select('*').eq('id', applicationId).maybeSingle();
          return data;
        },
        updateApplication: async (id, patch) => {
          await db.from('gym_applications').update(patch).eq('id', id);
          return patch;
        },
        appendEvent: async (e) => {
          await db.from('application_events').insert(e);
          return e;
        },
        issueActivation: activationDeps(db).issueActivation,
        provisionGym: (application, opts) => provisionGym(application, provisioningDeps(db), { ...opts, schemaChecksum: safeChecksum() }),
        audit: (e) => audit(db, e),
      };

      const dryRun = process.env.PLATFORM_PROVISION_LIVE !== 'true';

      if (action === 'approve') return approveApplication(applicationId, actor, appDeps, { dryRun });
      if (action === 'reject') return rejectApplication(applicationId, actor, reason, appDeps);
      return requestMoreInfo(applicationId, actor, reason, appDeps);
    },

    // ---- public: a gym owner applying ------------------------------------
    createApplication: async (input) => {
      const slug = slugify(input.gym_name);
      if (!slug || !schemaNameFor(slug)) {
        return { ok: false, error: 'Please use a gym name with some letters or numbers in it.' };
      }

      // A taken slug is reported plainly. Silently appending a number would
      // give two gyms near-identical names in member search, which is worse
      // than asking for a different one.
      const { data: taken } = await db.from('gyms').select('id').eq('slug', slug).maybeSingle();
      if (taken) return { ok: false, error: 'A gym with a very similar name is already listed. Please contact us.' };

      let { data: user } = await db.from('platform_users').select('id').eq('email', input.email).maybeSingle();

      if (!user) {
        const { data: created, error } = await db
          .from('platform_users')
          .insert({
            email: input.email,
            full_name: input.owner_name,
            password_hash: await hashPassword(input.password),
            kind: 'gym_owner',
          })
          .select('id')
          .single();
        if (error) return { ok: false, error: 'We could not create your account.' };
        user = created;
      }

      const { data: application, error: appErr } = await db
        .from('gym_applications')
        .insert({
          applicant_user_id: user.id,
          status: 'submitted',
          proposed_gym_name: input.gym_name,
          slug,
          city: input.city || null,
          country: input.country || null,
          estimated_members: input.estimated_members,
          requested_plan_key: input.plan_key,
          owner_needs: input.needs,
          submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (appErr) return { ok: false, error: 'We could not submit your application.' };

      await db.from('application_events').insert({
        application_id: application.id,
        event: 'submitted',
        actor_user_id: user.id,
      });
      await audit(db, {
        action: 'application.submitted',
        actor_kind: 'gym_owner',
        actor_user_id: user.id,
        entity: 'application',
        entity_id: application.id,
        detail: { gym_name: input.gym_name, plan: input.plan_key },
      });

      return { ok: true, applicationId: application.id };
    },

    // ---- public: gym search ----------------------------------------------
    searchGyms: async ({ query, lat, lng }) => {
      let q = db
        .from('gyms')
        // Only what a stranger may know. No schema name, no connection.
        .select('slug, search_name, city, country, latitude, longitude')
        .eq('status', 'active')
        .limit(25);

      if (query) q = q.ilike('search_name', `%${query}%`);

      const { data } = await q;
      const gyms = data ?? [];

      // "Show the nearest whatever the distance" (D-073): an empty screen looks
      // broken, and a member told the closest gym is 80 km away has learned
      // something true and useful.
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        for (const g of gyms) g.distance_km = haversineKm(lat, lng, g.latitude, g.longitude);
        gyms.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      }

      return gyms.map((g) => ({
        slug: g.slug,
        name: g.search_name,
        city: g.city,
        country: g.country,
        distance_km: g.distance_km ?? null,
      }));
    },

    audit: (entry) => audit(db, entry),
  };
}

/** A gym name becomes its routing key: "BOS GYM" -> "bos-gym". */
function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Great-circle distance in km. Good enough for "which gym is nearest". */
function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((n) => Number.isFinite(Number(n)))) return null;
  const R = 6371;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/**
 * Provisioning's side effects: DDL through the Management API, registry rows
 * through the platform database.
 */
export function provisioningDeps(db = platformDb()) {
  return {
    ...schemaRunnerDeps({ projectRef: process.env.SUPABASE_PROJECT_REF }),
    saveGym: async (row) => {
      const { data } = await db.from('gyms').insert(row).select('*').single();
      return data;
    },
    saveConnection: async (row) => {
      const { data } = await db.from('gym_connections').insert(row).select('*').single();
      return data;
    },
    startSubscription: async (row) => {
      const { data, error } = await db.from('platform_subscriptions').insert(row).select('*').single();
      // Checked, not ignored: a gym provisioned without a subscription row is
      // refused with a 402 the first time anyone opens it, and the cause would
      // be a week old by the time anybody connected the two.
      if (error) throw new Error(`Could not open the trial subscription: ${error.message}`);
      return data;
    },
    saveSecretRef: async (row) => {
      await db.from('gym_secrets').insert(row);
      return row;
    },
    recordMigrationBaseline: async (row) => {
      await db.from('migration_runs').insert(row);
      return row;
    },
    audit: (e) => audit(db, e),
  };
}


/** The shipped gym schema's checksum, for the migration baseline. */
function safeChecksum() {
  try {
    return gymSchemaChecksum();
  } catch {
    return null; // a missing schema file must not block a dry run
  }
}

// ---------------------------------------------------------------------------
// The registry, billing and the webhook — real wiring
// ---------------------------------------------------------------------------

/**
 * Everything the registry, billing and webhook routes need.
 *
 * Merged onto platformDeps() by the entry point, rather than folded into it,
 * so the authentication and application flows stay readable on their own.
 */
export function platformOpsDeps(db = platformDb()) {
  return {
    /** Read per request. Revoking a role must take effect now, not in 8 hours. */
    permissionsFor: (session) => permissionsFor(db, session.sub),

    listGyms: async () => {
      const { data } = await db
        .from('gyms')
        .select('id, slug, search_name, city, country, status, plan_key, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      const gyms = data ?? [];
      if (!gyms.length) return gyms;

      // One query for the subscription states rather than one per gym: a
      // registry page that fires 500 requests is a registry page nobody opens.
      const { data: subs } = await db
        .from('platform_subscriptions')
        .select('gym_id, status')
        .in('gym_id', gyms.map((g) => g.id));

      const byGym = new Map((subs ?? []).map((s) => [s.gym_id, s.status]));
      for (const g of gyms) g.subscription_status = byGym.get(g.id) ?? null;
      return gyms;
    },

    getGymDetail: async (gymId) => {
      const { data: gym } = await db.from('gyms').select('*').eq('id', gymId).maybeSingle();
      if (!gym) return null;

      const [{ data: subscription }, { data: invoices }] = await Promise.all([
        db.from('platform_subscriptions').select('*').eq('gym_id', gymId).maybeSingle(),
        db.from('platform_invoices').select('*').eq('gym_id', gymId).order('issued_at', { ascending: false }).limit(24),
      ]);

      // Note what is NOT selected: gym_connections and gym_secrets. Nobody
      // reviewing a gym's billing needs its schema name or its keys (D-044).
      return { gym, subscription: subscription ?? null, invoices: invoices ?? [] };
    },

    setGymStatus: async (gymId, status, reason = '') => {
      const patch = { status, updated_at: new Date().toISOString() };
      if (status === 'suspended') patch.suspended_at = new Date().toISOString();
      if (status === 'active') patch.suspended_at = null;

      const { error } = await db.from('gyms').update(patch).eq('id', gymId);
      if (error) throw new Error(`Could not change gym status: ${error.message}`);

      // The subscription is brought back in step, or a reactivated gym would
      // serve traffic while its subscription still said 'suspended' — and the
      // next cron run would suspend it again that night.
      if (status === 'active') {
        await db
          .from('platform_subscriptions')
          .update({ status: 'active', grace_ends_at: null, updated_at: new Date().toISOString() })
          .eq('gym_id', gymId)
          .eq('status', 'suspended');
      }
      return { ok: true, reason };
    },

    /** Apply what a verified Paystack webhook means. */
    applyPaystackEvent: async (intent) => {
      const { data: invoice } = await db
        .from('platform_invoices')
        .select('*')
        .eq('provider_ref', intent.reference)
        .maybeSingle();

      // An unknown reference is logged, not guessed at. It may be a payment
      // for something else entirely, and marking a random invoice paid is
      // worse than doing nothing.
      if (!invoice) {
        await audit(db, {
          action: 'platform.webhook.unmatched',
          actor_kind: 'system',
          detail: { reference: intent.reference, kind: intent.kind },
        });
        return { ok: false, reason: 'No invoice matches that reference.' };
      }

      const now = new Date().toISOString();

      if (intent.kind === 'payment_succeeded') {
        // Already paid: this is a duplicate delivery, which Paystack does
        // routinely. Acknowledged, not applied twice.
        if (invoice.status === 'paid') return { ok: true, duplicate: true };

        await db.from('platform_invoices').update({ status: 'paid', paid_at: now, updated_at: now }).eq('id', invoice.id);
        await db
          .from('platform_subscriptions')
          .update({ status: 'active', grace_ends_at: null, updated_at: now })
          .eq('gym_id', invoice.gym_id);
        // A gym suspended for non-payment comes back the moment it pays.
        await db.from('gyms').update({ status: 'active', suspended_at: null, updated_at: now })
          .eq('id', invoice.gym_id).eq('status', 'suspended');

        await audit(db, {
          action: 'platform.invoice.paid',
          actor_kind: 'system',
          entity: 'invoice',
          entity_id: invoice.id,
          detail: { amount_cents: intent.amount_cents, expected_cents: invoice.amount_cents },
        });
        return { ok: true };
      }

      if (intent.kind === 'payment_failed') {
        await db.from('platform_invoices').update({ status: 'overdue', updated_at: now }).eq('id', invoice.id);
        await db
          .from('platform_subscriptions')
          .update({ status: 'past_due', grace_ends_at: new Date(Date.now() + GRACE_DAYS * 86_400_000).toISOString(), updated_at: now })
          .eq('gym_id', invoice.gym_id);
        return { ok: true };
      }

      if (intent.kind === 'subscription_cancelled') {
        await db.from('platform_subscriptions').update({ cancel_at: now, updated_at: now }).eq('gym_id', invoice.gym_id);
        return { ok: true };
      }

      return { ok: true, ignored: true };
    },

    /** The nightly job: billing, then a drift report. */
    runBilling: (options) => runBilling(billingDeps(db), options),

    /**
     * The drift report. Read-only by construction: it is handed a schema
     * lister and a connection lister, and nothing that can execute DDL.
     */
    reconcile: () =>
      reconcileSchemas({
        listSchemas: async () => {
          const rows = await runSql(
            "select nspname from pg_namespace where nspname like 'gym\_%' order by nspname;"
          );
          return (rows || []).map((r) => r.nspname);
        },
        listConnections: async () => {
          const { data } = await db.from('gym_connections').select('gym_id, schema_name, status');
          return data ?? [];
        },
        audit: (e) => audit(db, e),
      }),
  };
}

/** Billing's side effects, against the real database and our own Paystack account. */
export function billingDeps(db = platformDb()) {
  return {
    listActiveSubscriptions: async () => {
      const { data } = await db
        .from('platform_subscriptions')
        .select('*')
        .in('status', ['trialing', 'active', 'past_due', 'suspended'])
        .limit(1000);
      return data ?? [];
    },

    getPlan: async (planId) => {
      const { data } = await db.from('platform_plans').select('*').eq('id', planId).maybeSingle();
      return data ?? null;
    },

    getGym: async (gymId) => {
      const { data: gym } = await db
        .from('gyms')
        .select('id, slug, search_name, owner_user_id')
        .eq('id', gymId)
        .maybeSingle();
      if (!gym) return null;

      // Two plain queries rather than a PostgREST embed: the embed would
      // depend on the foreign-key CONSTRAINT NAME, which is generated by
      // Postgres and is not something this code should be betting on.
      const { data: owner } = await db
        .from('platform_users')
        .select('email')
        .eq('id', gym.owner_user_id)
        .maybeSingle();

      return { ...gym, owner_email: owner?.email ?? null };
    },

    /** The double-charge guard: one invoice per gym per billing period. */
    findInvoiceForPeriod: async (gymId, periodEnd) => {
      const { data } = await db
        .from('platform_invoices')
        .select('id, status')
        .eq('gym_id', gymId)
        .eq('period_end', periodEnd)
        .maybeSingle();
      return data ?? null;
    },

    createInvoice: async (row) => {
      const { data, error } = await db.from('platform_invoices').insert(row).select('*').single();
      if (error) throw new Error(`Could not raise invoice: ${error.message}`);
      return data;
    },

    updateInvoice: async (id, patch) => {
      await db.from('platform_invoices').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    },

    charge: async ({ email, amountCents, reference, gymId }) => {
      if (!paystackConfigured()) {
        // Not an error: it means nobody has connected the platform's Paystack
        // account yet. Reported as an unpaid attempt rather than a crash that
        // would stop every other gym being billed.
        return { ok: false, reason: 'Platform Paystack is not configured.' };
      }
      if (!email) return { ok: false, reason: `Gym ${gymId} has no owner email to charge.` };

      try {
        const result = await chargeAuthorization({ email, amountCents, authorizationCode: null, reference });
        return { ok: result?.status === 'success', reference, raw: result?.status };
      } catch (err) {
        return { ok: false, reason: err?.message || 'Charge failed.' };
      }
    },

    updateSubscription: async (id, patch) => {
      await db.from('platform_subscriptions').update(patch).eq('id', id);
    },

    setGymStatus: async (gymId, status) => {
      const patch = { status, updated_at: new Date().toISOString() };
      if (status === 'suspended') patch.suspended_at = new Date().toISOString();
      await db.from('gyms').update(patch).eq('id', gymId);
    },

    /**
     * Notifications are recorded, not sent — there is no email provider wired
     * up yet, and a silent failure would be worse than a visible queue.
     */
    notify: async (payload) => {
      await audit(db, {
        action: `platform.notify.${payload.kind}`,
        actor_kind: 'system',
        entity: 'gym',
        entity_id: payload.gym_id,
        detail: payload,
      });
    },

    audit: (entry) => audit(db, entry),
  };
}

// ---------------------------------------------------------------------------
// Owner activation — real wiring
// ---------------------------------------------------------------------------

/**
 * Activation's database side.
 *
 * The lookup is BY HASH, never by the raw token: the raw token is not stored,
 * so there is nothing else to look up by. That is the property the whole
 * design rests on.
 */
export function activationDeps(db = platformDb()) {
  return {
    /** Enough to greet the owner by their gym's name — and nothing more. */
    activationContext: async (token) => {
      if (!token) return {};
      const { data } = await db
        .from('owner_activations')
        .select('gym_id')
        .eq('token_hash', activationLookupHash(token))
        .is('used_at', null)
        .maybeSingle();
      if (!data) return {};

      const { data: gym } = await db.from('gyms').select('search_name').eq('id', data.gym_id).maybeSingle();
      return { gymName: gym?.search_name ?? '' };
    },

    findActivation: async (tokenHash) => {
      const { data } = await db
        .from('owner_activations')
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      return data ?? null;
    },

    setPassword: async (userId, hash) => {
      const { error } = await db
        .from('platform_users')
        .update({ password_hash: hash, is_active: true, updated_at: new Date().toISOString() })
        .eq('id', userId);
      // Checked: an unchecked failure here leaves the owner with a consumed
      // link and no password — locked out of a gym they have been approved for.
      if (error) throw new Error(`Could not set the password: ${error.message}`);
    },

    markUsed: async (id, at) => {
      await db.from('owner_activations').update({ used_at: at }).eq('id', id);
    },

    // NOTE: deliberately no `setGymStatus` here. platformOpsDeps() already
    // provides one, these objects are merged at the entry point, and the ops
    // version does strictly more — it records a reason and brings the
    // subscription back in step. A second definition would win by spread
    // order and silently drop both.

    /**
     * Create an activation and return the link to send.
     *
     * The raw token and code are returned to the caller and never written
     * anywhere. If the email is not sent, they are gone and a new activation
     * must be issued — which is the correct behaviour, not a limitation.
     */
    issueActivation: async ({ userId, gymId }) => {
      const { row, token, code } = issueActivation({ userId, gymId });

      const { error } = await db.from('owner_activations').insert(row);
      if (error) throw new Error(`Could not create the activation: ${error.message}`);

      const base = process.env.PLATFORM_BASE_URL || '';
      const link = `${base}/platform/activate?token=${encodeURIComponent(token)}`;

      // Recorded WITHOUT the token or the code. An audit log that contains a
      // working activation link is an audit log that grants access.
      await audit(db, {
        action: 'platform.owner.activation_issued',
        actor_kind: 'system',
        entity: 'gym',
        entity_id: gymId,
        detail: { user_id: userId, expires_in_hours: 48 },
      });

      return { link, code, expiresInHours: 48 };
    },

    audit: (entry) => audit(db, entry),
  };
}

// ---------------------------------------------------------------------------
// The gym owner's own page, and their documents
// ---------------------------------------------------------------------------

export function ownerDeps(db = platformDb()) {
  return {
    /**
     * Everything an owner sees about their own account.
     *
     * Every query is filtered by the SESSION's user id. There is no code path
     * here that can be pointed at another owner's gym, which is the property
     * that matters in a database where every gym is a row in the same table.
     */
    ownerDashboard: async (userId) => {
      const { data: application } = await db
        .from('gym_applications')
        .select('*')
        .eq('applicant_user_id', userId)
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const { data: gym } = await db
        .from('gyms')
        .select('id, slug, search_name, status, plan_key, city, country')
        .eq('owner_user_id', userId)
        .maybeSingle();

      const [{ data: subscription }, { data: documents }] = await Promise.all([
        gym
          ? db.from('platform_subscriptions').select('*').eq('gym_id', gym.id).maybeSingle()
          : Promise.resolve({ data: null }),
        application
          ? db.from('application_documents').select('*').eq('application_id', application.id)
          : Promise.resolve({ data: [] }),
      ]);

      return {
        application: application ?? null,
        gym: gym ?? null,
        subscription: subscription ?? null,
        documents: documents ?? [],
      };
    },

    /**
     * An application, but ONLY if this user owns it.
     *
     * Both conditions in one query, so there is no window in which the
     * application is loaded and the ownership check is a separate `if` that a
     * later edit could drop.
     */
    findOwnApplication: async (userId, applicationId) => {
      if (!userId || !applicationId) return null;
      const { data } = await db
        .from('gym_applications')
        .select('id, applicant_user_id, status, proposed_gym_name')
        .eq('id', applicationId)
        .eq('applicant_user_id', userId)
        .maybeSingle();
      return data ?? null;
    },

    /**
     * A one-time upload target in the PRIVATE bucket.
     *
     * The bucket is never public. Staff read these through a short-lived
     * signed download URL on the review screen; nothing here grants a
     * permanent readable link.
     */
    createSignedUpload: async (path) => {
      const { data, error } = await db.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(path);
      if (error) throw new Error(`Could not prepare the upload: ${error.message}`);
      return { token: data.token, uploadUrl: data.signedUrl, path: data.path ?? path };
    },

    recordDocument: async (row) => {
      const { data, error } = await db.from('application_documents').insert(row).select('*').single();
      if (error) throw new Error(`Could not record the document: ${error.message}`);
      return data;
    },

    /** A short-lived read link, for the reviewer only. Minutes, not days. */
    signedDocumentUrl: async (storageRef, seconds = 300) => {
      const { data, error } = await db.storage.from(DOCUMENT_BUCKET).createSignedUrl(storageRef, seconds);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  };
}
