// The JSON API — what the MOBILE APP talks to.
//
//   >>> THIS IS THE SAME BACKEND AS THE WEBSITE, NOT A SECOND ONE. <<<
//
// The website panel is server-rendered HTML because it is used by one or two
// people on a laptop. A mobile app cannot consume HTML, so it gets JSON. What
// it does NOT get is its own logic: every route below calls exactly the same
// injected dependency the HTML route calls, so a rule enforced in one place is
// enforced in both. The difference is the representation, and only that.
//
// Auth is the same signed platform token, presented as a Bearer header instead
// of a cookie (see readAnySession). Two transports, one identity.
//
// WHO USES THIS APP (the user's architecture, 2026-09-22):
//   · gym owners  — apply, activate, see their gym, upload documents
//   · gym members — find their gym, then enter that gym's own system
// Platform staff use the website. There is deliberately no JSON route here
// that approves an application or suspends a gym.
import { readAnySession, signPlatformToken } from './http.js';
import { PLANS, ownerFacingPlan, planByKey } from './plans.js';
import { completeActivation } from './activation.js';
import { validateUploadRequest, pathBelongsTo, documentRow } from './documents.js';

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    // The app is not a browser origin; nothing here is cached by a CDN.
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
};

const INVALID = 'Invalid email, password or authentication code.';

/** Read a JSON body. Capped: an app sends a form, not an upload. */
async function readJson(req, { maxBytes = 64 * 1024 } = {}) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null; // malformed, distinct from empty
  }
}

/**
 * Handle a request under /platform/api/*.
 *
 * @returns {boolean} true if it handled the request.
 */
export async function handlePlatformApi(req, res, deps, { path, method, url }) {
  // ---- who am I -----------------------------------------------------------
  if (path === 'api/session' && method === 'GET') {
    const { session } = readAnySession(req);
    if (!session) return json(res, 401, { error: 'Not signed in.' }), true;

    return json(res, 200, {
      user: { id: session.sub, email: session.email, kind: session.kind },
    }), true;
  }

  // ---- sign in ------------------------------------------------------------
  if (path === 'api/login' && method === 'POST') {
    const body = await readJson(req);
    if (!body) return json(res, 400, { error: 'Malformed request.' }), true;

    const user = await deps.findUserByEmail(String(body.email || '').trim().toLowerCase());

    // The SAME rule as the website (D-119), because it is the same decision:
    // staff reach every gym and must have 2FA; an owner reaches one gym.
    let ok = false;
    let needs2fa = false;

    if (user && user.is_active !== false) {
      const passwordOk = await deps.verifyPassword(body.password, user.password_hash);
      const isOwner = user.kind === 'gym_owner';

      if (isOwner) {
        const secondOk = user.totp_enabled ? await deps.verifySecondFactor(user, body.totp) : true;
        ok = Boolean(passwordOk && secondOk);
      } else if (!user.totp_enabled) {
        needs2fa = passwordOk;
      } else {
        ok = Boolean(passwordOk && (await deps.verifySecondFactor(user, body.totp)));
      }
    }

    if (needs2fa) {
      await deps.audit({ action: 'platform.login.blocked_no_2fa', actor_user_id: user.id });
      return json(res, 403, { error: 'This account requires two-factor authentication.' }), true;
    }

    if (!ok) {
      await deps.audit({ action: 'platform.login.failed', detail: { email: body.email, via: 'app' } });
      // One message for every failure, so the API cannot be used to discover
      // which accounts exist.
      return json(res, 401, { error: INVALID }), true;
    }

    await deps.audit({ action: 'platform.login', actor_user_id: user.id, detail: { via: 'app' } });

    // A token in the body, not a Set-Cookie. The app stores it itself.
    return json(res, 200, {
      token: signPlatformToken(user),
      user: { id: user.id, email: user.email, kind: user.kind },
    }), true;
  }

  // ---- find a gym (members) -----------------------------------------------
  // The one route a member uses. Public, and returns only what a stranger may
  // know — no schema name, no connection, nothing about the inside.
  if (path === 'api/gyms' && method === 'GET') {
    const coord = (name) => {
      const raw = url.searchParams.get(name);
      if (raw === null || raw.trim() === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const gyms = await deps.searchGyms({
      query: (url.searchParams.get('q') || '').trim(),
      lat: coord('lat'),
      lng: coord('lng'),
    });

    return json(res, 200, { gyms }), true;
  }

  // ---- the plans, for the signup screen -----------------------------------
  if (path === 'api/plans' && method === 'GET') {
    return json(res, 200, { plans: PLANS.map((p) => ownerFacingPlan(p)) }), true;
  }

  // ---- apply (owners) -----------------------------------------------------
  if (path === 'api/apply' && method === 'POST') {
    const body = await readJson(req);
    if (!body) return json(res, 400, { error: 'Malformed request.' }), true;

    // The SAME validation as the web form. Duplicated rules would drift, and
    // the app would quietly become the weaker door.
    if (!String(body.owner_name || '').trim()) return json(res, 400, { error: 'Please give your name.' }), true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email || '')) {
      return json(res, 400, { error: 'A valid email is required.' }), true;
    }
    if (String(body.password || '').length < 10) {
      return json(res, 400, { error: 'Choose a password of at least 10 characters.' }), true;
    }
    if (!String(body.gym_name || '').trim()) return json(res, 400, { error: 'What is your gym called?' }), true;
    if (!planByKey(body.plan)) return json(res, 400, { error: 'Please choose a plan.' }), true;

    const result = await deps.createApplication({
      owner_name: String(body.owner_name).trim(),
      email: String(body.email).trim().toLowerCase(),
      password: body.password,
      gym_name: String(body.gym_name).trim(),
      city: String(body.city || '').trim(),
      country: String(body.country || '').trim().toUpperCase(),
      estimated_members: Number(body.estimated_members) || null,
      plan_key: body.plan,
      needs: String(body.needs || '').trim() || null,
    });

    if (!result.ok) return json(res, 400, { error: result.error || 'We could not submit that.' }), true;

    return json(res, 201, { ok: true, application_id: result.applicationId }), true;
  }

  // ---- activate (owners) --------------------------------------------------
  if (path === 'api/activate' && method === 'POST') {
    const body = await readJson(req);
    if (!body) return json(res, 400, { error: 'Malformed request.' }), true;

    const result = await completeActivation(
      deps,
      { token: body.token, code: body.code, password: body.password },
      { activatesGym: true } // D-124: verifying the email opens the gym
    );

    if (!result.ok) return json(res, 400, { error: result.reason }), true;

    return json(res, 200, { ok: true, gym_activated: result.gymActivated }), true;
  }

  // ---- everything below needs a signed-in owner ---------------------------
  const { session } = readAnySession(req);
  const needsAuth = path.startsWith('api/my-gym');

  if (needsAuth && !session) {
    return json(res, 401, { error: 'Not signed in.' }), true;
  }

  // ---- my gym -------------------------------------------------------------
  if (path === 'api/my-gym' && method === 'GET') {
    const view = (await deps.ownerDashboard(session.sub)) || {};

    // Shaped for the app rather than echoed from the database: a client that
    // receives whole rows starts depending on columns, and every schema change
    // then breaks a shipped app nobody can update.
    return json(res, 200, {
      gym: view.gym
        ? {
            slug: view.gym.slug,
            name: view.gym.search_name,
            status: view.gym.status,
            plan: view.gym.plan_key,
            city: view.gym.city,
            country: view.gym.country,
          }
        : null,
      application: view.application
        ? {
            id: view.application.id,
            gym_name: view.application.proposed_gym_name,
            status: view.application.status,
            reason: view.application.decision_reason ?? null,
          }
        : null,
      subscription: view.subscription
        ? {
            status: view.subscription.status,
            trial_ends_at: view.subscription.trial_ends_at,
            current_period_end: view.subscription.current_period_end,
          }
        : null,
      documents: (view.documents || []).map((d) => ({
        id: d.id,
        type: d.doc_type,
        filename: d.filename,
        status: d.status,
        reject_reason: d.reject_reason ?? null,
      })),
    }), true;
  }

  // ---- upload a document --------------------------------------------------
  if (path === 'api/my-gym/documents/request' && method === 'POST') {
    const body = await readJson(req);
    if (!body) return json(res, 400, { error: 'Malformed request.' }), true;

    // Ownership first, keyed on the SESSION — never on anything in the body.
    const application = await deps.findOwnApplication(session.sub, body.application_id);
    if (!application) return json(res, 404, { error: 'Not found.' }), true;

    const check = validateUploadRequest({
      applicationId: application.id,
      docType: body.doc_type,
      mimeType: body.mime_type,
      sizeBytes: body.size_bytes,
    });
    if (!check.ok) return json(res, 400, { error: check.error }), true;

    const signed = await deps.createSignedUpload(check.path, body.mime_type);
    return json(res, 200, { path: check.path, token: signed.token, upload_url: signed.uploadUrl ?? null }), true;
  }

  if (path === 'api/my-gym/documents/confirm' && method === 'POST') {
    const body = await readJson(req);
    if (!body) return json(res, 400, { error: 'Malformed request.' }), true;

    const application = await deps.findOwnApplication(session.sub, body.application_id);
    if (!application) return json(res, 404, { error: 'Not found.' }), true;

    // The client sends the path back, so the client can lie about it.
    if (!pathBelongsTo(body.storage_ref, application.id)) {
      await deps.audit({
        action: 'platform.document.rejected_path',
        actor_kind: 'gym_owner',
        actor_user_id: session.sub,
        entity: 'application',
        entity_id: application.id,
        detail: { claimed: String(body.storage_ref || '').slice(0, 200), via: 'app' },
      });
      return json(res, 400, { error: 'That upload could not be recorded.' }), true;
    }

    const row = await deps.recordDocument(
      documentRow({
        applicationId: application.id,
        docType: body.doc_type,
        storageRef: body.storage_ref,
        filename: body.filename,
        mimeType: body.mime_type,
        sizeBytes: body.size_bytes,
      })
    );

    await deps.audit({
      action: 'platform.document.uploaded',
      actor_kind: 'gym_owner',
      actor_user_id: session.sub,
      entity: 'application',
      entity_id: application.id,
      detail: { doc_type: body.doc_type, via: 'app' },
    });

    return json(res, 201, { ok: true, document_id: row?.id ?? null }), true;
  }

  // Not an API path this module knows. The caller falls through to the
  // website routes rather than 404ing here.
  if (path.startsWith('api/')) {
    return json(res, 404, { error: 'Unknown endpoint.' }), true;
  }

  return false;
}
