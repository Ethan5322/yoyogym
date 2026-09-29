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
import { schemaRunnerDeps, gymSchemaChecksum, runSql, canReachProject } from './schema-runner.js';
import { runBilling } from './billing-runner.js';
import { issueActivation, activationLookupHash } from './activation.js';
import { DOCUMENT_BUCKET } from './documents.js';
import {
  sendEmail,
  activationEmail,
  billingEmail,
  emailConfigured,
  passwordResetEmail,
  applicationReceivedEmail,
  decisionEmail,
  staffInviteEmail,
} from './email.js';
import { purgeExpiredDocuments } from './retention.js';
import { directoryRow } from './member-directory.js';
import { fileFacts } from './forensics.js';
import { gymStats } from './stats.js';
import { gymOwnerAccount } from './gym-admin.js';
import { reconcileSchemas } from './reconciliation.js';
import { GRACE_DAYS } from './billing.js';
import { chargeAuthorization, paystackConfigured, initializeSubscriptionPayment, verifyTransaction } from './paystack.js';
import { makeLimiter } from './ratelimit.js';
import { platformBaseUrl } from './base-url.js';
import { provisioningReadiness } from './provisioning-config.js';
import { ownerId, AGREEMENT_VERSION } from './agreement.js';
import { issueInvite, inviteLookupHash, roleLabel, INVITE_TTL_HOURS } from './team.js';
import { ALL_SERVICES, CORE_FEATURES } from '../shared/features.js';
import {
  coordinate, haversineKm, nearestGyms, likeTerm, RESULT_LIMIT, BOX_FETCH,
} from './gym-search.js';

let _db = null;

// MODULE LEVEL, not inside platformDeps(). The factory runs on every request,
// so a limiter built inside it would start every request at a count of zero —
// a limit in name only.
//
// Five lookups per ten minutes per address: a member who has forgotten their
// gym needs one or two, and anyone needing fifty is asking about other people.
const findGymLimiter = makeLimiter({ key: 'find-gym', limit: 5, windowMs: 10 * 60_000 });

// Password-reset requests: each one sends an email, so without a limit the
// form is a way to flood someone's inbox from our address.
const resetLimiter = makeLimiter({ key: 'password-reset', limit: 5, windowMs: 15 * 60_000 });

/**
 * Search text that is safe inside a PostgREST `or(...)` filter.
 *
 * The staff search boxes build `name.ilike.%text%,city.ilike.%text%`. A comma
 * or a bracket in what was typed changes the SHAPE of that filter — a search
 * for "a,status.eq.x" becomes a second condition — so everything but letters,
 * digits, spaces and the characters of a name or an email is dropped.
 */
export function searchText(raw) {
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N}\s@.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Append to the platform audit log. Never throws into a request.
 *
 * `entity_id` is a uuid column. A plan is named by its key ('basic') and the
 * support contacts by 'support', and either one made Postgres refuse the WHOLE
 * row — so no price change and no support-contact change was ever recorded.
 * A key that is not an id is kept in `detail.entity_key` instead.
 *
 * supabase-js RETURNS its error rather than throwing it, so the catch below
 * never saw one: the refusal was silent. It is now logged.
 */
export async function audit(db, entry) {
  const id = entry.entity_id ?? null;
  const isId = id === null || UUID.test(String(id));
  try {
    const { error } = await db.from('platform_audit_log').insert({
      actor_user_id: entry.actor_user_id ?? null,
      actor_kind: entry.actor_kind ?? 'platform_staff',
      action: entry.action,
      entity: entry.entity ?? null,
      entity_id: isId ? id : null,
      detail: isId ? entry.detail ?? null : { ...(entry.detail || {}), entity_key: String(id) },
    });
    if (error) console.error('platform audit failed:', entry.action, error.message);
  } catch (err) {
    console.error('platform audit failed:', err?.message);
  }
}

/** The permissions granted to a platform user, via their roles. */
async function permissionsFor(db, userId) {
  // A SWITCHED-OFF ACCOUNT HOLDS NOTHING. Switching someone off used to stop
  // only their next sign-in: an open session kept every role for up to eight
  // hours. Checked here, where every permission is read, so it applies to the
  // next click (CLAUDE.md §40.1 Q4).
  const { data: account } = await db.from('platform_users').select('is_active').eq('id', userId).maybeSingle();
  if (!account || account.is_active === false) return [];

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
    /** For the health check: does the app see ANY platform user? */
    countUsers: async () => {
      // NOT `head: true`, and that is the whole point.
      //
      // A HEAD request returns no body, so when PostgREST refuses one there is
      // no body to carry the reason — the error arrives as {"message":""} and
      // the diagnostic that exists to explain the failure cannot. Asking for
      // one column of one row costs nothing and comes back with a readable
      // error when it fails.
      //
      // `id` only: a uuid from the platform's own table, never a name or an
      // email.
      const { count, error } = await db
        .from('platform_users')
        .select('id', { count: 'exact' })
        .limit(1);

      // THE WHOLE ERROR, not just `.message`.
      //
      // A PostgREST error carries message, details, hint and code, and the
      // useful one varies by failure. Taking only `.message` produced the
      // word "Error" and nothing else on a real diagnostic run — which is
      // exactly the situation this endpoint exists to end.
      if (error) {
        const parts = [
          error.message,
          error.code && `code=${error.code}`,
          error.status && `status=${error.status}`,
          error.details,
          error.hint,
        ]
          .filter(Boolean)
          .join(' | ');

        throw new Error(parts || `Empty error object: ${JSON.stringify(error)}`);
      }

      return count ?? 0;
    },

    saveRecoveryCodes: async (userId, hashes) => {
      const { error } = await db
        .from('platform_users')
        .update({ recovery_code_hashes: hashes, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw new Error(`Could not save the new codes: ${error.message}`);
    },

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

    /** The failed-sign-in counter and lock (platform/login.js decides the values). */
    saveLoginState: async (userId, patch) => {
      const { error } = await db.from('platform_users').update(patch).eq('id', userId);
      // Thrown, not ignored: a lockout that silently fails to record is the
      // bug this dependency was written to fix.
      if (error) throw new Error(`Could not record sign-in state: ${error.message}`);
    },

    rateLimitFindGym: (req) => findGymLimiter(req),

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
    listApplications: async ({ status = '', query = '' } = {}) => {
      let q = db
        .from('gym_applications')
        .select('id, proposed_gym_name, status, city, country, requested_plan_key, submitted_at')
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (status) q = q.in('status', String(status).split(','));
      const term = searchText(query);
      if (term) q = q.or(`proposed_gym_name.ilike.%${term}%,city.ilike.%${term}%`);
      const { data } = await q;
      return data ?? [];
    },

    /** How many applications are in each state, for the queue's tabs. */
    countApplications: async () => {
      const { data } = await db.from('gym_applications').select('status').limit(10000);
      const counts = {};
      for (const a of data ?? []) counts[a.status] = (counts[a.status] ?? 0) + 1;
      return counts;
    },

    getApplicationView: async (id) => {
      const { data: application } = await db.from('gym_applications').select('*').eq('id', id).maybeSingle();
      if (!application) return null;

      const [{ data: documents }, { data: events }, { data: applicant }] = await Promise.all([
        db.from('application_documents').select('*').eq('application_id', id),
        db.from('application_events').select('*').eq('application_id', id).order('created_at', { ascending: false }),
        // WHO applied (CLAUDE.md §40.1 F-40.3): the reviewer could see the
        // gym's name and city and nothing about the person asking for it.
        db.from('platform_users').select('full_name, email').eq('id', application.applicant_user_id).maybeSingle(),
      ]);

      return { application, applicant: applicant ?? null, documents: documents ?? [], events: events ?? [] };
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
        // The documents the approval rule reads (CLAUDE.md §40.1 Q3).
        listDocuments: async (id) => {
          const { data, error } = await db.from('application_documents').select('doc_type, status').eq('application_id', id);
          // A read that failed is not "no documents": say so, rather than
          // refusing with a list of documents that may well be there.
          if (error) throw new Error(`Could not read the documents: ${error.message}`);
          return data ?? [];
        },
        setDocumentRetention: async (applicationId, until) => {
          await db.from('application_documents').update({ retention_until: until }).eq('application_id', applicationId);
        },
        provisionGym: (application, opts) => provisionGym(application, provisioningDeps(db), { ...opts, schemaChecksum: safeChecksum() }),
        canReachProject: () => canReachProject({ projectRef: process.env.SUPABASE_PROJECT_REF }),
        audit: (e) => audit(db, e),
      };

      const dryRun = process.env.PLATFORM_PROVISION_LIVE !== 'true';

      if (action === 'approve') {
        // Switched on but not fully set up: refused BEFORE the decision is
        // recorded, naming what is missing. Otherwise the first provisioning
        // step fails after "approved" is written, and the owner is stranded.
        const readiness = provisioningReadiness();
        if (readiness.live && !readiness.ready) {
          return {
            ok: false,
            notReady: true,
            error: 'Nothing was approved: this server is not fully set up to create gyms. ' + readiness.problems.join(' '),
          };
        }
        return approveApplication(applicationId, actor, appDeps, { dryRun });
      }

      const outcome =
        action === 'reject'
          ? await rejectApplication(applicationId, actor, reason, appDeps)
          : await requestMoreInfo(applicationId, actor, reason, appDeps);
      if (!outcome.ok) return outcome;

      // TELL THE OWNER (CLAUDE.md §40.1 F-40.5). The email for both decisions
      // was written and never sent: a rejected owner, or one asked for more,
      // heard nothing and saw nothing. A failed send does not undo the
      // decision; the reviewer is told, with the address to contact by hand.
      const { data: applicant } = await db
        .from('platform_users')
        .select('email')
        .eq('id', outcome.application.applicant_user_id)
        .maybeSingle();
      const mail = decisionEmail({
        gymName: outcome.application.proposed_gym_name,
        decision: action === 'reject' ? 'rejected' : 'info_requested',
        reason,
        signInUrl: `${platformBaseUrl()}/platform/login?as=owner`,
      });
      let sent = { ok: false, reason: 'no email address on the account' };
      if (applicant?.email) {
        try {
          sent = await sendEmail({ to: applicant.email, ...mail });
        } catch (err) {
          sent = { ok: false, reason: err?.message || 'the email could not be sent' };
        }
      }
      if (!sent.ok) {
        await audit(db, {
          action: 'platform.application.decision_email_failed',
          actor_user_id: session.sub,
          entity: 'application',
          entity_id: applicationId,
          detail: { decision: action, reason: sent.reason ?? null },
        });
      }
      return { ...outcome, emailed: Boolean(sent.ok), emailTo: applicant?.email ?? null, emailReason: sent.reason ?? null };
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

      let { data: user } = await db
        .from('platform_users')
        .select('id, kind, is_active, password_hash')
        .eq('email', input.email)
        .maybeSingle();

      // AN EXISTING ACCOUNT MUST BE PROVEN, NOT ASSUMED.
      //
      // This used to reuse any account with the typed email, without checking
      // the password — so anyone could file applications under someone else's
      // account (a Yoyo staff member's included) just by typing their address,
      // and an approval would hand that person a gym they never asked for.
      // Now: the same password, an active gym-owner account, or no.
      if (user) {
        const proven =
          user.kind === 'gym_owner' &&
          user.is_active !== false &&
          user.password_hash &&
          (await verifyPassword(input.password, user.password_hash));
        if (!proven) {
          return {
            ok: false,
            error:
              'This email already has a Yoyo Gyms account. Use that account\'s password, ' +
              'or reset it from the sign-in page if you have forgotten it.',
          };
        }
      }

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

      const row = {
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
      };
      // CLAUDE.md §40.1 Q2. Written separately so that, before
      // 2026-09-28-main-admin-panel.sql has run, the application is still
      // saved — without these two answers — rather than lost.
      const contact = {
        owner_phone: input.phone || null,
        gym_address: input.address || null,
        // Which Gym Owner Agreement they ticked, and when (§41.1 Q5).
        terms_version: input.accepted_terms ? AGREEMENT_VERSION : null,
        terms_accepted_at: input.accepted_terms ? new Date().toISOString() : null,
      };

      let { data: application, error: appErr } = await db
        .from('gym_applications')
        .insert({ ...row, ...contact })
        .select('id')
        .single();
      if (appErr && /owner_phone|gym_address|terms_version|terms_accepted_at/.test(appErr.message || '')) {
        console.error('gym_applications is missing new columns — run the latest platform migrations');
        ({ data: application, error: appErr } = await db.from('gym_applications').insert(row).select('id').single());
      }

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
        detail: { gym_name: input.gym_name, plan: input.plan_key, terms_version: input.accepted_terms ? AGREEMENT_VERSION : null },
      });

      // A confirmation, saying what happens next and where to upload the
      // documents. Best-effort: a mail failure must never lose an application.
      try {
        await sendEmail({
          to: input.email,
          ...applicationReceivedEmail({ gymName: input.gym_name, signInUrl: `${platformBaseUrl()}/platform/login` }),
        });
      } catch {
        /* the application is saved; the page already says what to do */
      }

      return { ok: true, applicationId: application.id };
    },

    // ---- public: gym search ----------------------------------------------
    searchGyms: async ({ query, lat, lng }) => {
      const here = coordinate(lat) !== null && coordinate(lng) !== null;

      const base = (limit) => {
        let q = db
          .from('gyms')
          // Only what a stranger may know. No schema name, no connection.
          .select('slug, search_name, city, country, latitude, longitude')
          .eq('status', 'active')
          .limit(limit);
        if (query) q = q.ilike('search_name', likeTerm(query));
        return q;
      };

      // A failed query is not "no gyms". Returned as empty, a member is told
      // their gym is not on Yoyo Gyms when the truth is that we are down.
      const rows = async (q) => {
        const { data, error } = await q;
        if (error) throw new Error(`Gym search failed: ${error.message}`);
        return data ?? [];
      };

      let gyms;

      if (query) {
        // The NAME narrows it. Distance only orders the matches, and a
        // matching gym that has not given a location is still shown — last,
        // rather than hidden for a missing field.
        gyms = await rows(base(BOX_FETCH));
        if (here) {
          for (const g of gyms) g.distance_km = haversineKm(lat, lng, g.latitude, g.longitude);
          gyms.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
        }
        gyms = gyms.slice(0, RESULT_LIMIT);
      } else if (here) {
        // "Show the nearest whatever the distance" (D-073): an empty screen
        // looks broken, and a member told the closest gym is 80 km away has
        // learned something true and useful. So the box widens until it finds
        // something — see platform/gym-search.js for why it is a box at all.
        gyms = await nearestGyms(
          (box, limit) =>
            rows(
              box
                ? base(limit)
                    .gte('latitude', box.minLat).lte('latitude', box.maxLat)
                    .gte('longitude', box.minLng).lte('longitude', box.maxLng)
                : base(limit).not('latitude', 'is', null).not('longitude', 'is', null)
            ),
          coordinate(lat),
          coordinate(lng)
        );
      } else {
        gyms = [];
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

    listGyms: async ({ query = '', status = '', setup = false, from = 0, to = 49, limit = null } = {}) => {
      // `count: 'exact'` alongside the rows: the reader is told how many gyms
      // exist, not just how many fitted on this page. A list that ENDS looks
      // finished, and somebody would conclude a gym does not exist because it
      // was on page four.
      let q = db
        .from('gyms')
        .select('id, slug, search_name, city, country, status, plan_key, created_at', { count: 'exact' })
        .order('created_at', { ascending: false });

      q = limit ? q.limit(Math.min(Number(limit), 500)) : q.range(from, to);

      // A list capped at 500 with no search is not a registry at ten thousand
      // gyms — it is the newest 500 gyms.
      const term = searchText(query);
      if (term) q = q.or(`search_name.ilike.%${term}%,slug.ilike.%${term}%,city.ilike.%${term}%`);
      if (status) q = q.eq('status', status);
      if (setup) q = q.not('setup_help_requested_at', 'is', null).is('setup_help_done_at', null);

      const { data, count: total } = await q;
      const gyms = data ?? [];
      // The total rides along on the array, so every existing caller that just
      // iterates it keeps working unchanged.
      gyms.total = Number.isInteger(total) ? total : null;
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

      const [{ data: subscription }, { data: invoices }, { data: owner }, { data: plan }, { data: application }] =
        await Promise.all([
          db.from('platform_subscriptions').select('*').eq('gym_id', gymId).maybeSingle(),
          db.from('platform_invoices').select('*').eq('gym_id', gymId).order('issued_at', { ascending: false }).limit(24),
          // WHO runs it (F-40.7): the registry named a gym and never its owner.
          gym.owner_user_id
            ? db.from('platform_users').select('id, full_name, email, is_active, last_login_at').eq('id', gym.owner_user_id).maybeSingle()
            : Promise.resolve({ data: null }),
          gym.plan_key
            ? db.from('platform_plans').select('key, label, max_active_members, price_cents, currency, features').eq('key', gym.plan_key).maybeSingle()
            : Promise.resolve({ data: null }),
          db.from('gym_applications').select('id, owner_phone').eq('slug', gym.slug).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
        ]);

      // Note what is NOT selected: gym_connections and gym_secrets. Nobody
      // reviewing a gym's billing needs its schema name or its keys (D-044).
      return {
        gym,
        subscription: subscription ?? null,
        invoices: invoices ?? [],
        owner: owner ?? null,
        plan: plan ?? null,
        application: application ?? null,
      };
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
        callbackUrl: `${platformBaseUrl()}/platform/pay/callback`,
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

    /**
     * Create the owner's account INSIDE their own gym.
     *
     * This is the step that was missing. Without it onboarding finished with
     * an owner holding a platform login, a provisioned gym, and no way into
     * it — the gym admin panel had no account to sign into and the only way
     * to make one was a script run by hand on somebody's laptop.
     *
     * Returns false rather than throwing on a foreseeable failure, so the
     * caller can keep the owner's activation link alive and let them retry.
     */
    createGymAdmin: async ({ gymId, userId, password }) => {
      const [{ data: owner }, { data: connection }] = await Promise.all([
        db.from('platform_users').select('email, full_name').eq('id', userId).maybeSingle(),
        db.from('gym_connections').select('schema_name, supabase_url').eq('gym_id', gymId).maybeSingle(),
      ]);

      // No schema means the gym was never provisioned. That is not something
      // the owner can fix by trying again, and pretending it worked would
      // hide it until they tried to sign in.
      if (!connection?.schema_name) return false;

      const account = await gymOwnerAccount({
        email: owner?.email,
        fullName: owner?.full_name,
        password,
      });

      const client = createClient(
        connection.supabase_url || process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          db: { schema: connection.schema_name },
        }
      );

      // ON CONFLICT ON THE USERNAME, so a retried activation sets the password
      // again instead of failing on a unique constraint. An owner who clicks
      // their link twice gets the password from the second attempt, which is
      // the one they can remember.
      const { error } = await client
        .from('admin_users')
        .upsert(account, { onConflict: 'username' });

      if (error) return false;

      // The gym's own audit log is written by the gym's own system. This one
      // records that the PLATFORM reached in — WITHOUT the password, and
      // without the hash.
      await audit(db, {
        action: 'platform.gym.owner_account_created',
        actor_kind: 'gym_owner',
        actor_user_id: userId,
        entity: 'gym',
        entity_id: gymId,
        detail: { username: account.username, role: account.role },
      });

      return true;
    },

    // ---- password reset (platform/password-reset.js) -------------------
    saveReset: async (row) => {
      const { error } = await db.from('password_resets').insert(row);
      if (error) throw new Error(`Could not create the reset: ${error.message}`);
    },

    findReset: async (tokenHash) => {
      const { data } = await db.from('password_resets').select('*').eq('token_hash', tokenHash).maybeSingle();
      return data ?? null;
    },

    markResetsUsed: async (userId, at) => {
      await db.from('password_resets').update({ used_at: at }).eq('user_id', userId).is('used_at', null);
    },

    /** Every gym this account owns — each has a gym-side sign-in to keep in step. */
    gymsOwnedBy: async (userId) => {
      const { data, error } = await db.from('gyms').select('id').eq('owner_user_id', userId);
      if (error) throw new Error(`Could not read the owner's gyms: ${error.message}`);
      return (data ?? []).map((g) => g.id);
    },

    sendResetEmail: async ({ to, token }) => {
      const base = platformBaseUrl(); // absolute — see platform/base-url.js
      const link = `${base}/platform/reset?token=${encodeURIComponent(token)}`;
      return sendEmail({ to, ...passwordResetEmail({ link }) });
    },

    rateLimitReset: (req) => resetLimiter(req),

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
    /** Old links stop working when a new one is sent (F-40.9). */
    retireActivations: async (userId, gymId) => {
      await db
        .from('owner_activations')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('gym_id', gymId)
        .is('used_at', null);
    },

    issueActivation: async ({ userId, gymId }) => {
      const { row, token, code } = issueActivation({ userId, gymId });

      const { error } = await db.from('owner_activations').insert(row);
      if (error) throw new Error(`Could not create the activation: ${error.message}`);

      const base = platformBaseUrl(); // absolute — see platform/base-url.js
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

      const [{ data: subscription }, { data: documents }, { data: me }, { data: named }] = await Promise.all([
        gym
          ? db.from('platform_subscriptions').select('*').eq('gym_id', gym.id).maybeSingle()
          : Promise.resolve({ data: null }),
        application
          ? db.from('application_documents').select('*').eq('application_id', application.id)
          : Promise.resolve({ data: [] }),
        // Before the migration adds the column this errors; the page then
        // simply shows no pending request, rather than failing to load.
        db.from('platform_users').select('closure_requested_at').eq('id', userId).maybeSingle(),
        // Separate from the line above, which fails until its migration runs.
        db.from('platform_users').select('full_name').eq('id', userId).maybeSingle(),
      ]);

      return {
        application: application ?? null,
        gym: gym ?? null,
        subscription: subscription ?? null,
        documents: documents ?? [],
        closureRequestedAt: me?.closure_requested_at ?? null,
        ownerName: named?.full_name ?? '',
        ownerRef: ownerId(userId),
      };
    },

    /**
     * An owner asks to close their account (store requirement: account
     * deletion from inside the app and on the web).
     *
     * RECORDS THE REQUEST; DELETES NOTHING. Closing an owner's account means
     * closing a gym that has members, payments and legal records — a person
     * must look at it. It appears on the platform's home page and owner list,
     * and is carried out with the switches that already exist: deactivate the
     * owner, suspend the gym. D-071: after 90 suspended days the gym is REPORTED;
     * deleting its data is a human decision, and no code does it yet.
     */
    requestClosure: async (userId) => {
      const { error } = await db
        .from('platform_users')
        .update({ closure_requested_at: new Date().toISOString() })
        .eq('id', userId)
        .is('closure_requested_at', null); // asking twice does not reset the clock
      if (error) throw new Error(`Could not record the request: ${error.message}`);
      await audit(db, {
        action: 'platform.owner.closure_requested',
        actor_kind: 'gym_owner',
        actor_user_id: userId,
      });
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

    /**
     * The owner answered a request for more: the application returns to the
     * review queue. Only THEIR application, and only from info_requested, so
     * it cannot reopen a decided one.
     */
    resumeReview: async (applicationId, userId) => {
      const now = new Date().toISOString();
      const { data } = await db
        .from('gym_applications')
        .update({ status: 'under_review', updated_at: now })
        .eq('id', applicationId)
        .eq('applicant_user_id', userId)
        .eq('status', 'info_requested')
        .select('id');
      if (data?.length) {
        await db.from('application_events').insert({
          application_id: applicationId,
          event: 'documents_received',
          actor_user_id: userId,
          created_at: now,
        });
      }
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
    signedDocumentUrl: async (storageRef, seconds = 300, { download = null } = {}) => {
      const { data, error } = await db.storage
        .from(DOCUMENT_BUCKET)
        .createSignedUrl(storageRef, seconds, download ? { download } : undefined);
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
    ...teamAndActivityDeps(db),
    ...servicesAndSupportDeps(db),
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
    listAuditLog: async ({ action = '', entityId = '', from = 0, to = 49, limit = null } = {}) => {
      let q = db
        .from('platform_audit_log')
        .select('id, action, actor_kind, actor_user_id, entity, entity_id, detail, created_at', { count: 'exact' })
        .order('created_at', { ascending: false });

      // The security screen and the dashboard want a WINDOW to analyse, not a
      // page to read, so they pass a limit instead.
      q = limit ? q.limit(Math.min(Number(limit), 500)) : q.range(from, to);

      if (action) q = q.ilike('action', `%${action}%`);
      if (entityId) q = q.eq('entity_id', entityId);

      const { data, count: total } = await q;
      const entries = data ?? [];
      entries.total = Number.isInteger(total) ? total : null;
      return entries;
    },

    // ---- gym owners -------------------------------------------------------
    listOwners: async ({ query = '', from = 0, to = 49 } = {}) => {
      const build = (columns) => {
        let q = db
          .from('platform_users')
          .select(columns, { count: 'exact' })
          .eq('kind', 'gym_owner')
          .order('created_at', { ascending: false })
          .range(from, to);
        // `or` rather than two queries: a search that only matched email would
        // fail every time someone typed a name, which is what people type.
        const term = searchText(query);
        if (term) q = q.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
        return q;
      };

      const BASE = 'id, email, full_name, is_active, created_at';
      let result = await build(`${BASE}, closure_requested_at`);
      // Before 2026-09-24-account-closure.sql runs the column does not exist.
      // Without this retry the query fails and the owner list comes back
      // EMPTY — a list that looks complete and says there are no owners.
      if (result.error) result = await build(BASE);

      const { data, count: total } = result;
      const owners = data ?? [];
      owners.total = Number.isInteger(total) ? total : null;
      if (!owners.length) return owners;

      const { data: gyms } = await db
        .from('gyms')
        .select('owner_user_id')
        .in('owner_user_id', owners.map((o) => o.id));

      const counts = new Map();
      for (const g of gyms ?? []) counts.set(g.owner_user_id, (counts.get(g.owner_user_id) ?? 0) + 1);

      const withCounts = owners.map((o) => ({ ...o, gym_count: counts.get(o.id) ?? 0 }));
      withCounts.total = owners.total;
      return withCounts;
    },

    /** Owners who have asked to close their account and are still active. */
    countClosureRequests: async () => {
      const { count, error } = await db
        .from('platform_users')
        .select('id', { count: 'exact', head: true })
        .not('closure_requested_at', 'is', null)
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      return count ?? 0;
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
        db.from('platform_subscriptions').select('status, plan_id, gym_id, trial_ends_at'),
        db.from('platform_plans').select('id, key, price_cents, is_enabled'),
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

      // What the platform earns a month from gyms that are paying now: each
      // active (or late) subscription at its plan's price. Trials are counted
      // separately — they pay nothing yet.
      const priceOf = new Map((plans ?? []).map((p) => [p.id, Number.isInteger(p.price_cents) ? p.price_cents : 0]));
      let mrr = 0;
      const soon = Date.now() + 7 * 86_400_000;
      const trialsEnding = [];
      for (const sub of subs ?? []) {
        if (sub.status === 'active' || sub.status === 'past_due') mrr += priceOf.get(sub.plan_id) ?? 0;
        if (sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() <= soon) {
          trialsEnding.push({ gym_id: sub.gym_id, trial_ends_at: sub.trial_ends_at });
        }
      }

      return {
        currency: invoices?.[0]?.currency || 'ZAR',
        paid_cents: paid,
        outstanding_cents: outstanding,
        mrr_cents: mrr,
        gyms_by_status: byStatus,
        unpriced_plans: unpriced,
        trials_ending: trialsEnding,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The staff team, and what the panel shows about every gym at once
// (CLAUDE.md §40.1 Q4, F-40.7)
// ---------------------------------------------------------------------------

function teamAndActivityDeps(db) {
  /** Role keys per user id, for the given users. */
  const rolesFor = async (userIds) => {
    if (!userIds.length) return new Map();
    const { data } = await db
      .from('platform_user_roles')
      .select('user_id, platform_roles(key)')
      .in('user_id', userIds);
    const roles = new Map();
    for (const r of data ?? []) {
      const key = r.platform_roles?.key;
      if (!key) continue;
      roles.set(r.user_id, [...(roles.get(r.user_id) ?? []), key]);
    }
    return roles;
  };

  const roleId = async (key) => {
    const { data } = await db.from('platform_roles').select('id').eq('key', key).maybeSingle();
    if (!data) throw new Error(`No such role: ${key}`);
    return data.id;
  };

  const sendInvite = async ({ user, role, token }) => {
    const link = `${platformBaseUrl()}/platform/join?token=${encodeURIComponent(token)}`;
    let sent = { ok: false, reason: 'no email address' };
    try {
      sent = await sendEmail({
        to: user.email,
        ...staffInviteEmail({ name: user.full_name, roleLabel: roleLabel(role), link, expiresInHours: INVITE_TTL_HOURS }),
      });
    } catch (err) {
      sent = { ok: false, reason: err?.message || 'send failed' };
    }
    return { link, emailed: Boolean(sent.ok), emailReason: sent.reason ?? null, to: user.email };
  };

  return {
    /** Everyone on the Yoyo staff, with their roles and whether they have finished setting up. */
    listStaff: async () => {
      const { data } = await db
        .from('platform_users')
        .select('id, email, full_name, is_active, totp_enabled, password_hash, last_login_at, created_at')
        .eq('kind', 'platform_staff')
        .order('created_at', { ascending: true });
      const staff = data ?? [];
      const roles = await rolesFor(staff.map((s) => s.id));
      // The hash itself never leaves this function: only whether one exists.
      return staff.map(({ password_hash, ...s }) => ({ ...s, set_up: Boolean(password_hash), roles: roles.get(s.id) ?? [] }));
    },

    staffMember: async (userId) => {
      const { data } = await db
        .from('platform_users')
        .select('id, email, full_name, is_active, password_hash')
        .eq('id', userId)
        .eq('kind', 'platform_staff')
        .maybeSingle();
      if (!data) return null;
      const roles = await rolesFor([data.id]);
      const { password_hash, ...member } = data;
      return { ...member, set_up: Boolean(password_hash), roles: roles.get(data.id) ?? [] };
    },

    /** Active accounts holding platform_owner — the rule that keeps one always. */
    countActiveOwners: async () => {
      const id = await roleId('platform_owner');
      const { data } = await db.from('platform_user_roles').select('user_id').eq('role_id', id);
      const ids = (data ?? []).map((r) => r.user_id);
      if (!ids.length) return 0;
      const { count } = await db
        .from('platform_users')
        .select('id', { count: 'exact', head: true })
        .in('id', ids)
        .eq('is_active', true);
      return count ?? 0;
    },

    /**
     * Invite a person: an account with NO password, their role, and a
     * one-time link to set the password and the authenticator.
     */
    inviteStaff: async ({ email, fullName, role, invitedBy }) => {
      const address = String(email).trim().toLowerCase();
      const { data: existing } = await db.from('platform_users').select('id').eq('email', address).maybeSingle();
      if (existing) return { ok: false, error: 'That email already has a Yoyo Gyms account.' };

      const { data: user, error } = await db
        .from('platform_users')
        .insert({ email: address, full_name: String(fullName).trim(), kind: 'platform_staff', is_active: true })
        .select('id, email, full_name')
        .single();
      if (error) return { ok: false, error: 'The account could not be created.' };

      await db.from('platform_user_roles').insert({ user_id: user.id, role_id: await roleId(role), granted_by: invitedBy });

      const { row, token } = issueInvite({ userId: user.id, invitedBy });
      const { error: invErr } = await db.from('staff_invites').insert(row);
      if (invErr) return { ok: false, error: `The invitation could not be saved: ${invErr.message}` };

      await audit(db, {
        action: 'platform.staff.invited',
        actor_user_id: invitedBy,
        entity: 'platform_user',
        entity_id: user.id,
        detail: { email: address, role },
      });
      return { ok: true, userId: user.id, ...(await sendInvite({ user, role, token })) };
    },

    /** A new link for someone who has not set up yet. Older links stop working. */
    resendStaffInvite: async (userId, invitedBy) => {
      const { data: user } = await db
        .from('platform_users')
        .select('id, email, full_name, password_hash')
        .eq('id', userId)
        .eq('kind', 'platform_staff')
        .maybeSingle();
      if (!user) return { ok: false, error: 'That person is not on the team.' };
      if (user.password_hash) return { ok: false, error: 'They have already set up their account.' };

      const now = new Date().toISOString();
      await db.from('staff_invites').update({ used_at: now }).eq('user_id', userId).is('used_at', null);
      const { row, token } = issueInvite({ userId, invitedBy });
      const { error } = await db.from('staff_invites').insert(row);
      if (error) return { ok: false, error: `The invitation could not be saved: ${error.message}` };

      const roles = await rolesFor([userId]);
      await audit(db, { action: 'platform.staff.invite_resent', actor_user_id: invitedBy, entity: 'platform_user', entity_id: userId });
      return { ok: true, ...(await sendInvite({ user, role: (roles.get(userId) ?? [])[0], token })) };
    },

    /** The invite a link points at, with its account. */
    findInvite: async (token) => {
      if (!token) return null;
      const { data: invite } = await db
        .from('staff_invites')
        .select('id, user_id, expires_at, used_at')
        .eq('token_hash', inviteLookupHash(token))
        .maybeSingle();
      if (!invite) return null;
      const { data: user } = await db.from('platform_users').select('*').eq('id', invite.user_id).maybeSingle();
      return { invite, user: user ?? null };
    },

    markInviteUsed: async (inviteId) => {
      await db.from('staff_invites').update({ used_at: new Date().toISOString() }).eq('id', inviteId);
    },

    /** One role per person: the Team page offers one, so one is what they hold. */
    setStaffRole: async (userId, role, grantedBy) => {
      const id = await roleId(role);
      const { error: delErr } = await db.from('platform_user_roles').delete().eq('user_id', userId);
      if (delErr) throw new Error(`Could not change the role: ${delErr.message}`);
      const { error } = await db.from('platform_user_roles').insert({ user_id: userId, role_id: id, granted_by: grantedBy });
      if (error) throw new Error(`Could not change the role: ${error.message}`);
    },

    setStaffActive: async (userId, active) => {
      const { error } = await db
        .from('platform_users')
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .eq('kind', 'platform_staff');
      if (error) throw new Error(`Could not change that account: ${error.message}`);
    },

    // ---- every gym at once -------------------------------------------------
    /**
     * Counts for a page of gyms (F-40.7) — the same counts-only reads as one
     * gym's page (D-130), in parallel, with ONE audit entry for the page
     * rather than one per gym.
     */
    gymStatsForMany: async (gyms, actorUserId = null) => {
      const out = new Map();
      if (!gyms.length) return out;
      const { data: connections } = await db
        .from('gym_connections')
        .select('gym_id, schema_name, supabase_url')
        .in('gym_id', gyms.map((g) => g.id));
      const byGym = new Map((connections ?? []).map((c) => [c.gym_id, c]));

      await Promise.all(
        gyms.map(async (g) => {
          const c = byGym.get(g.id);
          if (!c?.schema_name) return out.set(g.id, { reachable: false });
          const client = createClient(c.supabase_url || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            db: { schema: c.schema_name },
          });
          return out.set(g.id, await gymStats(client));
        })
      );

      await audit(db, {
        action: 'platform.gym.stats_read',
        actor_user_id: actorUserId,
        entity: 'gym',
        detail: { gyms: gyms.length, view: 'registry' },
      });
      return out;
    },

    /** How many gyms are in each state — for Today. */
    countGyms: async () => {
      const { data } = await db.from('gyms').select('status').limit(20000);
      const counts = {};
      for (const g of data ?? []) counts[g.status] = (counts[g.status] ?? 0) + 1;
      return counts;
    },

    countOwners: async () => {
      const { count } = await db
        .from('platform_users')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'gym_owner');
      return count ?? 0;
    },
  };
}

// ---------------------------------------------------------------------------
// One gym's services, its account manager, setup help, and Yoyo's support
// contacts (CLAUDE.md §41)
// ---------------------------------------------------------------------------

/** Where support is reached, until the platform owner types otherwise (§41.1 Q7). */
export const DEFAULT_SUPPORT = { email: 'hello@mulesoo.com', whatsapp: '' };

/** Support contacts, cleaned: an email that looks like one, a phone in +digits. */
export function cleanSupport(value = {}) {
  const email = String(value.email ?? '').trim().toLowerCase();
  const digits = String(value.whatsapp ?? '').trim().replace(/[\s().-]/g, '').replace(/^00/, '+');
  return {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : DEFAULT_SUPPORT.email,
    whatsapp: /^\+\d{7,15}$/.test(digits) ? digits : '',
  };
}

async function readSupport(db) {
  const { data, error } = await db.from('platform_settings').select('value').eq('key', 'support').maybeSingle();
  // No table yet, or nothing saved: the defaults, never an error page.
  return error || !data ? { ...DEFAULT_SUPPORT } : cleanSupport(data.value);
}

function servicesAndSupportDeps(db) {
  return {
    getSupportContacts: () => readSupport(db),

    saveSupportContacts: async (value, by) => {
      const clean = cleanSupport(value);
      const { error } = await db
        .from('platform_settings')
        .upsert({ key: 'support', value: clean, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw new Error(`Could not save the support contacts: ${error.message}`);
      return clean;
    },

    /**
     * What the platform added or took away for ONE gym, on top of its plan
     * (§41.1 Q2). Only real, non-core service keys are stored.
     */
    setGymServices: async (gymId, { added = [], removed = [] }) => {
      const ok = (list) => ALL_SERVICES.filter((f) => !CORE_FEATURES.includes(f) && list.includes(f));
      const { error } = await db
        .from('gyms')
        .update({ features_added: ok(added), features_removed: ok(removed), updated_at: new Date().toISOString() })
        .eq('id', gymId);
      if (error) throw new Error(`Could not save this gym's services: ${error.message}`);
    },

    /** A named Yoyo contact for a gym (§41.1 Q6) — a staff member, or nobody. */
    setAccountManager: async (gymId, staffId) => {
      if (staffId) {
        const { data: staff } = await db
          .from('platform_users')
          .select('id')
          .eq('id', staffId)
          .eq('kind', 'platform_staff')
          .eq('is_active', true)
          .maybeSingle();
        if (!staff) throw new Error('That person is not an active member of the Yoyo team.');
      }
      const { error } = await db.from('gyms').update({ account_manager_id: staffId || null }).eq('id', gymId);
      if (error) throw new Error(`Could not save the account manager: ${error.message}`);
    },

    markSetupDone: async (gymId) => {
      const { error } = await db.from('gyms').update({ setup_help_done_at: new Date().toISOString() }).eq('id', gymId);
      if (error) throw new Error(`Could not record that: ${error.message}`);
    },

    /** Gyms waiting for the setup help they asked for — a to-do on Today. */
    countSetupRequests: async () => {
      const { count, error } = await db
        .from('gyms')
        .select('id', { count: 'exact', head: true })
        .not('setup_help_requested_at', 'is', null)
        .is('setup_help_done_at', null);
      if (error) return 0;
      return count ?? 0;
    },

    /** What an owner's page needs about their own support (§41.1 Q6, Q7). */
    ownerSupport: async (gym) => {
      const support = await readSupport(db);
      const { data: extra } = await db
        .from('gyms')
        .select('account_manager_id, setup_help_requested_at, setup_help_done_at')
        .eq('id', gym.id)
        .maybeSingle();
      let manager = null;
      if (extra?.account_manager_id) {
        const { data } = await db.from('platform_users').select('full_name, email').eq('id', extra.account_manager_id).maybeSingle();
        manager = data ?? null;
      }
      return {
        email: support.email,
        whatsapp: support.whatsapp,
        manager,
        setupRequestedAt: extra?.setup_help_requested_at ?? null,
        setupDoneAt: extra?.setup_help_done_at ?? null,
      };
    },

    /** The owner asks for setup help. Only THEIR gym, found by the session. */
    requestSetupHelp: async (userId) => {
      const { data: gym } = await db.from('gyms').select('id').eq('owner_user_id', userId).maybeSingle();
      if (!gym) throw new Error('No gym found for this account.');
      const { error } = await db
        .from('gyms')
        .update({ setup_help_requested_at: new Date().toISOString(), setup_help_done_at: null })
        .eq('id', gym.id);
      if (error) throw new Error(`Could not record the request: ${error.message}`);
      await audit(db, { action: 'platform.owner.setup_help_requested', actor_kind: 'gym_owner', actor_user_id: userId, entity: 'gym', entity_id: gym.id });
      return gym.id;
    },
  };
}
