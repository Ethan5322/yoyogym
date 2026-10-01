// Platform router — the first point at which the platform is reachable.
//
// THREE SURFACES, ONE BACKEND (the user's architecture, 2026-09-22):
//
//   /platform/api/*   THE MOBILE APP. Gym owners and gym members, JSON,
//                     Bearer tokens. See platform/api.js. There is
//                     deliberately NO app route that approves an application
//                     or suspends a gym — that is staff work.
//
//   /platform/*       THE WEBSITE = THE MAIN ADMIN PANEL, and only that.
//                     Yoyo platform staff, server-rendered HTML, cookie
//                     sessions: applications, registry, owners, plans,
//                     finance, audit, documents.
//
//   the exceptions    /apply, /activate, /my-gym and /find also render HTML.
//                     These are NOT "the website" — they are the WEB FALLBACK
//                     that CLAUDE.md §14 requires: an activation email link
//                     and a scanned QR must work for someone who has not
//                     installed the app yet. Each has a JSON twin under
//                     /platform/api/ which is the primary path. They are kept
//                     out of the staff navigation for that reason.
//
// The surfaces share every dependency. A rule lives in one place and both
// doors enforce it — which is the only reason a second door is safe to add.
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
import { handlePlatformApi } from './api.js';
import { decideLogin, INVALID, LOCKED } from './login.js';
import { applyAppCors } from '../shared/cors.js';
import { provisioningReadiness } from './provisioning-config.js';
import { AGREEMENT_VERSION, agreementTerms, agreementPdf, ownerId, termsApproved } from './agreement.js';
import { platformBaseUrl } from './base-url.js';
import { OWNER_USERNAME } from './gym-admin.js';
import { requestReset, completeReset } from './password-reset.js';
import { readApplication } from './application-form.js';
import { ALL_SERVICES, CORE_FEATURES } from '../shared/features.js';
import { STAFF_ROLES, inviteProblem, teamChangeProblem, checkInvite, INVITE_REFUSED } from './team.js';
import { emailConfigured } from './email.js';
import { paystackConfigured } from './paystack.js';
import {
  loginPage,
  forgotPage,
  resetPage,
  resetDonePage,
  deleteAccountPage,
  welcomePage,
  termsPage,
  privacyPage,
  applicationsPage,
  applicationDetailPage,
  APPLICATION_TABS,
  signupPage,
  signupSuccessPage,
  applyDocumentsPage,
  applyReviewPage,
  registryPage,
  gymDetailPage,
  finderPage,
  driftPage,
  activatePage,
  activateSuccessPage,
  ownerDashboardPage,
  plansPage,
  auditPage,
  ownersPage,
  financePage,
  activationHandoverPage,
  documentReviewPage,
  securityPage,
  setupPage,
  setupDonePage,
  paymentResultPage,
  problemPage,
  accountPage,
  dashboardPage,
  teamPage,
  inviteHandoverPage,
  settingsPage,
} from './views.js';
import { eventToIntent } from './billing.js';
import { pageRequest, pageState } from './paging.js';
import { findAlerts, DEFAULT_WINDOW_HOURS } from './alerts.js';
import { setupAllowed, beginSetup, completeSetup } from './setup.js';
import { platformHealth } from './health.js';
import { regenerateRecoveryCodes, remainingCodes } from './account.js';
import { startCheckout, completeCheckout } from './checkout.js';
import { completeActivation, waitText, ACTIVATION_TTL_MINUTES } from './activation.js';
import { validateUploadRequest, pathBelongsTo, documentRow } from './documents.js';
import { verifySignature } from './paystack.js';
import { PLANS, planByKey, EVERY_PLAN_INCLUDES, livePlansForOwners, supportFor, PLAN_PROMISES } from './plans.js';
import {
  requireSession,
  readSession,
  sessionCookie,
  clearSessionCookie,
  issueCsrfToken,
  readFormBody,
  readRawBody,
} from './http.js';
import { isStoreApp } from '../shared/store-app.js';
import { readPayTicket, payTicketKey } from '../shared/pay-ticket.js';

const html = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  // Inside the store app, the page is marked so prices of the Yoyo
  // subscription are not shown (CLAUDE.md §46.1 Q4; views.js .store-hide).
  const inApp = isStoreApp(res.req?.headers?.['user-agent']);
  res.end(inApp && typeof body === 'string' ? body.replace('<body', '<body data-store-app') : body);
};

const redirect = (res, location, headers = {}) => {
  res.writeHead(302, { Location: location, ...headers });
  res.end();
};

/** Generic on purpose: never reveal whether an email exists. */

/**
 * A signed-out visitor to an OWNER'S page is sent to the owner door, asking
 * for the account page — not to the staff sign-in, which is where
 * requireSession sends everyone (design critique 2026-09-29: one owner door).
 * Only the redirect differs; the session check itself is unchanged.
 */
function toOwnerDoor(req, res) {
  if (readSession(req)) return false;
  redirect(res, '/owner/login?next=account');
  return true;
}

/**
 * Handle a request under /platform/*.
 *
 * @param {object} deps  { findUserByEmail, verifyPassword, verifySecondFactor,
 *                         listApplications, getApplicationView, decide, audit }
 */
export async function handlePlatform(req, res, deps) {
  const url = new URL(req.url, 'http://localhost');
  // BOTH PREFIXES, on purpose.
  //
  // Vercel serves this handler at /api/platform/*, while every link in the
  // panel points at /platform/* and a rewrite maps one to the other. Which of
  // the two a rewrite actually presents in req.url is not something to bet a
  // working panel on, so the router accepts either and stops caring.
  //
  // The /api/ form is stripped first: otherwise "/api/platform/login" would
  // lose only its "/platform/" middle and arrive as "/api/login".
  const path = url.pathname
    .replace(/^\/api\/platform\/?/, '')
    .replace(/^\/platform\/?/, '')
    .replace(/\/$/, '');
  const method = (req.method || 'GET').toUpperCase();

  // THE MOBILE APP'S SURFACE, first.
  //
  // Same backend, same dependencies, same rules — a different representation.
  // The website below renders HTML because two people use it on a laptop; the
  // app cannot consume HTML, so it gets JSON. Neither has logic the other
  // lacks: every route in api.js calls the same injected dependency as its
  // HTML counterpart, so a rule can only be enforced in one place.
  if (path.startsWith('api/')) {
    // CORS for the app's origin — on the JSON API ONLY. The cookie pages
    // below never get it (shared/cors.js explains why that is the line).
    if (applyAppCors(req, res)) return;
    if (await handlePlatformApi(req, res, deps, { path, method, url })) return;
  }

  // ---- public: gym-owner application -------------------------------------
  // No session required: this is the front door. Anyone may apply; nobody is
  // approved without a human reading it (D-048).
  if (path === 'apply') {
    // The LIVE plans (§41): the services and prices the main admin set, not a
    // list written in the code — which is how the page said "Contact us" for
    // plans that had prices.
    const plans = await livePlansForOwners(deps);
    const page = (extra = {}) =>
      signupPage({
        plans,
        terms: agreementTerms(),
        termsApproved: termsApproved(),
        ...extra,
      });

    // A signed-in owner with a draft is CORRECTING it (CLAUDE.md §42): the
    // form comes back filled in, without the email, password or agreement.
    const session = readSession(req);
    const draft = session?.kind === 'gym_owner' ? await deps.findOwnDraft?.(session.sub) : null;
    const editPage = (extra = {}) =>
      page({
        editing: true,
        email: draft?.email || session?.email || '',
        csrfToken: issueCsrfToken(session.sub),
        values: {
          owner_name: draft?.ownerName,
          phone: draft?.application.owner_phone,
          gym_name: draft?.application.proposed_gym_name,
          address: draft?.application.gym_address,
          city: draft?.application.city,
          country: draft?.application.country,
          estimated_members: draft?.application.estimated_members,
          needs: draft?.application.owner_needs,
        },
        selectedPlan: draft?.application.requested_plan_key,
        ...extra,
      });

    if (method === 'GET') return html(res, 200, draft ? editPage() : page());

    if (method === 'POST') {
      const form = await readFormBody(req);

      if (form.editing === '1') {
        const owner = requireSession(req, res, { csrfToken: form.csrf });
        if (!owner) return;
        const again = (message) =>
          html(res, 400, editPage({ error: message, values: { ...form }, selectedPlan: form.plan }));
        if (!draft) return redirect(res, '/platform/my-gym');
        const { input, error } = readApplication(form, { editing: true });
        if (error) return again(error);
        const saved = await deps.updateDraftApplication(owner.sub, input);
        if (!saved.ok) return again(saved.error || 'We could not save that. Please try again.');
        return redirect(res, '/platform/apply/review');
      }

      // What was typed goes back into the form on a refusal — never the
      // password.
      const values = {
        owner_name: form.owner_name,
        email: form.email,
        phone: form.phone,
        gym_name: form.gym_name,
        address: form.address,
        city: form.city,
        country: form.country,
        estimated_members: form.estimated_members,
        needs: form.needs,
        accept_terms: form.accept_terms,
      };
      const fail = (message) => html(res, 400, page({ values, error: message, selectedPlan: form.plan }));

      // One rule for this form and the app's JSON twin (platform/application-form.js).
      const { input, error } = readApplication(form);
      if (error) return fail(error);

      const result = await deps.createApplication(input);

      if (!result.ok) return fail(result.error || 'We could not save that. Please try again.');

      // SIGNED IN, so the documents can be uploaded now — and the draft
      // continued later from any device by signing in (CLAUDE.md §42). The
      // password was just chosen, or just proven for an existing account.
      await deps.audit({ action: 'platform.login', actor_user_id: result.userId, actor_kind: 'gym_owner', detail: { via: 'apply' } });
      return redirect(res, '/platform/apply/documents', {
        'Set-Cookie': sessionCookie({ id: result.userId, email: input.email, kind: 'gym_owner' }),
      });
    }
  }

  // ---- step 2: documents, step 3: check and submit (CLAUDE.md §42) ----------
  // Only the signed-in owner's own DRAFT. Anything else — no draft, already
  // sent — goes to their page, which says where the application stands.
  if ((path === 'apply/documents' || path === 'apply/review') && method === 'GET') {
    if (toOwnerDoor(req, res)) return;
    const session = requireSession(req, res);
    if (!session) return;
    const draft = await deps.findOwnDraft(session.sub);
    if (!draft) return redirect(res, '/platform/my-gym');
    const common = {
      application: draft.application,
      documents: draft.documents,
      csrfToken: issueCsrfToken(session.sub),
      user: await viewer(deps, session),
    };
    if (path === 'apply/documents') return html(res, 200, applyDocumentsPage(common));
    return html(res, 200, applyReviewPage({
      ...common,
      email: draft.email,
      ownerName: draft.ownerName,
      plans: await livePlansForOwners(deps),
    }));
  }

  if (path === 'apply/submit' && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return;

    const again = async (message) => {
      const draft = await deps.findOwnDraft(session.sub);
      if (!draft) return redirect(res, '/platform/my-gym');
      return html(res, 400, applyReviewPage({
        application: draft.application,
        documents: draft.documents,
        email: draft.email,
        ownerName: draft.ownerName,
        plans: await livePlansForOwners(deps),
        csrfToken: issueCsrfToken(session.sub),
        user: await viewer(deps, session),
        error: message,
      }));
    };

    if (form.confirm !== 'yes') return again('Please tick the box to confirm you have checked everything.');

    const result = await deps.submitApplication(session.sub);
    if (!result.ok) return again(result.error);

    return html(res, 200, signupSuccessPage({ gymName: result.gymName, emailed: result.emailed, user: await viewer(deps, session) }));
  }

  // The owner opens THEIR OWN upload, to check it is the right file. Keyed on
  // the session: another applicant's document id simply does not resolve.
  const ownDoc = /^apply\/documents\/([A-Za-z0-9-]+)$/.exec(path);
  if (ownDoc && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return;
    const doc = await deps.getDocument(ownDoc[1]);
    const mine = doc ? await deps.findOwnApplication(session.sub, doc.application_id) : null;
    if (!doc || !mine) {
      return html(res, 404, problemPage({ title: 'That document does not exist', message: 'It may have been replaced, or the link is wrong.', back: { href: '/platform/apply/documents', label: 'Your documents' } }));
    }
    const signed = await deps.signedDocumentUrl(doc.storage_ref, 300, {});
    if (!signed) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('That document could not be opened just now. Please try again.');
    }
    return redirect(res, signed);
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
    // ONE OWNER DOOR (design critique 2026-09-29): /owner/login. It tries the
    // owner's gym first; when no open gym takes the details, it hands the same
    // form on to here with as=owner, for the Yoyo owner account — an applicant
    // whose gym is not open yet. `as` still decides nothing about who may
    // enter (login.js does, identically for every door); it only decides
    // where a refusal is SHOWN: back on the owner door, with a fixed code the
    // page turns into its one message. Never the message itself in the URL.
    const owner = (value) => value === 'owner';
    const ownerDoor = (query) => `/owner/login${query.toString() ? `?${query}` : ''}`;

    if (method === 'GET') {
      // Every old "owner account" link — emails, the app's "Check application
      // status" — lands on the one door, still meaning the ACCOUNT page.
      if (owner(url.searchParams.get('as'))) {
        const keep = new URLSearchParams({ next: 'account' });
        for (const k of ['app', 'back']) if (url.searchParams.get(k)) keep.set(k, url.searchParams.get(k));
        return redirect(res, ownerDoor(keep));
      }
      return html(res, 200, loginPage());
    }

    if (method === 'POST') {
      const form = await readFormBody(req);
      // The same refusal as always, drawn where the person signed in.
      const again = (error, code) => {
        if (!owner(form.as)) return loginPage({ error });
        const back = new URLSearchParams({ error: code });
        if (form.next === 'account') back.set('next', 'account');
        return { redirectTo: ownerDoor(back) };
      };
      const send = (out) => (out?.redirectTo ? redirect(res, out.redirectTo) : html(res, 200, out));

      // The decision is platform/login.js, shared with the app door so the two
      // cannot drift apart. Only the representation is decided here.
      const { outcome, user } = await decideLogin(deps, {
        email: form.email,
        password: form.password,
        totp: form.totp,
      });

      if (outcome === 'needs2fa') {
        await deps.audit({ action: 'platform.login.blocked_no_2fa', actor_user_id: user.id });
        return send(
          again(
            'This account requires two-factor authentication before it can be used. ' +
              'Ask a platform owner to finish setting up your authenticator app.',
            'needs2fa'
          )
        );
      }

      if (outcome === 'locked') {
        await deps.audit({ action: 'platform.login.locked', actor_user_id: user.id, detail: { email: form.email } });
        return send(again(LOCKED, 'locked'));
      }

      if (outcome !== 'ok') {
        // Every failure takes the same path and says the same thing, so the
        // response cannot be used to discover which accounts exist.
        await deps.audit({ action: 'platform.login.failed', detail: { email: form.email } });
        return send(again(INVALID, 'invalid'));
      }

      await deps.audit({ action: 'platform.login', actor_user_id: user.id });

      // An owner has no business on the review queue, and would be refused by
      // the permission check anyway — landing there would just look broken.
      const home = user.kind === 'gym_owner' ? '/platform/my-gym' : '/platform/home';
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

    // In tabs by what each application waits for, with a search (§40.1 F-40.6).
    const tab = APPLICATION_TABS.some(([key]) => key === url.searchParams.get('tab'))
      ? url.searchParams.get('tab')
      : 'review';
    const states = APPLICATION_TABS.find(([key]) => key === tab)[2];
    const query = (url.searchParams.get('q') || '').trim();
    const [applications, counts] = await Promise.all([
      deps.listApplications({ status: states.join(','), query }),
      deps.countApplications ? deps.countApplications().catch(() => null) : null,
    ]);
    return html(res, 200, applicationsPage({ applications, tab, counts, query, user: await viewer(deps, session) }));
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
    if (!view) return html(res, 404, problemPage({ title: 'That application does not exist', message: 'It may have been removed, or the link is wrong.', back: { href: '/platform/applications', label: 'All applications' }, user: await viewer(deps, session) }));

    return html(
      res,
      200,
      applicationDetailPage({
        ...view,
        user: await viewer(deps, session),
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

    const ACTIONS = new Set(['approve', 'reject', 'request_info', 'retry_provision']);
    if (!ACTIONS.has(form.action)) {
      // Refuse rather than guess. An unrecognised action on a state-changing
      // endpoint is a bug or an attack, never something to interpret.
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Unknown action.');
    }

    const outcome = await deps.decide(decide[1], session, form.action, form.reason ?? '');

    // A decision that did not go through is SAID. It used to redirect to the
    // application as though it had worked, so a reviewer who pressed Approve
    // with provisioning switched off saw nothing and assumed it was done.
    if (outcome && outcome.ok === false) {
      return html(
        res,
        409,
        problemPage({
          title: outcome.missingDocuments
            ? 'Documents still needed'
            : outcome.provisionFailed
              ? 'Approved — but the gym was not fully created'
            : outcome.dryRun
              ? 'Creating gyms is switched off'
              : outcome.notReady
                ? 'Creating gyms is not fully set up'
                : 'That decision did not go through',
          message: outcome.error || 'Nothing was changed.',
          // Plain text: problemPage escapes it, as it should.
          fix: outcome.missingDocuments
            ? 'Accept each one on the application page once the owner has uploaded it. ' +
              'If one is missing, use "Request information" to ask the owner for it.'
            : outcome.provisionFailed
              ? 'The approval is recorded and nothing is lost. Go back to the application and press ' +
                '"Try again" — it finishes the gym from where it stopped, then emails the owner their activation link.'
            : outcome.dryRun || outcome.notReady
              ? 'In Vercel, open Settings → Environment Variables and fix what is listed above. ' +
                'Redeploy, then approve the application again — it is still waiting.'
              : null,
          back: { href: `/platform/applications/${decide[1]}`, label: 'Back to the application' },
          user: await viewer(deps, session),
        })
      );
    }

    // The decision stands, but the owner has not been told — so the reviewer
    // is, with the address to write to (CLAUDE.md §40.1 F-40.5).
    if (outcome?.emailed === false) {
      return html(
        res,
        200,
        problemPage({
          title: form.action === 'reject' ? 'Rejected — but the owner was not emailed' : 'Sent back — but the owner was not emailed',
          message:
            `The decision is recorded. The email could not be sent (${outcome.emailReason || 'unknown reason'}), ` +
            `so please contact ${outcome.emailTo || 'the owner'} yourself and give them your message.`,
          back: { href: `/platform/applications/${decide[1]}`, label: 'Back to the application' },
          user: await viewer(deps, session),
        })
      );
    }

    // If the activation email could not be sent, the link must not vanish —
    // that was the bug that broke onboarding at the last step. It is handed
    // straight back to the reviewer, once, to send by hand.
    //
    // NOT put in the redirect URL: a link in a query string lands in server
    // logs, browser history and the referer header of the next request.
    if (outcome?.activation && outcome.activation.emailed === false) {
      return html(
        res,
        200,
        activationHandoverPage({
          activation: outcome.activation,
          gymName: outcome.gym?.search_name || outcome.application?.proposed_gym_name || '',
          applicationId: decide[1],
          user: await viewer(deps, session),
        })
      );
    }

    // Redirect after POST, so refreshing the page cannot decide twice —
    // which for "approve" would mean provisioning twice.
    return redirect(res, `/platform/applications/${decide[1]}`);
  }

  // The registry, the webhook and the cron. Kept in their own function
  // because they authenticate differently from everything above.
  if (await handleExtraRoutes(req, res, deps, { url, path, method })) return;

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Platform-Path': encodeURIComponent(path) });
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
  return (await permissionsOf(deps, session)).includes(permission);
}

// Read once per request, however many checks and menus ask. Keyed on the
// session object, which lives exactly as long as the request.
const heldBySession = new WeakMap();

function permissionsOf(deps, session) {
  if (!heldBySession.has(session)) {
    heldBySession.set(
      session,
      Promise.resolve(deps.permissionsFor?.(session)).then((held) => held || [], () => [])
    );
  }
  return heldBySession.get(session);
}

/**
 * Who is looking, for the page shell: their email, whether they are Yoyo staff
 * or a gym owner, and what they may open — so the menu offers only doors that
 * open (CLAUDE.md §40.1 F-40.2).
 */
async function viewer(deps, session) {
  const kind = session.kind || 'platform_staff';
  return {
    email: session.email,
    kind,
    perms: kind === 'gym_owner' ? [] : await permissionsOf(deps, session),
  };
}

function forbid(res, message) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
  return null;
}

async function handleExtraRoutes(req, res, deps, { url, path, method }) {
  // ---- public: the member-facing gym finder -------------------------------
  if (path === 'find' && method === 'GET') {
    // Join, member sign-in, or a gym's own admin sign-in (the welcome page's
    // choices). Anything else is the plain finder.
    html(res, 200, finderPage({ next: url.searchParams.get('next') || '' }));
    return true;
  }

  // ---- why can the app not see what SQL Editor can see? ---------------------
  // Guarded by the setup token: this describes the deployment, so it is not
  // public. It returns no key and no part of one — only the `role` claim
  // inside the key, which is the single fact that tells an anon key from a
  // service key.
  if (path === 'health' && method === 'GET') {
    const allowed = setupAllowed(url.searchParams.get('token'));
    if (!allowed.ok) {
      html(res, 403, problemPage({ title: 'Not available', message: allowed.reason, fix: allowed.fix }));
      return true;
    }

    const report = await platformHealth(deps);

    res.writeHead(report.ok ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(report, null, 2));
    return true;
  }

  // ---- first run: claim the seeded owner account ---------------------------
  // No session, because there is no account to sign in to yet. Guarded by a
  // token from the environment AND by the account having no password — the
  // second is what makes this a one-time act rather than a standing reset.
  if (path === 'setup') {
    const form = method === 'POST' ? await readFormBody(req) : {};
    const token = method === 'POST' ? form.token : url.searchParams.get('token') || '';

    const allowed = setupAllowed(token);
    if (!allowed.ok) {
      html(res, 403, problemPage({ title: 'Setup is not available', message: allowed.reason, fix: allowed.fix }));
      return true;
    }

    const email = (method === 'POST' ? form.email : url.searchParams.get('email')) || '';
    const user = await deps.findUserByEmail(String(email).trim().toLowerCase());

    if (method === 'GET') {
      const begun = beginSetup(user);
      if (!begun.ok) {
        html(res, 400, problemPage({
          title: 'Cannot set up this account',
          message: begun.reason,
          fix: user ? null : `No platform account exists for that email address. Check the email in the link, or re-run platform/seed.sql with your address in it.`,
        }));
        return true;
      }
      html(res, 200, setupPage({
        token, email: user.email, secret: begun.secret, otpauth: begun.otpauth,
      }));
      return true;
    }

    const result = await completeSetup(deps, {
      user,
      secret: form.secret,
      password: form.password,
      totp: form.totp,
    });

    if (!result.ok) {
      // The same secret is carried back, so a mistyped code does not mean
      // re-adding the account to the authenticator app.
      html(res, 400, setupPage({
        token, email: user?.email ?? email, secret: form.secret,
        otpauth: '', error: result.reason,
      }));
      return true;
    }

    html(res, 200, setupDonePage({ recoveryCodes: result.recoveryCodes }));
    return true;
  }

  // ---- public: owner activation --------------------------------------------
  // No session, and deliberately no CSRF token: the owner has no account to be
  // signed in to yet, and the link-plus-code IS the credential. A cross-site
  // request here would need both halves, and an attacker with both does not
  // need the victim's browser.
  // ---- forgot password ------------------------------------------------------
  // (Inside handleExtraRoutes, a handled request must RETURN TRUE. html()
  // returns nothing, so `return html(...)` reads as "not handled" and the
  // caller writes a 404 over the page.)
  if (path === 'forgot') {
    if (method === 'GET') {
      html(res, 200, forgotPage({}));
      return true;
    }

    if (method === 'POST') {
      if (!(await deps.rateLimitReset(req))) {
        html(res, 429, forgotPage({ error: 'Too many requests. Please wait a few minutes and try again.' }));
        return true;
      }
      const form = await readFormBody(req);
      const { message } = await requestReset(deps, { email: form.email });
      html(res, 200, forgotPage({ message }));
      return true;
    }
  }

  if (path === 'reset') {
    if (method === 'GET') {
      html(res, 200, resetPage({ token: url.searchParams.get('token') || '' }));
      return true;
    }

    if (method === 'POST') {
      const form = await readFormBody(req);
      const result = await completeReset(deps, { token: form.token, password: form.password });
      // The token is echoed back on a too-short password, so the person can
      // try again without going back to their inbox.
      if (!result.ok) html(res, 400, resetPage({ token: form.token, error: result.reason }));
      else html(res, 200, resetDonePage({ gymAccountsUpdated: result.gymAccountsUpdated }));
      return true;
    }
  }

  if (path === 'activate') {
    if (method === 'GET') {
      const token = url.searchParams.get('token') || '';
      const context = (await deps.activationContext?.(token)) || {};
      html(res, 200, activatePage({ token, gymName: context.gymName, email: context.email, expired: context.expired === true }));
      return true;
    }

    if (method === 'POST') {
      const form = await readFormBody(req);

      // The Gym Owner Agreement is accepted HERE, before anything changes —
      // checked on the server too, since a browser's `required` is a courtesy.
      // Refused without consuming the link, so the owner can tick and retry.
      if (form.accept_terms !== 'yes') {
        html(res, 400, activatePage({ token: form.token, email: form.username, error: 'Please read and accept the Gym Owner Agreement.' }));
        return true;
      }

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
        html(res, 400, activatePage({ token: form.token, email: form.username, error: result.reason, expired: result.expired === true }));
        return true;
      }

      // The gym's slug, so the page can hand the owner a working link into
      // their own panel rather than leaving them to find it.
      const activated = (await deps.getGym?.(result.gymId)) || {};

      // The evidence of what was agreed, and when: the version the owner saw.
      await deps.audit({
        action: 'platform.owner.agreement_accepted',
        actor_kind: 'gym_owner',
        actor_user_id: result.userId,
        entity: 'gym',
        entity_id: result.gymId,
        detail: { version: AGREEMENT_VERSION },
      });

      html(res, 200, activateSuccessPage({
        gymActivated: result.gymActivated,
        gymSlug: activated.slug || '',
        gymUsername: result.gymUsername || '',
        ownerRef: ownerId(result.userId) || '',
      }));
      return true;
    }
  }

  // ---- a new link, asked for from an expired one (CLAUDE.md §43.1 Q1) ---------
  // The expired link is the proof of who is asking: it was only ever emailed to
  // them. At most one link a day, whoever asks — issueActivation enforces it.
  if (path === 'activate/renew' && method === 'POST') {
    const form = await readFormBody(req);
    // This part of the router says "handled" by returning true.
    const page = (title, message, extra = {}) => {
      html(res, extra.status || 200, problemPage({ title, message, back: extra.back || null }));
      return true;
    };

    const check = await deps.renewActivation(form.token);
    if (!check.ok) {
      if (check.reason === 'used') {
        return page('Your account is already active', 'This link was already used. Sign in with your email and the password you chose.', { back: { href: '/platform/login?as=owner', label: 'Sign in' } });
      }
      if (check.reason === 'still_valid') {
        redirect(res, `/platform/activate?token=${encodeURIComponent(form.token || '')}`);
        return true;
      }
      return page('That link is not valid', 'Please use the newest link in your email.', { status: 400 });
    }

    const activation = await deps.issueActivation({ userId: check.userId, gymId: check.gymId });
    if (activation.limited) {
      return page(
        'One link a day',
        `A link was already sent in the last 24 hours. You can ask for a new one ${waitText(activation.nextAt)} — open this same link again then.`,
        { status: 429 }
      );
    }
    await deps.audit({ action: 'platform.owner.activation_renewed', actor_kind: 'gym_owner', actor_user_id: check.userId, entity: 'gym', entity_id: check.gymId });
    return page(
      activation.emailed ? 'A new link is on its way' : 'We could not send the email',
      activation.emailed
        ? `Check your email now. The new link and code work for ${ACTIVATION_TTL_MINUTES} minutes.`
        : 'Please write to hello@mulesoo.com and we will help you finish activating.'
    );
  }

  // ---- the gym owner's own page --------------------------------------------
  // Not where they run their gym. Members, check-ins and payments live in
  // their own gym admin panel, which is the existing single-gym system and is
  // untouched (§32). This is the account: application, documents, subscription.
  if (path === 'my-gym' && method === 'GET') {
    if (toOwnerDoor(req, res)) return true;
    const session = requireSession(req, res);
    if (!session) return true;

    const view = (await deps.ownerDashboard(session.sub)) || {};
    // What Yoyo Gyms commits to for this owner's plan, and how to reach it
    // (§41.1 Q6, Q7). Best-effort: the page loads without it.
    const support = view.gym ? await deps.ownerSupport?.(view.gym).catch(() => null) : null;
    const plans = view.gym ? (await deps.listPlans?.().catch(() => [])) || [] : [];
    html(res, 200, ownerDashboardPage({
      ...view,
      inApp: isStoreApp(req.headers['user-agent']),
      support,
      // What this gym's plan promises NOW, from its switches (§47.1 Q4).
      planSupport: view.gym
        ? supportFor(plans.find((p) => p.key === view.gym.plan_key) || { key: view.gym.plan_key })
        : null,
      // The plan the subscription is billed on — the fee Pay now takes (§48).
      plan: plans.find((p) => p.id === view.subscription?.plan_id) || plans.find((p) => p.key === view.gym?.plan_key) || null,
      user: await viewer(deps, session),
      csrfToken: issueCsrfToken(session.sub),
    }));
    return true;
  }

  // ---- the owner asks to close their account ---------------------------------
  // Records the request; deletes nothing (see requestClosure in deps.js).
  if (path === 'my-gym/close' && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    try {
      await deps.requestClosure(session.sub);
    } catch {
      html(res, 500, problemPage({
        title: 'We could not record that',
        message: 'Your request to close your account was not saved. Please try again, or contact us.',
      }));
      return true;
    }
    return redirect(res, '/platform/my-gym'), true;
  }

  // ---- how to delete your account — the web route the stores require -------
  // ---- the website's front door (vercel.json sends / here) ------------------
  // What an owner gets is on this page now, from the live plans (§41), not at
  // the top of the application form (design critique 2026-09-29).
  if (path === 'welcome' && method === 'GET') {
    html(res, 200, welcomePage({ plans: await livePlansForOwners(deps), includes: EVERY_PLAN_INCLUDES }));
    return true;
  }

  if (path === 'delete-account' && method === 'GET') {
    html(res, 200, deleteAccountPage());
    return true;
  }

  // ---- the Gym Owner Agreement — a draft until someone approves it ----------
  if (path === 'terms' && method === 'GET') {
    html(res, 200, termsPage({ sections: agreementTerms(), version: AGREEMENT_VERSION, approved: termsApproved() }));
    return true;
  }

  // ---- the owner's own copy of it, as a PDF --------------------------------
  // Signed-in owners only, and only ever THEIR gym: everything below is keyed
  // on the session, never on anything in the URL.
  if (path === 'my-gym/agreement.pdf' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    const view = (await deps.ownerDashboard(session.sub)) || {};
    const gym = view.gym;
    if (!gym) {
      html(res, 404, problemPage({ title: 'No agreement yet', message: 'Your agreement is issued when your gym is approved and you activate your account.' }));
      return true;
    }

    const plans = (await deps.listPlans?.().catch(() => [])) || [];
    const plan = plans.find((p) => p.key === gym.plan_key);
    const accepted = ((await deps.listAuditLog?.({ action: 'platform.owner.agreement_accepted', limit: 200 }).catch(() => [])) || [])
      .find((e) => e.actor_user_id === session.sub);

    const pdf = await agreementPdf({
      ownerId: ownerId(session.sub),
      ownerName: view.ownerName || '',
      ownerEmail: session.email,
      gymName: gym.search_name,
      gymAddress: `${platformBaseUrl()}/g/${gym.slug}/admin/login`,
      gymUsername: OWNER_USERNAME,
      planLabel: plan?.label || gym.plan_key || '',
      priceText: Number.isFinite(Number(plan?.price_cents)) && plan?.price_cents !== null
        ? `${plan.currency || 'ZAR'} ${(Number(plan.price_cents) / 100).toFixed(2)} a month`
        : 'price set on your owner page',
      trialEndsAt: view.subscription?.trial_ends_at ?? null,
      acceptedAt: accepted?.created_at ?? null,
      acceptedVersion: accepted?.detail?.version ?? null,
      approved: termsApproved(),
    });

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Yoyo-Gyms-Agreement-${ownerId(session.sub) || 'owner'}.pdf"`,
      'Cache-Control': 'private, no-store',
    });
    res.end(pdf);
    return true;
  }

  // ---- the privacy policy — a draft until someone approves it --------------
  if (path === 'privacy' && method === 'GET') {
    html(res, 200, privacyPage({
      approved: process.env.PLATFORM_PRIVACY_APPROVED === 'true',
      contact: process.env.PLATFORM_PRIVACY_CONTACT || '',
    }));
    return true;
  }

  // ---- the owner pays their subscription ------------------------------------
  // ON THE WEB, NEVER IN THE APP (D-060). Apple and Google take 15-30% of a
  // digital subscription bought inside an app; Paystack takes about 3%. The
  // app has no purchase route at all, which is also what the stores'
  // anti-steering rules require.
  if (path === 'my-gym/pay' && method === 'POST') {
    // Never from inside the store app: owners pay on the website (§46.1 Q4).
    if (isStoreApp(req.headers['user-agent'])) return redirect(res, '/platform/my-gym'), true;
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    // The gym comes from the SESSION, never from the form. An owner pays for
    // their own gym or for nothing.
    const view = (await deps.ownerDashboard(session.sub)) || {};
    if (!view.gym) {
      html(res, 404, '<p>No gym found for this account.</p>');
      return true;
    }

    const result = await startCheckout(deps, { gymId: view.gym.id, userId: session.sub });

    if (!result.ok) {
      html(res, 400, `<p>${result.reason}</p><p><a href="/platform/my-gym">Back</a></p>`);
      return true;
    }

    // Off to Paystack. Nothing is charged here; this is a redirect to their
    // hosted page, which is where the card is entered and where it stays.
    redirect(res, result.url);
    return true;
  }

  // ---- "Pay now" from the gym's own admin panel (CLAUDE.md §48) --------------
  // The owner is signed in to their GYM there, not to this site, so the gym's
  // server — having checked that this is the gym's owner — hands the page a
  // five-minute ticket naming the gym (shared/pay-ticket.js). The ticket opens
  // the payment page for that gym at its plan's price, and does nothing else.
  if (path === 'pay/start' && method === 'POST') {
    if (isStoreApp(req.headers['user-agent'])) return redirect(res, '/platform/my-gym'), true;
    const form = await readFormBody(req);
    const ticket = readPayTicket(form.ticket, payTicketKey());
    const back = ticket?.slug
      ? { href: `/g/${encodeURIComponent(ticket.slug)}/admin`, label: 'Back to your gym admin panel' }
      : { href: '/platform/my-gym', label: 'Your Yoyo account' };
    if (!ticket) {
      html(res, 400, problemPage({
        title: 'That link has expired',
        message: 'For your safety, Pay now works for five minutes. Go back to your gym admin panel and press it again.',
      }));
      return true;
    }

    const result = await startCheckout(deps, { gymId: ticket.gymId, source: 'gym admin panel' });
    if (!result.ok) {
      html(res, 400, problemPage({ title: 'Nothing was charged', message: result.reason, back }));
      return true;
    }
    redirect(res, result.url);
    return true;
  }

  // ---- Paystack sends the owner back ----------------------------------------
  if (path === 'pay/callback' && method === 'GET') {
    // NO SESSION REQUIRED, and none is trusted if present. The reference in
    // this URL is a claim made by whoever opened it; completeCheckout settles
    // it by asking Paystack directly, server to server.
    const result = await completeCheckout(deps, { reference: url.searchParams.get('reference') });
    // The way back to the gym's own admin panel, where an owner who paid from
    // its dashboard came from (CLAUDE.md §48). Best-effort.
    const gym = result.invoice?.gym_id ? await deps.getGym?.(result.invoice.gym_id).catch(() => null) : null;

    html(res, result.ok ? 200 : 400, paymentResultPage({
      ok: result.ok,
      reason: result.reason,
      alreadyPaid: result.alreadyPaid,
      paidTwice: result.paidTwice,
      recurring: result.recurring,
      gymSlug: gym?.slug || '',
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

    // Asked for more, and it has arrived: back to the reviewer's queue, as the
    // email promised (CLAUDE.md §40.1 F-40.5).
    if (application.status === 'info_requested') await deps.resumeReview?.(application.id, session.sub);

    // The step-by-step upload page stays where it is and shows the new file.
    if (form.respond === 'json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
    redirect(res, '/platform/my-gym');
    return true;
  }

  // ---- plans and prices ----------------------------------------------------
  // The screen the platform cannot be run without: billing skips any plan with
  // no price, so until a price is set here, nobody is charged anything.
  if (path === 'plans' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    if (!(await may(deps, session, 'subscription.manage'))) {
      forbid(res, 'You do not have permission to manage plans and prices.');
      return true;
    }

    html(res, 200, plansPage({
      plans: await deps.listPlans(),
      user: await viewer(deps, session),
      csrfToken: issueCsrfToken(session.sub),
    }));
    return true;
  }

  const planUpdate = /^plans\/([A-Za-z0-9_-]+)$/.exec(path);
  if (planUpdate && method === 'POST') {
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    if (!(await may(deps, session, 'subscription.manage'))) {
      forbid(res, 'You do not have permission to manage plans and prices.');
      return true;
    }

    // THE FORM IS IN RANDS. EVERYTHING BELOW IS IN CENTS. Getting this wrong
    // by a factor of 100 is the classic billing bug, so the conversion happens
    // exactly here and nowhere else.
    const price = Number(String(form.price || '').trim());

    if (!Number.isFinite(price) || price <= 0) {
      // Refused rather than stored as null or zero. "Free" is not what an
      // empty box means — it means every gym on this plan stops being billed,
      // silently, and that should never be a typo away.
      const bad = plansPage({
        plans: await deps.listPlans(),
        user: await viewer(deps, session),
        csrfToken: issueCsrfToken(session.sub),
        error: 'Enter a price greater than zero, like 499.00. To stop offering a plan, untick "Offered to new gyms".',
      });
      html(res, 400, bad);
      return true;
    }

    const priceCents = Math.round(price * 100);
    const maxMembers = Number.parseInt(form.max_active_members, 10);

    // THE PLAN'S SERVICES (§41.1 Q2), from its switches. Core services are
    // always kept on, whatever was sent: a gym without them is not running.
    const features = ALL_SERVICES.filter((f) => CORE_FEATURES.includes(f) || form[`svc_${f}`] === '1');
    // What a person at Yoyo delivers, and the free trial (CLAUDE.md §47.1 Q4).
    const promises = PLAN_PROMISES.map(([k]) => k).filter((k) => form[`promise_${k}`] === '1');
    const trialDays = Number.parseInt(form.trial_days, 10);

    await deps.updatePlan(planUpdate[1], {
      price_cents: priceCents,
      max_active_members: Number.isInteger(maxMembers) && maxMembers > 0 ? maxMembers : null,
      is_enabled: form.is_enabled === '1',
      features,
      promises,
      trial_days: Number.isInteger(trialDays) && trialDays >= 0 && trialDays <= 365 ? trialDays : 30,
    });

    // Audited because this single number decides what every gym on the plan
    // pays, and "who changed the price, and when" is the first question after
    // a billing complaint.
    await deps.audit({
      action: 'platform.plan.updated',
      actor_user_id: session.sub,
      entity: 'plan',
      entity_id: planUpdate[1],
      detail: { price_cents: priceCents, max_active_members: maxMembers, is_enabled: form.is_enabled === '1', features, promises, trial_days: trialDays },
    });

    redirect(res, '/platform/plans');
    return true;
  }

  // ---- the audit log -------------------------------------------------------
  if (path === 'audit' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    if (!(await may(deps, session, 'audit.view'))) {
      forbid(res, 'You do not have permission to read the audit log.');
      return true;
    }

    // Filtered AND paged. After a year this is the largest table on the
    // platform; a filter narrows it to a question, and paging makes the
    // answer readable when the question is still a broad one.
    const paging = pageRequest(url.searchParams.get('page'));
    const filter = {
      action: (url.searchParams.get('action') || '').trim(),
      entityId: (url.searchParams.get('entity_id') || '').trim(),
      from: paging.from,
      to: paging.to,
    };

    const entries = await deps.listAuditLog(filter);
    html(res, 200, auditPage({
      entries,
      filter,
      page: pageState({ ...paging, total: entries.total, returned: entries.length }),
      user: await viewer(deps, session),
    }));
    return true;
  }

  // ---- the front page ------------------------------------------------------
  // Signing in used to land on the applications queue — one list, chosen
  // because it was built first. A panel for running a business opens on what
  // is waiting for a decision.
  if ((path === '' || path === 'home') && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    // Yoyo staff only. A gym owner's session used to open this page and read
    // platform-wide figures — applications waiting, every gym, money owed
    // (CLAUDE.md §40.1 F-40.2). An owner is sent to their own page.
    if (session.kind === 'gym_owner') return redirect(res, '/platform/my-gym'), true;

    // A staff account with no access at all — switched off, or never given a
    // role — sees nothing about the platform either.
    if (!(await permissionsOf(deps, session)).length) {
      html(res, 403, problemPage({
        title: 'Your account has no access',
        message: 'This account has been switched off, or has not been given a role yet. Ask a platform owner.',
        back: { href: '/platform/logout', label: 'Sign out' },
      }));
      return true;
    }

    // Everything is best-effort and independent. A dashboard that fails
    // entirely because one figure could not be fetched is worse than one
    // showing four numbers out of five.
    const safe = async (fn, fallback) => {
      try {
        return (await fn()) ?? fallback;
      } catch {
        return fallback;
      }
    };

    const [applications, allGyms, finance, entries, closureRequests, owners, gymCounts, seesMoney] = await Promise.all([
      safe(() => deps.listApplications(), []),
      safe(() => deps.listGyms({ limit: 500 }), []),
      safe(() => deps.financeSummary(), {}),
      safe(() => deps.listAuditLog({ limit: 500 }), []),
      safe(() => deps.countClosureRequests(), 0),
      safe(() => deps.countOwners?.(), null),
      safe(() => deps.countGyms?.(), null),
      may(deps, session, 'subscription.manage'),
    ]);
    const setupRequests = await safe(() => deps.countSetupRequests?.(), 0);

    // To review (the reviewer's move) and waiting on the owner (theirs) are
    // different queues, so Today counts them apart.
    const waiting = applications.filter((a) => ['submitted', 'under_review'].includes(a.status)).length;
    const waitingOnOwner = applications.filter((a) => a.status === 'info_requested').length;

    // The registry's own counts when available: the list above stops at 500.
    const byStatus = gymCounts || allGyms.reduce((m, g) => ((m[g.status] = (m[g.status] ?? 0) + 1), m), {});
    const totalGyms = Object.values(byStatus).reduce((n, c) => n + c, 0);
    const names = new Map(allGyms.map((g) => [g.id, g.search_name || g.slug]));

    html(res, 200, dashboardPage({
      user: await viewer(deps, session),
      waiting,
      waitingOnOwner,
      gyms: totalGyms,
      activeGyms: byStatus.active ?? 0,
      gymCounts: byStatus,
      owners,
      alerts: findAlerts(entries, { now: new Date() }).length,
      closureRequests,
      provisioning: provisioningReadiness(),
      unpricedPlans: finance.unpriced_plans || [],
      // Money only for someone who may see the finances.
      outstandingCents: seesMoney ? finance.outstanding_cents ?? 0 : null,
      mrrCents: seesMoney ? finance.mrr_cents ?? null : null,
      currency: finance.currency || 'ZAR',
      trialsEndingSoon: (finance.trials_ending || []).map((t) => ({ ...t, name: names.get(t.gym_id) || 'A gym' })),
      setupRequests,
      recent: entries,
    }));
    return true;
  }

  // ---- your own account ----------------------------------------------------
  if (path === 'account' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    // Recovery codes for the staff second factor. An owner's account lives on
    // their own page.
    if (session.kind === 'gym_owner') return redirect(res, '/platform/my-gym'), true;

    const user = await deps.findUserByEmail(session.email);
    html(res, 200, accountPage({
      user: await viewer(deps, session),
      remaining: remainingCodes(user),
      csrfToken: issueCsrfToken(session.sub),
    }));
    return true;
  }

  if (path === 'account/recovery-codes' && method === 'POST') {
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    const user = await deps.findUserByEmail(session.email);
    const result = await regenerateRecoveryCodes(deps, {
      user,
      password: form.password,
      totp: form.totp,
    });

    html(res, result.ok ? 200 : 400, accountPage({
      user: await viewer(deps, session),
      remaining: remainingCodes(user),
      csrfToken: issueCsrfToken(session.sub),
      error: result.ok ? '' : result.reason,
      codes: result.ok ? result.codes : null,
    }));
    return true;
  }

  // ---- platform security ---------------------------------------------------
  if (path === 'security' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    // The same permission as the audit log: this is a reading of it.
    if (!(await may(deps, session, 'audit.view'))) {
      forbid(res, 'You do not have permission to see platform security.');
      return true;
    }

    // Read once, analysed in memory. The alternative is six queries asking the
    // same table six slightly different questions.
    const entries = await deps.listAuditLog({ limit: 500 });
    const alerts = findAlerts(entries, { now: new Date(), windowHours: DEFAULT_WINDOW_HOURS });

    html(res, 200, securityPage({
      alerts,
      windowHours: DEFAULT_WINDOW_HOURS,
      user: await viewer(deps, session),
    }));
    return true;
  }

  // ---- gym owners ----------------------------------------------------------
  if (path === 'owners' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    if (!(await may(deps, session, 'platform.manage'))) {
      forbid(res, 'You do not have permission to manage gym owners.');
      return true;
    }

    const paging = pageRequest(url.searchParams.get('page'));
    const filter = {
      query: (url.searchParams.get('q') || '').trim(),
      from: paging.from,
      to: paging.to,
    };

    const owners = await deps.listOwners(filter);
    html(res, 200, ownersPage({
      owners,
      page: pageState({ ...paging, total: owners.total, returned: owners.length }),
      filter,
      user: await viewer(deps, session),
      csrfToken: issueCsrfToken(session.sub),
    }));
    return true;
  }

  // "Close now" (CLAUDE.md §46.1 Q3): what the nightly job does on day 30,
  // done sooner by Yoyo staff — gyms suspended, sign-in off, details erased.
  const ownerClose = /^owners\/([A-Za-z0-9-]+)\/close$/.exec(path);
  if (ownerClose && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;
    if (!(await may(deps, session, 'platform.manage'))) {
      forbid(res, 'You do not have permission to manage gym owners.');
      return true;
    }
    const result = await deps.closeOwnerAccount(ownerClose[1]);
    if (result.ok && !result.already) {
      await deps.audit({
        action: 'platform.owner.closed',
        actor_user_id: session.sub,
        entity: 'platform_user',
        entity_id: ownerClose[1],
        detail: { gyms_suspended: result.gymsSuspended, emailed: result.emailed, by: 'staff' },
      });
    }
    redirect(res, '/platform/owners');
    return true;
  }

  const ownerToggle = /^owners\/([A-Za-z0-9-]+)\/(deactivate|reactivate)$/.exec(path);
  if (ownerToggle && method === 'POST') {
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    if (!(await may(deps, session, 'platform.manage'))) {
      forbid(res, 'You do not have permission to manage gym owners.');
      return true;
    }

    const [, ownerId, action] = ownerToggle;
    const active = action === 'reactivate';

    // Switching an owner off stops them SIGNING IN. It does not close their
    // gym and it deletes nothing — the two are separate on purpose, because
    // "this account is compromised" and "this gym has stopped paying" call for
    // different actions.
    await deps.setOwnerActive(ownerId, active);
    await deps.audit({
      action: active ? 'platform.owner.reactivated' : 'platform.owner.deactivated',
      actor_user_id: session.sub,
      entity: 'platform_user',
      entity_id: ownerId,
    });

    redirect(res, '/platform/owners');
    return true;
  }

  // ---- finances ------------------------------------------------------------
  if (path === 'finance' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    if (!(await may(deps, session, 'subscription.manage'))) {
      forbid(res, 'You do not have permission to see platform finances.');
      return true;
    }

    html(res, 200, financePage({
      summary: await deps.financeSummary(),
      user: await viewer(deps, session),
    }));
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
      html(res, 404, problemPage({ title: 'That document does not exist', message: 'It may have been removed, or the link is wrong.', back: { href: '/platform/applications', label: 'All applications' }, user: await viewer(deps, session) }));
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

    // The facts about the bytes, and anywhere else this exact file has been
    // seen. Both are best-effort: a storage hiccup must not stop a reviewer
    // seeing the document, it only means they see it with less around it.
    let facts = null;
    let duplicates = [];
    try {
      facts = await deps.documentFacts(doc);
      if (facts?.sha256) duplicates = await deps.findDuplicateDocuments(facts.sha256, doc.id);
    } catch (err) {
      console.error('document forensics failed:', err?.message);
    }

    const [application, canDecide] = await Promise.all([
      deps.getApplicationSummary?.(doc.application_id) ?? null,
      may(deps, session, 'application.approve'),
    ]);

    html(res, 200, documentReviewPage({
      doc,
      application,
      facts,
      duplicates,
      user: await viewer(deps, session),
      csrfToken: issueCsrfToken(session.sub),
      canDecide,
    }));
    return true;
  }

  // ---- the document's bytes ------------------------------------------------
  // Split from the page on purpose: the viewer needs a URL it can load, and a
  // signed storage URL must never appear in the page source, the browser cache
  // or a screenshot of the review screen.
  const docFile = /^documents\/([A-Za-z0-9-]+)\/file$/.exec(path);
  if (docFile && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;

    if (!(await may(deps, session, 'application.view'))) {
      forbid(res, 'You do not have permission to open application documents.');
      return true;
    }

    const doc = await deps.getDocument(docFile[1]);
    if (!doc) {
      html(res, 404, problemPage({ title: 'That document does not exist', message: 'It may have been removed, or the link is wrong.', back: { href: '/platform/applications', label: 'All applications' }, user: await viewer(deps, session) }));
      return true;
    }

    // Five minutes. Long enough to read a document, short enough that a URL
    // left anywhere is useless by the time somebody finds it.
    // ?download=1 asks storage to send it as a file to save, under its own
    // name — for a phone that cannot show it inline.
    const download = url.searchParams.get('download') === '1' ? doc.filename || 'document' : null;
    // Every open and every download is recorded (CLAUDE.md §42.1 Q1): a copy
    // of someone's ID leaving the platform is exactly what the log is for.
    await deps.audit({
      action: download ? 'platform.document.downloaded' : 'platform.document.opened',
      actor_user_id: session.sub,
      entity: 'document',
      entity_id: doc.id,
      detail: { application_id: doc.application_id, doc_type: doc.doc_type },
    });
    const signed = await deps.signedDocumentUrl(doc.storage_ref, 300, { download });
    if (!signed) {
      // Not a redirect to nowhere. A broken link here looks like a missing
      // document, and a reviewer might reject an application over it.
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('That document could not be opened just now. Please try again.');
      return true;
    }

    redirect(res, signed);
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
      html(res, 404, problemPage({ title: 'That document does not exist', message: 'It may have been removed, or the link is wrong.', back: { href: '/platform/applications', label: 'All applications' }, user: await viewer(deps, session) }));
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

    // Searchable AND paged. A list capped at 200 is not a registry at ten
    // thousand gyms — it is the first 200, with the rest invisible and no
    // sign that they were left out.
    // 25 a page: each row now carries live counts (§40.1 F-40.7), three
    // small count queries per gym, run in parallel.
    const paging = pageRequest(url.searchParams.get('page'), { size: 25 });
    const filter = {
      query: (url.searchParams.get('q') || '').trim(),
      status: (url.searchParams.get('status') || '').trim(),
      // Gyms waiting for the setup help they asked for (Today links here).
      setup: url.searchParams.get('setup') === '1',
      from: paging.from,
      to: paging.to,
    };

    const gyms = await deps.listGyms(filter);

    // Best-effort: a list that cannot fetch its figures still lists the gyms.
    let stats = null;
    try {
      stats = (await deps.gymStatsForMany?.(gyms, session.sub)) ?? null;
    } catch (err) {
      console.error('registry stats failed:', err?.message);
    }

    html(res, 200, registryPage({
      gyms,
      stats,
      page: pageState({ ...paging, total: gyms.total, returned: gyms.length }),
      filter,
      user: await viewer(deps, session),
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
      html(res, 404, problemPage({ title: 'That gym does not exist', message: 'It may have been removed, or the link is wrong.', back: { href: '/platform/registry', label: 'All gyms' }, user: await viewer(deps, session) }));
      return true;
    }

    const canBill = await may(deps, session, 'subscription.manage');

    // Counts only (D-130). Best-effort: a gym whose schema cannot be reached
    // is a fact the page shows, not an error that hides the whole gym.
    let stats = null;
    try {
      stats = (await deps.gymStatsFor?.(view.gym, session.sub)) ?? null;
    } catch (err) {
      console.error('gym stats failed:', err?.message);
    }

    const NOTICES = {
      activation: 'A new activation link was emailed to the owner. The old link no longer works.',
      services: "This gym's services are saved. The gym sees the change within a minute.",
      manager: 'The account manager is saved.',
      setup: 'Setup help is recorded as given.',
    };
    const canManage = await may(deps, session, 'platform.manage');

    html(res, 200, gymDetailPage({
      ...view,
      stats,
      notice: NOTICES[url.searchParams.get('sent')] || '',
      user: await viewer(deps, session),
      csrfToken: issueCsrfToken(session.sub),
      canSuspend: await may(deps, session, 'gym.suspend'),
      canOnboard: await may(deps, session, 'application.approve'),
      canBill,
      canManage,
      // Who can be a gym's account manager: active staff who have set up.
      staff: canManage ? ((await deps.listStaff?.().catch(() => [])) || []).filter((m) => m.is_active !== false && m.set_up) : [],
      // Only fetched for someone who may act on it.
      plans: canBill ? PLANS.map((p) => ({ key: p.key, label: p.label })) : [],
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

    html(res, 200, driftPage({ report, user: await viewer(deps, session), csrfToken: issueCsrfToken(session.sub) }));
    return true;
  }

  // ---- move one gym to another plan ----------------------------------------
  // The request every gym eventually makes. Without it, an upgrade means
  // editing the database by hand.
  const planChange = /^registry\/([A-Za-z0-9-]+)\/plan$/.exec(path);
  if (planChange && method === 'POST') {
    const form = await readFormBody(req);

    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    if (!(await may(deps, session, 'subscription.manage'))) {
      forbid(res, 'You do not have permission to change a gym plan.');
      return true;
    }

    // The key must be one we actually sell. Writing an unknown plan_key would
    // leave the gym with no entitlements at all — gating fails closed, so
    // every feature would switch off at once and nobody would know why.
    if (!planByKey(form.plan_key)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('That is not a plan we offer.');
      return true;
    }

    await deps.changeGymPlan(planChange[1], form.plan_key);
    await deps.audit({
      action: 'platform.gym.plan_changed',
      actor_user_id: session.sub,
      entity: 'gym',
      entity_id: planChange[1],
      // A downgrade never deletes members (D-102); only new registrations stop.
      detail: { plan_key: form.plan_key },
    });

    redirect(res, `/platform/registry/${planChange[1]}`);
    return true;
  }

  // ---- send the owner a new activation link (CLAUDE.md §40.1 F-40.9) --------
  // A lost email or an expired 48-hour link used to leave an approved gym
  // stuck, with nothing in the panel to unstick it.
  const resendActivation = /^registry\/([A-Za-z0-9-]+)\/resend-activation$/.exec(path);
  if (resendActivation && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;

    // Onboarding work: the same permission as approving.
    if (!(await may(deps, session, 'application.approve'))) {
      forbid(res, 'You do not have permission to send activation links.');
      return true;
    }

    const view = await deps.getGymDetail(resendActivation[1]);
    const gym = view?.gym;
    if (!gym || gym.status !== 'pending' || !gym.owner_user_id) {
      html(res, 409, problemPage({
        title: 'No activation link to send',
        message: gym
          ? 'This gym is already open, or has no owner recorded, so there is nothing to activate.'
          : 'That gym does not exist.',
        back: { href: `/platform/registry/${resendActivation[1]}`, label: 'Back to the gym' },
        user: await viewer(deps, session),
      }));
      return true;
    }

    // Old links are retired INSIDE issueActivation, after the once-a-day check:
    // retired here first, a refused resend would kill the owner's working link
    // and give them nothing in its place.
    const activation = await deps.issueActivation({ userId: gym.owner_user_id, gymId: gym.id });
    if (activation.limited) {
      html(res, 409, problemPage({
        title: 'A link was already sent today',
        message: `The owner can receive one activation link a day, and one was sent less than 24 hours ago. ` +
          `The next can be sent ${waitText(activation.nextAt)}. The link they have lasts 10 minutes; once it ` +
          `expires they can ask for the next one themselves from the same page.`,
        back: { href: `/platform/registry/${gym.id}`, label: 'Back to the gym' },
        user: await viewer(deps, session),
      }));
      return true;
    }
    await deps.audit({
      action: 'platform.owner.activation_resent',
      actor_user_id: session.sub,
      entity: 'gym',
      entity_id: gym.id,
    });

    // The same hand-over as at approval: no email, so the reviewer sees the
    // link and code once, to send by hand.
    if (!activation.emailed) {
      html(res, 200, activationHandoverPage({
        activation,
        gymName: gym.search_name || gym.slug,
        backHref: `/platform/registry/${gym.id}`,
        user: await viewer(deps, session),
      }));
      return true;
    }

    redirect(res, `/platform/registry/${gym.id}?sent=activation`);
    return true;
  }

  // ---- the Yoyo staff team (CLAUDE.md §40.1 Q4) -----------------------------
  const TEAM_NOTICES = {
    invited: 'Invitation sent.',
    resent: 'A new invitation link was sent. The old one no longer works.',
    role: 'Role changed. It applies from their next click.',
    deactivate: 'Switched off. They can no longer sign in, and an open session loses its access at once.',
    reactivate: 'Switched back on.',
  };

  const teamScreen = async (session, extra = {}) =>
    teamPage({
      staff: await deps.listStaff(),
      roles: STAFF_ROLES,
      me: session.sub,
      user: await viewer(deps, session),
      csrfToken: issueCsrfToken(session.sub),
      ...extra,
    });

  if (path === 'team' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;
    if (!(await may(deps, session, 'platform.manage'))) {
      forbid(res, 'You do not have permission to manage the team.');
      return true;
    }
    html(res, 200, await teamScreen(session, { notice: TEAM_NOTICES[url.searchParams.get('done')] || '' }));
    return true;
  }

  if (path === 'team/invite' && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;
    if (!(await may(deps, session, 'platform.manage'))) {
      forbid(res, 'You do not have permission to manage the team.');
      return true;
    }

    const problem = inviteProblem({ email: form.email, fullName: form.full_name, role: form.role });
    if (problem) {
      html(res, 400, await teamScreen(session, { error: problem }));
      return true;
    }

    const result = await deps.inviteStaff({
      email: form.email,
      fullName: form.full_name,
      role: form.role,
      invitedBy: session.sub,
    });
    if (!result.ok) {
      html(res, 400, await teamScreen(session, { error: result.error }));
      return true;
    }
    if (!result.emailed) {
      html(res, 200, inviteHandoverPage({ invite: result, user: await viewer(deps, session) }));
      return true;
    }
    redirect(res, '/platform/team?done=invited');
    return true;
  }

  const teamChange = /^team\/([A-Za-z0-9-]+)\/(role|deactivate|reactivate|resend)$/.exec(path);
  if (teamChange && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;
    if (!(await may(deps, session, 'platform.manage'))) {
      forbid(res, 'You do not have permission to manage the team.');
      return true;
    }

    const [, userId, change] = teamChange;
    const target = await deps.staffMember(userId);
    const refuse = async (error) => {
      html(res, 400, await teamScreen(session, { error }));
      return true;
    };

    if (change === 'resend') {
      if (!target || target.id === session.sub) return refuse('That person is not on the team.');
      const result = await deps.resendStaffInvite(userId, session.sub);
      if (!result.ok) return refuse(result.error);
      if (!result.emailed) {
        html(res, 200, inviteHandoverPage({ invite: result, user: await viewer(deps, session) }));
        return true;
      }
      redirect(res, '/platform/team?done=resent');
      return true;
    }

    const problem = teamChangeProblem({
      actorId: session.sub,
      target,
      change,
      newRole: form.role,
      activeOwners: await deps.countActiveOwners(),
    });
    if (problem) return refuse(problem);

    if (change === 'role') {
      await deps.setStaffRole(userId, form.role, session.sub);
      await deps.audit({
        action: 'platform.staff.role_changed',
        actor_user_id: session.sub,
        entity: 'platform_user',
        entity_id: userId,
        detail: { role: form.role, email: target.email },
      });
    } else {
      const active = change === 'reactivate';
      await deps.setStaffActive(userId, active);
      await deps.audit({
        action: active ? 'platform.staff.reactivated' : 'platform.staff.deactivated',
        actor_user_id: session.sub,
        entity: 'platform_user',
        entity_id: userId,
        detail: { email: target.email },
      });
    }

    redirect(res, `/platform/team?done=${change}`);
    return true;
  }

  // ---- an invited staff member sets up their account --------------------------
  // No session: they have no password yet. The one-time link IS the
  // permission, in place of the first-run PLATFORM_SETUP_TOKEN. The setup
  // itself is the same code the first owner went through (platform/setup.js):
  // a password AND a proven authenticator, then recovery codes.
  if (path === 'join' && (method === 'GET' || method === 'POST')) {
    const form = method === 'POST' ? await readFormBody(req) : {};
    const token = (method === 'POST' ? form.token : url.searchParams.get('token')) || '';
    const found = token ? await deps.findInvite?.(token) : null;
    const valid = checkInvite(found?.invite);
    const user = found?.user;

    if (!valid.ok || !user || user.is_active === false) {
      html(res, 400, problemPage({ title: 'This invitation cannot be used', message: valid.reason || INVITE_REFUSED }));
      return true;
    }

    if (method === 'GET') {
      const begun = beginSetup(user);
      if (!begun.ok) {
        html(res, 400, problemPage({ title: 'This invitation cannot be used', message: begun.reason }));
        return true;
      }
      html(res, 200, setupPage({
        token,
        email: user.email,
        secret: begun.secret,
        otpauth: begun.otpauth,
        action: '/platform/join',
      }));
      return true;
    }

    const result = await completeSetup(deps, {
      user,
      secret: form.secret,
      password: form.password,
      totp: form.totp,
    });
    if (!result.ok) {
      html(res, 400, setupPage({
        token,
        email: user.email,
        secret: form.secret,
        otpauth: '',
        error: result.reason,
        action: '/platform/join',
      }));
      return true;
    }

    await deps.markInviteUsed(found.invite.id);
    await deps.audit({ action: 'platform.staff.joined', actor_user_id: user.id, entity: 'platform_user', entity_id: user.id });
    html(res, 200, setupDonePage({ recoveryCodes: result.recoveryCodes, invited: true }));
    return true;
  }

  // ---- platform settings — every switch, read-only (§16, §40.1) --------------
  if (path === 'settings' && method === 'GET') {
    const session = requireSession(req, res);
    if (!session) return true;
    if (!(await may(deps, session, 'platform.manage'))) {
      forbid(res, 'You do not have permission to see the platform settings.');
      return true;
    }

    const readiness = provisioningReadiness();
    const env = process.env;
    // When the nightly job last ran — evidence, not the mere presence of its
    // secret (§45). 36 hours: one missed night is late, two is broken.
    const lastRun = (await deps.listAuditLog?.({ action: 'platform.cron.ran', limit: 1 }).catch(() => []))?.[0] || null;
    const ranRecently = Boolean(lastRun && Date.now() - new Date(lastRun.created_at).getTime() < 36 * 3_600_000);
    // NAMES AND STATES ONLY — never a value (settingsPage explains why).
    const switches = [
      {
        label: 'Creating new gyms',
        what: "Approving an application creates the gym's database and emails the owner.",
        name: 'PLATFORM_PROVISION_LIVE',
        on: readiness.live && readiness.ready,
        onText: 'ready',
        offText: readiness.live ? 'switched on, not set up' : 'off',
        warn: readiness.live && !readiness.ready,
        note: readiness.ready ? '' : readiness.problems.join(' '),
      },
      {
        label: 'Billing gyms',
        what: 'The nightly job charges each gym for its plan.',
        name: 'PLATFORM_BILLING_LIVE',
        on: env.PLATFORM_BILLING_LIVE === 'true',
        offText: 'off — nothing is charged',
      },
      {
        label: 'Card payments',
        what: "Paystack, for gym subscriptions — Yoyo Gyms' own account, never a gym's (D-108).",
        // The name platform/paystack.js reads. This line said PAYSTACK_SECRET_KEY,
        // so a key set by following it was never found (found 2026-09-30, §48).
        name: 'PLATFORM_PAYSTACK_SECRET_KEY',
        on: paystackConfigured(),
        onText: 'set',
        offText: 'not set',
      },
      {
        label: 'Email',
        what: 'Activation links, decisions, invitations and password resets.',
        name: 'BREVO_API_KEY',
        on: emailConfigured(),
        onText: 'set',
        offText: 'not set — links are shown on screen instead',
        warn: true,
      },
      {
        label: 'Nightly job',
        what: 'Billing, the drift report and document retention, every night.',
        name: 'PLATFORM_CRON_SECRET',
        on: Boolean(env.PLATFORM_CRON_SECRET) && ranRecently,
        onText: `ran ${lastRun ? new Date(lastRun.created_at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''}`,
        offText: !env.PLATFORM_CRON_SECRET
          ? 'not set — the nightly job cannot run'
          : lastRun
            ? `last ran ${new Date(lastRun.created_at).toISOString().slice(0, 16).replace('T', ' ')} UTC — overdue`
            : 'set, but has not run yet — it runs with the 06:00 daily job',
        warn: true,
      },
      {
        // The stricter limits on sign-in, registration and documents count
        // across every server instance only with a shared store (CLAUDE.md
        // §46.1 Q2). Without it they still work, per instance.
        label: 'Shared rate limits',
        what: 'Sign-in, registration and document limits, counted across every server.',
        name: 'UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN',
        on: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
        onText: 'set',
        offText: 'not set — limits count on each server separately',
        warn: true,
      },
      {
        label: 'Deleting old documents',
        what: "A rejected applicant's identity documents are deleted after the retention period.",
        name: 'PLATFORM_RETENTION_LIVE',
        on: env.PLATFORM_RETENTION_LIVE === 'true',
        offText: 'off — reported, not deleted',
      },
      {
        label: 'Privacy policy',
        what: 'Shown as a draft until approved.',
        name: 'PLATFORM_PRIVACY_APPROVED',
        on: env.PLATFORM_PRIVACY_APPROVED === 'true',
        onText: 'approved',
        offText: 'draft',
      },
      {
        label: 'Privacy contact',
        what: 'Where people write about their data.',
        name: 'PLATFORM_PRIVACY_CONTACT',
        on: Boolean(env.PLATFORM_PRIVACY_CONTACT),
        onText: 'set',
        offText: 'not set',
      },
      {
        label: 'Gym Owner Agreement',
        what: 'Shown as a draft until approved.',
        name: 'PLATFORM_TERMS_APPROVED',
        on: termsApproved(),
        onText: 'approved',
        offText: 'draft',
      },
      {
        label: 'First-run setup link',
        what: 'Only ever needed once, to claim the first account.',
        name: 'PLATFORM_SETUP_TOKEN',
        on: !env.PLATFORM_SETUP_TOKEN,
        onText: 'removed',
        offText: 'still set — remove it',
        warn: true,
      },
    ];

    html(res, 200, settingsPage({
      switches,
      baseUrl: platformBaseUrl(),
      support: (await deps.getSupportContacts?.().catch(() => null)) || null,
      saved: url.searchParams.get('saved') === 'support',
      csrfToken: issueCsrfToken(session.sub),
      user: await viewer(deps, session),
    }));
    return true;
  }

  // ---- one gym's own services, on top of its plan (CLAUDE.md §41.1 Q2) ------
  const gymServices = /^registry\/([A-Za-z0-9-]+)\/services$/.exec(path);
  if (gymServices && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;
    // What a gym gets for its money: the same permission as its plan.
    if (!(await may(deps, session, 'subscription.manage'))) {
      forbid(res, "You do not have permission to change a gym's services.");
      return true;
    }
    // Each switchable service arrives as plan / add / remove.
    const added = ALL_SERVICES.filter((f) => form[`svc_${f}`] === 'add');
    const removed = ALL_SERVICES.filter((f) => form[`svc_${f}`] === 'remove');
    await deps.setGymServices(gymServices[1], { added, removed });
    await deps.audit({
      action: 'platform.gym.services_changed',
      actor_user_id: session.sub,
      entity: 'gym',
      entity_id: gymServices[1],
      detail: { added, removed },
    });
    redirect(res, `/platform/registry/${gymServices[1]}?sent=services`);
    return true;
  }

  // ---- a gym's named Yoyo contact (§41.1 Q6) --------------------------------
  const manager = /^registry\/([A-Za-z0-9-]+)\/account-manager$/.exec(path);
  if (manager && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;
    if (!(await may(deps, session, 'platform.manage'))) {
      forbid(res, 'You do not have permission to assign account managers.');
      return true;
    }
    try {
      await deps.setAccountManager(manager[1], (form.staff_id || '').trim() || null);
    } catch (err) {
      html(res, 400, problemPage({
        title: 'That was not saved',
        message: err.message,
        back: { href: `/platform/registry/${manager[1]}`, label: 'Back to the gym' },
        user: await viewer(deps, session),
      }));
      return true;
    }
    await deps.audit({
      action: 'platform.gym.account_manager_set',
      actor_user_id: session.sub,
      entity: 'gym',
      entity_id: manager[1],
      detail: { staff_id: form.staff_id || null },
    });
    redirect(res, `/platform/registry/${manager[1]}?sent=manager`);
    return true;
  }

  // ---- setup help given (§41.1 Q6) -----------------------------------------
  const setupDone = /^registry\/([A-Za-z0-9-]+)\/setup-done$/.exec(path);
  if (setupDone && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;
    if (!(await may(deps, session, 'application.approve'))) {
      forbid(res, 'You do not have permission to record setup help.');
      return true;
    }
    await deps.markSetupDone(setupDone[1]);
    await deps.audit({ action: 'platform.gym.setup_help_given', actor_user_id: session.sub, entity: 'gym', entity_id: setupDone[1] });
    redirect(res, `/platform/registry/${setupDone[1]}?sent=setup`);
    return true;
  }

  // ---- the owner asks for setup help (§41.1 Q6) ------------------------------
  if (path === 'my-gym/setup-help' && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;
    try {
      await deps.requestSetupHelp(session.sub);
    } catch (err) {
      html(res, 400, problemPage({ title: 'We could not record that', message: err.message, back: { href: '/platform/my-gym', label: 'Back to your gym' } }));
      return true;
    }
    redirect(res, '/platform/my-gym');
    return true;
  }

  // ---- Yoyo's support contacts (§41.1 Q7) -----------------------------------
  if (path === 'settings/support' && method === 'POST') {
    const form = await readFormBody(req);
    const session = requireSession(req, res, { csrfToken: form.csrf });
    if (!session) return true;
    if (!(await may(deps, session, 'platform.manage'))) {
      forbid(res, 'You do not have permission to change the platform settings.');
      return true;
    }
    const saved = await deps.saveSupportContacts({ email: form.email, whatsapp: form.whatsapp }, session.sub);
    await deps.audit({ action: 'platform.settings.support_changed', actor_user_id: session.sub, entity: 'settings', entity_id: 'support', detail: saved });
    redirect(res, '/platform/settings?saved=support');
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

    // Accounts whose owner asked to close them 30 days ago (CLAUDE.md §46.1
    // Q3). The stores' promise — "finished within 30 days" — holds even when
    // nobody at Yoyo acts on it. A failure must not lose the results above.
    let closures = null;
    try {
      closures = (await deps.closeDueAccounts?.({ now: new Date() })) ?? null;
      for (const id of closures?.closed || []) {
        await deps.audit({
          action: 'platform.owner.closed',
          actor_kind: 'system',
          entity: 'platform_user',
          entity_id: id,
          detail: { by: 'nightly job', after_days: 30 },
        });
      }
    } catch (err) {
      closures = { ok: false, error: err?.message || 'Closing accounts failed.' };
    }

    // Recorded — counts only — so the Settings page can say when it last ran
    // instead of only that its secret exists (§45).
    await deps.audit({
      action: 'platform.cron.ran',
      actor_kind: 'system',
      detail: {
        billing_live: !dryRun,
        retention_live: process.env.PLATFORM_RETENTION_LIVE === 'true',
        drift_ok: drift?.ok !== false,
        retention_ok: retention?.ok !== false,
        closures_ok: closures?.ok !== false,
        accounts_closed: closures?.closed?.length ?? 0,
      },
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ...report, drift, retention, closures }));
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
