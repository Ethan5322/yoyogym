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
import { sendEmail, activationEmail, billingEmail, emailConfigured } from './email.js';
import { purgeExpiredDocuments } from './retention.js';
import { directoryRow } from './member-directory.js';
import { fileFacts } from './forensics.js';
import { gymStats } from './stats.js';
import { reconcileSchemas } from './reconciliation.js';
import { GRACE_DAYS } from './billing.js';
import { chargeAuthorization, paystackConfigured, initializeSubscriptionPayment, verifyTransaction } from './paystack.js';

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
      const { data, error } = await db.from('platform_users').select('*').eq('email', email).maybeSingle();

      // THE ERROR IS NOT SWALLOWED, and this cost real time on 2026-09-22.
      //
      // Destructuring only `data` made two completely different situations
      // identical: "no account with that email" and "the platform schema is
      // not exposed to the API, so this query could not run at all". Both
      // arrived as null, and the setup screen confidently reported the first
      // when the truth was the second.
      //
      // A query that could not run is not an empty result.
      if (error) {
        throw new Error(
          `Could not read platform_users: ${error.message}. ` +
            'If this says the schema is not exposed, add `platform` to Settings -> API -> Exposed schemas in Supabase.'
        );
      }

      return data ?? null;
    },

    verifyPassword: (plain, hash) => (hash ? verifyPassword(plain, hash) : Promise.resolve(false)),

    /** First run only. Guarded upstream by the setup token AND by having no password. */
    finishSetup: async (userId, patch) => {
      const { error } = await db.from('platform_users').update(patch).eq('id', userId);
      if (error) throw new Error(`Could not finish setup: ${error.message}`);
    },

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
        setDocumentRetention: async (applicationId, until) => {
          await db.from('application_documents').update({ retention_until: until }).eq('application_id', applicationId);
        },
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

    listGyms: async ({ query = '', status = '', limit = 200 } = {}) => {
      let q = db
        .from('gyms')
        .select('id, slug, search_name, city, country, status, plan_key, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(limit) || 200, 500));

      // A list capped at 500 with no search is not a registry at ten thousand
      // gyms — it is the newest 500 gyms.
      if (query) q = q.or(`search_name.ilike.%${query}%,slug.ilike.%${query}%,city.ilike.%${query}%`);
      if (status) q = q.eq('status', status);

      const { data } = await q;
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

    /**
     * The retention purge (D-054). The one job here that deletes, which is
     * why it is handed a storage remover and a row deleter and nothing else —
     * it cannot touch a gym, a member or an invoice.
     */
    purgeDocuments: (options) =>
      purgeExpiredDocuments(
        {
          listExpiredDocuments: async (today) => {
            const { data } = await db
              .from('application_documents')
              .select('id, storage_ref, application_id')
              .not('retention_until', 'is', null)
              .lte('retention_until', today)
              .limit(500);
            return data ?? [];
          },
          removeStorageObject: async (ref) => {
            const { error } = await db.storage.from(DOCUMENT_BUCKET).remove([ref]);
            if (error) throw new Error(`Could not delete ${ref}: ${error.message}`);
          },
          deleteDocumentRow: async (id) => {
            const { error } = await db.from('application_documents').delete().eq('id', id);
            if (error) throw new Error(`Could not delete document row ${id}: ${error.message}`);
          },
          audit: (e) => audit(db, e),
        },
        options
      ),

    /**
     * The recovery lookup — which gym does this digest belong to?
     *
     * Returns only a gym's PUBLIC identity, and only for gyms that could
     * actually be signed in to. Naming a suspended gym here would tell a
     * stranger something the gym would rather keep to itself.
     */
    findGymsForMember: async (lookupHashValue) => {
      const { data: rows } = await db
        .from('member_directory')
        .select('gym_id')
        .eq('lookup_hash', lookupHashValue)
        .limit(5);

      if (!rows?.length) return [];

      const { data: gyms } = await db
        .from('gyms')
        .select('id, slug, search_name, city, status')
        .in('id', rows.map((r) => r.gym_id))
        .eq('status', 'active');

      return gyms ?? [];
    },

    /**
     * Record a member in the routing index.
     *
     * Called when a member registers. A failure is logged and swallowed: the
     * member IS registered at their gym, and losing the recovery shortcut must
     * never fail a registration that otherwise succeeded.
     */
    indexMember: async ({ membershipNumber, phone, gymId }) => {
      try {
        const row = directoryRow({ membershipNumber, phone, gymId });
        if (!row) return { ok: false, reason: 'incomplete' };

        // Upsert: re-registering the same details must not fail on the key.
        await db.from('member_directory').upsert(row, { onConflict: 'lookup_hash' });
        return { ok: true };
      } catch (err) {
        console.error('member directory index failed:', err?.message);
        return { ok: false, reason: err?.message };
      }
    },

    // ---- the owner paying their subscription ------------------------------
    getSubscription: async (gymId) => {
      const { data } = await db.from('platform_subscriptions').select('*').eq('gym_id', gymId).maybeSingle();
      return data ?? null;
    },

    findOpenInvoice: async (gymId, periodEnd) => {
      let q = db.from('platform_invoices').select('*').eq('gym_id', gymId).in('status', ['issued', 'overdue']);
      q = periodEnd ? q.eq('period_end', periodEnd) : q.is('period_end', null);
      const { data } = await q.maybeSingle();
      return data ?? null;
    },

    findInvoiceByRef: async (reference) => {
      const { data } = await db.from('platform_invoices').select('*').eq('provider_ref', reference).maybeSingle();
      return data ?? null;
    },

    initializePayment: ({ email, amountCents, reference, metadata }) =>
      initializeSubscriptionPayment({
        email,
        amountCents,
        reference,
        metadata,
        callbackUrl: `${process.env.PLATFORM_BASE_URL || ''}/platform/pay/callback`,
      }),

    /** Asked of Paystack directly. The browser's word is not evidence. */
    verifyPayment: (reference) => verifyTransaction(reference),

    markInvoicePaid: async (id, at) => {
      const { error } = await db
        .from('platform_invoices')
        .update({ status: 'paid', paid_at: at, updated_at: at })
        .eq('id', id);
      if (error) throw new Error(`Could not record the payment: ${error.message}`);
    },

    /** Paid: the subscription goes active and the card is remembered. */
    activateSubscription: async (gymId, patch) => {
      const { error } = await db.from('platform_subscriptions').update(patch).eq('gym_id', gymId);
      if (error) throw new Error(`Could not activate the subscription: ${error.message}`);

      // A gym suspended for non-payment reopens the moment it pays.
      await db
        .from('gyms')
        .update({ status: 'active', suspended_at: null, updated_at: patch.updated_at })
        .eq('id', gymId)
        .in('status', ['suspended', 'pending']);
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

    charge: async ({ email, amountCents, reference, gymId, authorizationCode = null }) => {
      // THE BUG THIS FIXES: this used to pass authorizationCode: null to
      // Paystack unconditionally, so every renewal failed. There was a first
      // payment and then silence. The code now comes from the subscription,
      // and its absence is reported honestly instead of being sent to Paystack
      // to be rejected.
      if (!authorizationCode) {
        return { ok: false, reason: 'No saved card. The owner must pay once on the web first.' };
      }
      if (!paystackConfigured()) {
        // Not an error: it means nobody has connected the platform's Paystack
        // account yet. Reported as an unpaid attempt rather than a crash that
        // would stop every other gym being billed.
        return { ok: false, reason: 'Platform Paystack is not configured.' };
      }
      if (!email) return { ok: false, reason: `Gym ${gymId} has no owner email to charge.` };

      try {
        const result = await chargeAuthorization({ email, amountCents, authorizationCode, reference });
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
      // Sent AND recorded. Recorded even when sending fails, so an owner who
      // says "I was never told" can be answered from the log.
      const { data: gym } = await db
        .from('gyms')
        .select('search_name, owner_user_id')
        .eq('id', payload.gym_id)
        .maybeSingle();

      let sent = { ok: false, reason: 'no_gym' };
      if (gym) {
        const { data: owner } = await db
          .from('platform_users')
          .select('email')
          .eq('id', gym.owner_user_id)
          .maybeSingle();

        const mail = billingEmail(payload.kind, {
          gymName: gym.search_name,
          amountCents: payload.amount_cents,
        });
        sent = mail ? await sendEmail({ to: owner?.email, ...mail }) : { ok: false, reason: 'no_template' };
      }

      await audit(db, {
        action: `platform.notify.${payload.kind}`,
        actor_kind: 'system',
        entity: 'gym',
        entity_id: payload.gym_id,
        detail: { ...payload, emailed: sent.ok, email_reason: sent.reason ?? null },
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

      // Send it. A failure here does NOT undo the approval — the gym is
      // already provisioned — so the result is reported and the raw link is
      // returned to the caller, which shows it to the reviewer. That way the
      // chain completes even with no mail provider configured at all.
      const { data: owner } = await db.from('platform_users').select('email').eq('id', userId).maybeSingle();
      const { data: gym } = await db.from('gyms').select('search_name').eq('id', gymId).maybeSingle();

      const mail = activationEmail({ gymName: gym?.search_name, link, code });
      const sent = await sendEmail({ to: owner?.email, ...mail });

      if (!sent.ok) {
        await audit(db, {
          action: 'platform.owner.activation_email_failed',
          actor_kind: 'system',
          entity: 'gym',
          entity_id: gymId,
          // Never the link or the code — this log is readable in the panel.
          detail: { reason: sent.reason },
        });
      }

      return { link, code, expiresInHours: 48, emailed: sent.ok, emailReason: sent.reason ?? null, to: owner?.email ?? null };
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

    getDocument: async (id) => {
      const { data } = await db.from('application_documents').select('*').eq('id', id).maybeSingle();
      return data ?? null;
    },

    reviewDocument: async (id, patch) => {
      const { error } = await db.from('application_documents').update(patch).eq('id', id);
      if (error) throw new Error(`Could not record that decision: ${error.message}`);
    },

    /**
     * The facts about a document's bytes.
     *
     * DOWNLOADED AND HASHED SERVER-SIDE, never taken from the uploader. A
     * client-supplied hash would be worth nothing for the duplicate check —
     * anyone reusing a document would simply send a different number.
     *
     * The result is cached on the row, so a document is fetched once however
     * many times it is reviewed. The cost is bounded by review volume, not by
     * upload volume.
     */
    documentFacts: async (doc) => {
      if (doc.sha256 && doc.size_bytes) {
        // Already computed. The flags are recomputed from the stored facts
        // rather than re-downloading, which is why they are cheap to show.
        return {
          sha256: doc.sha256,
          bytes: Number(doc.size_bytes),
          actualType: doc.mime_type,
          declaredType: doc.mime_type,
          flags: [],
        };
      }

      const { data, error } = await db.storage.from(DOCUMENT_BUCKET).download(doc.storage_ref);
      if (error || !data) throw new Error(`Could not read the document: ${error?.message}`);

      const buffer = Buffer.from(await data.arrayBuffer());
      const facts = fileFacts(buffer, {
        declaredType: doc.mime_type,
        declaredSize: doc.size_bytes,
      });

      // Written back so the next reviewer does not pay for it, and so the
      // duplicate check can be a plain indexed lookup.
      await db
        .from('application_documents')
        .update({ sha256: facts.sha256, size_bytes: facts.bytes })
        .eq('id', doc.id);

      return facts;
    },

    /**
     * Anywhere else this exact file has been uploaded.
     *
     * The strongest fraud signal available and one no reviewer could spot
     * unaided — the same person applying twice is ordinary, two different gyms
     * sending one byte-for-byte identical file is not.
     */
    findDuplicateDocuments: async (sha256, exceptId) => {
      if (!sha256) return [];

      const { data: docs } = await db
        .from('application_documents')
        .select('id, application_id, uploaded_at')
        .eq('sha256', sha256)
        .neq('id', exceptId)
        .limit(10);

      if (!docs?.length) return [];

      const { data: apps } = await db
        .from('gym_applications')
        .select('id, proposed_gym_name')
        .in('id', docs.map((d) => d.application_id));

      const names = new Map((apps ?? []).map((a) => [a.id, a.proposed_gym_name]));
      return docs.map((d) => ({ ...d, proposed_gym_name: names.get(d.application_id) ?? null }));
    },

    /** Just enough of the application to compare a document against. */
    getApplicationSummary: async (applicationId) => {
      const { data } = await db
        .from('gym_applications')
        .select('id, proposed_gym_name, city, country, submitted_at, status')
        .eq('id', applicationId)
        .maybeSingle();
      return data ?? null;
    },

    /** A short-lived read link, for the reviewer only. Minutes, not days. */
    signedDocumentUrl: async (storageRef, seconds = 300) => {
      const { data, error } = await db.storage.from(DOCUMENT_BUCKET).createSignedUrl(storageRef, seconds);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Running the platform: plans, the audit log, owners, money
// ---------------------------------------------------------------------------

export function platformControlDeps(db = platformDb()) {
  return {
    // ---- plans and prices -------------------------------------------------
    listPlans: async () => {
      const { data } = await db.from('platform_plans').select('*').order('max_active_members', { ascending: true });
      return data ?? [];
    },

    updatePlan: async (key, patch) => {
      const { error } = await db
        .from('platform_plans')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('key', key);
      // Checked: a silently failed price change means every gym on that plan
      // carries on being billed the old amount, or nothing at all.
      if (error) throw new Error(`Could not save that plan: ${error.message}`);
    },

    // ---- the audit log ----------------------------------------------------
    listAuditLog: async ({ action = '', entityId = '', limit = 200 } = {}) => {
      let q = db
        .from('platform_audit_log')
        .select('id, action, actor_kind, actor_user_id, entity, entity_id, detail, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(limit) || 200, 500));

      if (action) q = q.ilike('action', `%${action}%`);
      if (entityId) q = q.eq('entity_id', entityId);

      const { data } = await q;
      return data ?? [];
    },

    // ---- gym owners -------------------------------------------------------
    listOwners: async ({ query = '', limit = 100 } = {}) => {
      let q = db
        .from('platform_users')
        .select('id, email, full_name, is_active, created_at')
        .eq('kind', 'gym_owner')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(limit) || 100, 200));

      // `or` rather than two queries: a search that only matched email would
      // fail every time someone typed a name, which is what people type.
      if (query) q = q.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`);

      const { data: owners } = await q;
      if (!owners?.length) return [];

      const { data: gyms } = await db
        .from('gyms')
        .select('owner_user_id')
        .in('owner_user_id', owners.map((o) => o.id));

      const counts = new Map();
      for (const g of gyms ?? []) counts.set(g.owner_user_id, (counts.get(g.owner_user_id) ?? 0) + 1);

      return owners.map((o) => ({ ...o, gym_count: counts.get(o.id) ?? 0 }));
    },

    /**
     * Switch an owner account on or off.
     *
     * This stops them SIGNING IN. It does not close their gym and deletes
     * nothing — "this account is compromised" and "this gym stopped paying"
     * are different problems and want different buttons.
     */
    setOwnerActive: async (userId, active) => {
      const { error } = await db
        .from('platform_users')
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', userId)
        // Guarded: this screen manages gym owners. A bug that let it disable a
        // platform_staff row could lock every administrator out at once.
        .eq('kind', 'gym_owner');
      if (error) throw new Error(`Could not change that account: ${error.message}`);
    },

    /**
     * Counts for one gym (D-130). COUNTS ONLY, NEVER NAMES.
     *
     * The client is scoped to that gym's schema and handed straight to
     * gymStats(), which uses `head: true` so no member row is ever sent back.
     * The safety is in how the queries are built, not in what this function
     * remembers to do with the results afterwards.
     *
     * EVERY READ IS AUDITED. Reaching into a gym's own schema is something the
     * platform should have to account for, even when all it takes is a number.
     */
    gymStatsFor: async (gym, actorUserId = null) => {
      const { data: connection } = await db
        .from('gym_connections')
        .select('schema_name, supabase_url')
        .eq('gym_id', gym.id)
        .maybeSingle();

      if (!connection?.schema_name) {
        return { activeMembers: null, checkinsThisMonth: null, lastActivityAt: null, reachable: false };
      }

      const client = createClient(
        connection.supabase_url || process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          db: { schema: connection.schema_name },
        }
      );

      const stats = await gymStats(client);

      await audit(db, {
        action: 'platform.gym.stats_read',
        actor_user_id: actorUserId,
        entity: 'gym',
        entity_id: gym.id,
        // The numbers, never anything they were counted from.
        detail: { active_members: stats.activeMembers, reachable: stats.reachable },
      });

      return stats;
    },

    /**
     * Move a gym to another plan.
     *
     * The plan is written to BOTH `gyms.plan_key` (which entitlement
     * resolution reads on every request) and the live subscription (which
     * billing reads). Writing only one would give a gym the features of one
     * plan and the invoice of another.
     */
    changeGymPlan: async (gymId, planKey) => {
      const { data: plan } = await db.from('platform_plans').select('id').eq('key', planKey).maybeSingle();
      if (!plan) throw new Error(`No such plan: ${planKey}`);

      const now = new Date().toISOString();
      const { error } = await db.from('gyms').update({ plan_key: planKey, updated_at: now }).eq('id', gymId);
      if (error) throw new Error(`Could not change the plan: ${error.message}`);

      await db
        .from('platform_subscriptions')
        .update({ plan_id: plan.id, updated_at: now })
        .eq('gym_id', gymId)
        .in('status', ['trialing', 'active', 'past_due']);
    },

    // ---- money ------------------------------------------------------------
    /**
     * What the platform has been paid and what it is owed.
     *
     * Deliberately computed from `platform_invoices` only. A member's payment
     * to their gym never appears here and never can — the platform does not
     * hold it (D-013).
     */
    financeSummary: async () => {
      const [{ data: invoices }, { data: subs }, { data: plans }] = await Promise.all([
        db.from('platform_invoices').select('status, amount_cents, currency').limit(5000),
        db.from('platform_subscriptions').select('status'),
        db.from('platform_plans').select('key, price_cents, is_enabled'),
      ]);

      let paid = 0;
      let outstanding = 0;
      for (const i of invoices ?? []) {
        if (i.status === 'paid') paid += Number(i.amount_cents) || 0;
        else if (i.status === 'issued' || i.status === 'overdue') outstanding += Number(i.amount_cents) || 0;
      }

      const byStatus = {};
      for (const s of subs ?? []) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;

      // The most expensive thing that can quietly be true here: gyms using the
      // platform on a plan with no price, so no invoice is ever raised.
      const unpriced = (plans ?? [])
        .filter((p) => p.is_enabled !== false && (!Number.isInteger(p.price_cents) || p.price_cents <= 0))
        .map((p) => p.key);

      return {
        currency: invoices?.[0]?.currency || 'ZAR',
        paid_cents: paid,
        outstanding_cents: outstanding,
        gyms_by_status: byStatus,
        unpriced_plans: unpriced,
      };
    },
  };
}
