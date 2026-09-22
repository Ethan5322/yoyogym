// Platform router — the first point at which the platform is reachable.
//
// Everything before this file was logic with no door: auth, CSRF, views and the
// application flow, all tested, none of them addressable. This connects them.
//
// It lives in `platform/` rather than `api/` so the boundary holds (D-081): the
// file under `api/platform/` is a three-line Vercel entry point that imports
// this, and nothing in the gym app imports anything here.
//
// Dependencies are injected, as everywhere else in this codebase, so the whole
// router is testable with no database and no network.
import { timingSafeEqual } from 'node:crypto';
import {
  loginPage,
  applicationsPage,
  applicationDetailPage,
  signupPage,
  signupSuccessPage,
  registryPage,
  gymDetailPage,
  finderPage,
  driftPage,
  activatePage,
  activateSuccessPage,
  ownerDashboardPage,
} from './views.js';
import { eventToIntent } from './billing.js';
import { completeActivation } from './activation.js';
import { validateUploadRequest, pathBelongsTo, documentRow } from './documents.js';
import { verifySignature } from './paystack.js';
import { PLANS, planByKey, ownerFacingPlan } from './plans.js';
import {
  requireSession,
  readSession,
  sessionCookie,
  clearSessionCookie,
  issueCsrfToken,
  readFormBody,
  readRawBody,
} from './http.js';

const html = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
};

const redirect = (res, location, headers = {}) => {
  res.writeHead(302, { Location: location, ...headers });
  res.end();
};

/** Generic on purpose: never reveal whether an email exists. */
const INVALID = 'Invalid email, password or authentication code.';

/**
 * Handle a request under /platform/*.
 *
 * @param {object} deps  { findUserByEmail, verifyPassword, verifySecondFactor,
 *                         listApplications, getApplicationView, decide, audit }
 */
export async function handlePlatform(req, res, deps) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/platform\/?/, '').replace(/\/$/, '');
  const method = (req.method || 'GET').toUpperCase();

  // ---- public: gym-owner application -------------------------------------
  // No session required: this is the front door. Anyone may apply; nobody is
  // approved without a human reading it (D-048).
  if (path === 'apply') {
    const plans = PLANS.map((p) => ownerFacingPlan(p));

    if (method === 'GET') return html(res, 200, signupPage({ plans }));

    if (method === 'POST') {
      const form = await readFormBody(req);
      const values = {
        owner_name: form.owner_name,
        email: form.email,
        gym_name: form.gym_name,
        city: form.city,
        country: form.country,
        estimated_members: form.estimated_members,
      };
      const fail = (message) =>
        html(res, 400, signupPage({ plans, values, error: message, selectedPlan: form.plan }));

      if (!form.owner_name?.trim()) return fail('Please give your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || '')) return fail('A valid email is required.');
      if ((form.password || '').length < 10) return fail('Choose a password of at least 10 characters.');
      if (!form.gym_name?.trim()) return fail('What is your gym called?');
      if (!planByKey(form.plan)) return fail('Please choose a plan.');

      const result = await deps.createApplication({
        owner_name: form.owner_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        gym_name: form.gym_name.trim(),
        city: (form.city || '').trim(),
        country: (form.country || '').trim().toUpperCase(),
        estimated_members: Number(form.estimated_members) || null,
        plan_key: form.plan,
        // Demand evidence, not a feature-request form (D-104).
        needs: (form.needs || '').trim() || null,
      });

      if (!result.ok) return fail(result.error || 'We could not submit that. Please try again.');

      return html(res, 200, signupSuccessPage({ gymName: form.gym_name.trim() }));
    }
  }

  // ---- public: gym search --------------------------------------------------
  // How a member finds their gym (D-036). Returns only what a stranger may
  // know: the gym's public name, city and slug. Never a schema name, never a
  // connection, never anything that hints at the inside of the system.
  if (path === 'gyms' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();

    // An EMPTY parameter is absent, not zero. Number('') is 0, which is a real
    // coordinate in the Gulf of Guinea — every gym on earth would be sorted by
    // its distance from there.
    const coord = (name) => {
      const raw = url.searchParams.get(name);
      if (raw === null || raw.trim() === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const gyms = await deps.searchGyms({ query: q, lat: coord('lat'), lng: coord('lng') });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ gyms }));
  }

  // ---- sign in -----------------------------------------------------------
  if (path === 'login') {
    if (method === 'GET') return html(res, 200, loginPage({}));

    if (method === 'POST') {
      const form = await readFormBody(req);
      const user = await deps.findUserByEmail(String(form.email || '').trim().toLowerCase());

      // Every failure takes the same path and says the same thing, so the
      // response cannot be used to discover which accounts exist.
      let ok = false;
      let needsSetup = false;

      if (user && user.is_active !== false) {
        const passwordOk = await deps.verifyPassword(form.password, user.password_hash);

        // WHO NEEDS A SECOND FACTOR, and why it is not "everyone".
        //
        // A gym owner reaches ONE gym — their own. Platform staff reach EVERY
        // gym on the platform, which is why D-077 makes 2FA mandatory for them
        // and why a correct password alone must never be enough.
        //
        // Anything that is not explicitly a gym owner is treated as staff, so
        // a mistyped or unrecognised `kind` in the database produces the
        // STRICTER rule, never the weaker one.
        const isOwner = user.kind === 'gym_owner';

        if (isOwner) {
          // Optional, but not decorative: an owner who has turned 2FA on must
          // use it, or the setting would be a lie.
          const secondOk = user.totp_enabled
            ? await deps.verifySecondFactor(user, form.totp)
            : true;
          ok = Boolean(passwordOk && secondOk);
        } else if (!user.totp_enabled) {
          // Staff without 2FA cannot sign in at all. Half-finished setup is
          // the situation the rule exists for, not an exception to it.
          needsSetup = passwordOk;
        } else {
          ok = Boolean(passwordOk && (await deps.verifySecondFactor(user, form.totp)));
        }
      }

      if (needsSetup) {
        await deps.audit({ action: 'platform.login.blocked_no_2fa', actor_user_id: user.id });
        return html(
          res,
          200,
          loginPage({
            error:
              'This account requires two-factor authentication before it can be used. ' +
              'Ask a platform owner to finish setting up your authenticator app.',
          })
        );
      }

      if (!ok) {
        await deps.audit({ action: 'platform.login.failed', detail: { email: form.email } });
        return html(res, 200, loginPage({ error: INVALID }));
      }

      await deps.audit({ action: 'platform.login', actor_user_id: user.id });

      // An owner has no business on the review queue, and would be refused by
      // the permission check anyway — landing there would just look broken.
      const home = user.kind === 'gym_owner' ? '/platform/my-gym' : '/platform/applications';
      return redirect(res, home, { 'Set-Cookie': sessionCookie(user) });
    }
  }

  // ---- sign out ----------------------------------------------------------
  if (path === 'logout') {
    const session = readSession(req);
    if (session) await deps.audit({ action: 'platform.logout', actor_user_id: session.sub });
    return redirect(res, '/platform/login', { 'Set-Cookie': clearSessionCookie() });
  }

  // ---- the review queue --------------------------------------------------
  if (path === 'applications' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return; // already redirected

    // A SESSION IS NOT ENOUGH. Gym owners hold platform sessions too — their
    // account is created by the signup form — and this page lists every gym
    // that has applied, with the city, the plan and the free-text answer about
    // what their business needs. Without this check, signing up as a gym owner
    // is a way to read every competitor's application.
    if (!(await may(deps, session, 'application.view'))) {
      return forbid(res, 'You do not have permission to review applications.');
    }

    const applications = await deps.listApplications();
    return html(res, 200, applicationsPage({ applications, user: { email: session.email } }));
  }

  // ---- one application ---------------------------------------------------
  const detail = /^applications\/([A-Za-z0-9-]+)$/.exec(path);
  if (detail && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return;

    // Same reasoning, and more so: this page renders the uploaded documents
    // and the full decision history.
    if (!(await may(deps, session, 'application.view'))) {
      return forbid(res, 'You do not have permission to review applications.');
    }

    const view = await deps.getApplicationView(detail[1]);
    if (!view) return html(res, 404, '<p>Application not found.</p>');

    return html(
      res,
      200,
      applicationDetailPage({
        ...view,
        user: { email: session.email },
        csrfToken: issueCsrfToken(session.sub),
      })
    );
  }

  // ---- decide ------------------------------------------------------------
  const decide = /^applications\/([A-Za-z0-9-]+)\/decide$/.exec(path);
  if (decide && method === 'POST') {
    // The body must be read before the CSRF check, because the token is in it.
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return; // 302 or 403 already written

    const ACTIONS = new Set(['approve', 'reject', 'request_info']);
    if (!ACTIONS.has(form.action)) {
      // Refuse rather than guess. An unrecognised action on a state-changing
      // endpoint is a bug or an attack, never something to interpret.
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Unknown action.');
    }

    await deps.decide(decide[1], session, form.action, form.reason ?? '');

    // Redirect after POST, so refreshing the page cannot decide twice —
    // which for "approve" would mean provisioning twice.
    return redirect(res, `/platform/applications/${decide[1]}`);
  }

  // The registry, the webhook and the cron. Kept in their own function
  // because they authenticate differently from everything above.
  if (await handleExtraRoutes(req, res, deps, { url, path, method })) return;

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found.');
}

// ---------------------------------------------------------------------------
// Routes added after the review queue: the registry, the webhook and the cron.
//
// Each has a different caller, and therefore a different door:
//   registry  — a signed-in human, holding a permission, with a CSRF token
//   webhook   — Paystack, proven by a signature over the raw bytes
//   cron      — the scheduler, proven by a shared secret
// ---------------------------------------------------------------------------

/** Does this session hold a permission? Looked up per request, never trusted from the cookie. */
async function may(deps, session, permission) {
  // The session token says who you are. It deliberately does NOT say what you
  // may do: permissions are read from the database on each request, so
  // revoking a role takes effect immediately rather than in eight hours when
  // the cookie expires.
  const held = (await deps.permissionsFor?.(session)) || [];
  return held.includes(permission);
}

function forbid(res, message) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
  return null;
}

async function handleExtraRoutes(req, res, deps, { url, path, method }) {
  // ---- public: the member-facing gym finder -------------------------------
  if (path === 'find' && method === 'GET') {
    html(res, 200, finderPage());
    return true;
  }

  // ---- public: owner activation --------------------------------------------
  // No session, and deliberately no CSRF token: the owner has no account to be
  // signed in to yet, and the link-plus-code IS the credential. A cross-site
  // request here would need both halves, and an attacker with both does not
  // need the victim's browser.
  if (path === 'activate') {
    if (method === 'GET') {
      const token = url.searchParams.get('token') || '';
      const context = (await deps.activationContext?.(token)) || {};
      html(res, 200, activatePage({ token, gymName: context.gymName }));
      return true;
    }

    if (method === 'POST') {
      const form = await readFormBody(req);
      // Q-46 ANSWERED (D-124, user, 2026-09-22): verifying your email is what
      // opens the gym, not paying. D-049 is superseded. This is the only way
      // "30 days free" is a true sentence.
      const result = await completeActivation(
        deps,
        { token: form.token, code: form.code, password: form.password },
        { activatesGym: true }
      );

      if (!result.ok) {
        // The token is echoed back so a mistyped code can be corrected without
        // digging the email out again. The code is not — retyping it is the
        // point.
        html(res, 400, activatePage({ token: form.token, error: result.reason }));
        return true;
      }

      html(res, 200, activateSuccessPage({ gymActivated: result.gymActivated }));
      return true;
    }
  }

  // ---- the gym owner's own page --------------------------------------------
  // Not where they run their gym. Members, check-ins and payments live in
  // their own gym admin panel, which is the existing single-gym system and is
  // untouched (§32). This is the account: application, documents, subscription.
  if (path === 'my-gym' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    const view = (await deps.ownerDashboard(session.sub)) || {};
    html(res, 200, ownerDashboardPage({
      ...view,
      user: { email: session.email },
      csrfToken: issueCsrfToken(session.sub),
      gymAdminUrl: process.env.PLATFORM_GYM_ADMIN_URL || '',
    }));
    return true;
  }

  // ---- ask where to put a document -----------------------------------------
  if (path === 'my-gym/documents/request' && method === 'POST') {
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    // OWNERSHIP FIRST, before anything is validated or issued. The lookup is
    // keyed on the SESSION's user id, never on anything in the form, so an
    // application id belonging to another gym simply does not resolve.
    const application = await deps.findOwnApplication(session.sub, form.application_id);
    if (!application) {
      // 404, not 403. A 403 would confirm that the application exists, which
      // is one bit more than a stranger should learn.
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found.' }));
      return true;
    }

    const check = validateUploadRequest({
      applicationId: application.id,
      docType: form.doc_type,
      mimeType: form.mime_type,
      sizeBytes: form.size_bytes,
    });

    if (!check.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: check.error }));
      return true;
    }

    const signed = await deps.createSignedUpload(check.path, form.mime_type);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ path: check.path, token: signed.token, uploadUrl: signed.uploadUrl ?? null }));
    return true;
  }

  // ---- record what was uploaded --------------------------------------------
  if (path === 'my-gym/documents/confirm' && method === 'POST') {
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    const application = await deps.findOwnApplication(session.sub, form.application_id);
    if (!application) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found.');
      return true;
    }

    // The client sends the path back, so the client can lie about it. Without
    // this the owner could attach another application's document to their own,
    // or claim a path they were never issued.
    if (!pathBelongsTo(form.storage_ref, application.id)) {
      await deps.audit({
        action: 'platform.document.rejected_path',
        actor_kind: 'gym_owner',
        actor_user_id: session.sub,
        entity: 'application',
        entity_id: application.id,
        detail: { claimed: String(form.storage_ref || '').slice(0, 200) },
      });
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('That upload could not be recorded.');
      return true;
    }

    await deps.recordDocument(
      documentRow({
        applicationId: application.id,
        docType: form.doc_type,
        storageRef: form.storage_ref,
        filename: form.filename,
        mimeType: form.mime_type,
        sizeBytes: form.size_bytes,
      })
    );

    await deps.audit({
      action: 'platform.document.uploaded',
      actor_kind: 'gym_owner',
      actor_user_id: session.sub,
      entity: 'application',
      entity_id: application.id,
      detail: { doc_type: form.doc_type },
    });

    redirect(res, '/platform/my-gym');
    return true;
  }

  // ---- open a document -----------------------------------------------------
  // The most sensitive thing on the platform: a scan of somebody's ID, their
  // business registration, their lease.
  const docOpen = /^documents\/([A-Za-z0-9-]+)$/.exec(path);
  if (docOpen && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    if (!(await may(deps, session, 'application.view'))) {
      forbid(res, 'You do not have permission to open application documents.');
      return true;
    }

    const doc = await deps.getDocument(docOpen[1]);
    if (!doc) {
      html(res, 404, '<p>Document not found.</p>');
      return true;
    }

    // Five minutes. Long enough to open a PDF, short enough that a URL left in
    // a chat message or a browser history is useless by the time anyone finds
    // it. The bucket itself is private; this is the only way in.
    const url = await deps.signedDocumentUrl(doc.storage_ref, 300);

    if (!url) {
      // Not a redirect to nowhere. A broken link here looks like a missing
      // document, and a reviewer would reasonably reject an application over it.
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('That document could not be opened just now. Please try again.');
      return true;
    }

    // WHO looked at WHOSE identity document, and when. This is the only record
    // of it, and under POPIA it is the record that matters.
    await deps.audit({
      action: 'platform.document.viewed',
      actor_user_id: session.sub,
      entity: 'document',
      entity_id: doc.id,
      detail: { application_id: doc.application_id, doc_type: doc.doc_type },
    });

    // Redirected, never rendered. Putting the signed URL in HTML would leave
    // it in the page source, the browser cache and any screenshot.
    redirect(res, url);
    return true;
  }

  // ---- accept or reject a document -----------------------------------------
  const docDecide = /^documents\/([A-Za-z0-9-]+)\/decide$/.exec(path);
  if (docDecide && method === 'POST') {
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    // Deciding on a document is part of deciding on the application, so it
    // takes the same permission. Someone who may only look, may only look.
    if (!(await may(deps, session, 'application.approve'))) {
      forbid(res, 'You do not have permission to decide on documents.');
      return true;
    }

    const reason = (form.reason || '').trim();

    if (form.action !== 'accept' && form.action !== 'reject') {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unknown action.');
      return true;
    }

    if (form.action === 'reject' && !reason) {
      // "Rejected" with no reason tells the owner nothing, and they resubmit
      // the same file.
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('A rejection needs a reason the owner can act on.');
      return true;
    }

    const doc = await deps.getDocument(docDecide[1]);
    if (!doc) {
      html(res, 404, '<p>Document not found.</p>');
      return true;
    }

    await deps.reviewDocument(doc.id, {
      status: form.action === 'accept' ? 'accepted' : 'rejected',
      reviewed_by: session.sub,
      reviewed_at: new Date().toISOString(),
      reject_reason: form.action === 'reject' ? reason : null,
    });

    await deps.audit({
      action: `platform.document.${form.action}ed`,
      actor_user_id: session.sub,
      entity: 'document',
      entity_id: doc.id,
      detail: { application_id: doc.application_id, reason: reason || null },
    });

    redirect(res, `/platform/applications/${doc.application_id}`);
    return true;
  }

  // ---- the gym registry ----------------------------------------------------
  if (path === 'registry' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    if (!(await may(deps, session, 'gym.view'))) {
      // Refused outright rather than shown nothing. An empty registry and a
      // registry you may not see look identical, and only one of them is true.
      forbid(res, 'You do not have permission to view the gym registry.');
      return true;
    }

    const gyms = await deps.listGyms();
    html(res, 200, registryPage({
      gyms,
      user: { email: session.email },
      canSuspend: await may(deps, session, 'gym.suspend'),
    }));
    return true;
  }

  const gymDetail = /^registry\/([A-Za-z0-9-]+)$/.exec(path);
  if (gymDetail && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    if (!(await may(deps, session, 'gym.view'))) {
      forbid(res, 'You do not have permission to view the gym registry.');
      return true;
    }

    const view = await deps.getGymDetail(gymDetail[1]);
    if (!view) {
      html(res, 404, '<p>Gym not found.</p>');
      return true;
    }

    html(res, 200, gymDetailPage({
      ...view,
      user: { email: session.email },
      csrfToken: issueCsrfToken(session.sub),
      canSuspend: await may(deps, session, 'gym.suspend'),
    }));
    return true;
  }

  // ---- suspend / reactivate ------------------------------------------------
  const change = /^registry\/([A-Za-z0-9-]+)\/(suspend|reactivate)$/.exec(path);
  if (change && method === 'POST') {
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true; // 302 or 403 already written

    if (!(await may(deps, session, 'gym.suspend'))) {
      forbid(res, 'You do not have permission to suspend or reactivate a gym.');
      return true;
    }

    const [, gymId, action] = change;
    const status = action === 'suspend' ? 'suspended' : 'active';
    const reason = (form.reason || '').trim();

    await deps.setGymStatus(gymId, status, reason);
    await deps.audit({
      action: action === 'suspend' ? 'platform.gym.suspended' : 'platform.gym.reactivated',
      actor_user_id: session.sub,
      entity: 'gym',
      entity_id: gymId,
      // Suspension locks real people out of a building they pay for. The
      // reason is the only record of why, so it is written before anything
      // else can overwrite the memory of it.
      detail: { reason },
    });

    redirect(res, `/platform/registry/${gymId}`);
    return true;
  }

  // ---- the drift report, on demand -----------------------------------------
  if (path === 'reconcile' && (method === 'GET' || method === 'POST')) {
    const form = method === 'POST' ? await readFormBody(req) : {};

    // POST rather than a link, even though it only reads: it costs a
    // Management API round trip per press, and a link gets prefetched.
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    if (!(await may(deps, session, 'gym.view'))) {
      forbid(res, 'You do not have permission to run the drift report.');
      return true;
    }

    let report = null;
    try {
      report = await deps.reconcile();
    } catch (err) {
      report = { ok: false, orphans: [], dangling: [], checkedSchemas: 0, error: err?.message };
    }

    html(res, 200, driftPage({ report, user: { email: session.email }, csrfToken: issueCsrfToken(session.sub) }));
    return true;
  }

  // ---- the Paystack webhook ------------------------------------------------
  if (path === 'webhooks/paystack' && method === 'POST') {
    // NO SESSION, NO CSRF — and that is correct. Paystack has no cookie. The
    // signature over the raw bytes is the entire authentication, which is why
    // the body is read as bytes and parsed only after it has been proven.
    const raw = await readRawBody(req);

    if (!verifySignature(raw, req.headers['x-paystack-signature'])) {
      await deps.audit({ action: 'platform.webhook.rejected', actor_kind: 'system' });
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid signature.');
      return true;
    }

    let payload = null;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Malformed body.');
      return true;
    }

    const intent = eventToIntent(payload);
    if (intent.kind !== 'ignore') await deps.applyPaystackEvent(intent);

    // 200 even for an ignored event. Paystack retries anything else, forever,
    // and an event we do not handle is not a failure to be retried.
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ received: true }));
    return true;
  }

  // ---- the daily job -------------------------------------------------------
  if (path === 'cron' && (method === 'POST' || method === 'GET')) {
    const secret = process.env.PLATFORM_CRON_SECRET || '';
    const offered = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    // No secret configured means no cron. Failing closed here is the
    // difference between a job nobody can run and a job anybody can run.
    if (!secret || !timingSafeEqualString(offered, secret)) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unauthorized.');
      return true;
    }

    // Live billing is opt-in through the environment, so a misrouted request
    // — or a test pointed at production by mistake — cannot take money.
    const dryRun = process.env.PLATFORM_BILLING_LIVE !== 'true';
    const report = await deps.runBilling({ dryRun, now: new Date() });

    // The drift report runs in the same pass, because a second Vercel cron
    // entry is a second thing to configure and forget. It only ever reads, so
    // it is safe next to billing, and a failure in it must not lose the
    // billing result that has already happened.
    let drift = null;
    try {
      drift = (await deps.reconcile?.()) ?? null;
    } catch (err) {
      drift = { ok: false, error: err?.message || 'Reconciliation failed.' };
    }

    // Retention deletes, so it gets its own switch rather than riding on the
    // billing one. PLATFORM_BILLING_LIVE is about money; this is about
    // personal data, and conflating them would mean turning on billing
    // silently started deleting identity documents.
    let retention = null;
    try {
      retention =
        (await deps.purgeDocuments?.({ dryRun: process.env.PLATFORM_RETENTION_LIVE !== 'true' })) ?? null;
    } catch (err) {
      retention = { ok: false, error: err?.message || 'Retention run failed.' };
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ...report, drift, retention }));
    return true;
  }

  return false;
}

/** Constant-time string compare, so a secret cannot be guessed a byte at a time. */
function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
