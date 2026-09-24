// Platform screens — server-rendered HTML.
//
// No build step, no second Vite config, no React. This is an internal panel for
// one or two people, and the pattern is the one already proven next door in
// Telga, whose app is a shell around server-rendered screens.
//
//   >>> EVERY VALUE THAT CAME FROM A HUMAN GOES THROUGH escapeHtml. <<<
//
// These pages display text a stranger typed — gym names, document filenames,
// rejection reasons. Escaping is the entire security story for this file, which
// is why the tests are mostly about that rather than about layout. Staff input
// is escaped too: a reviewer is still a person typing into a box.
//
// Styling is deliberately inline and minimal. It cannot import the gym app's
// components (D-081 forbids cross-imports), and duplicating a design system for
// an internal panel would be work with no return.

import { when, exact, until, money as fmtMoney, count } from './format.js';
import { pageLink } from './paging.js';
import { gymAdminPath, OWNER_USERNAME } from './gym-admin.js';

/** Escape text for safe interpolation into markup or an attribute. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shorthand used throughout: `h` is "escaped". */
const h = escapeHtml;

const STYLE = `
  :root { color-scheme: light dark; --ink:#111; --muted:#666; --line:#e5e5e5; --accent:#E63946; --bg:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#eee; --muted:#999; --line:#2a2a2a; --bg:#0d0d0d; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { border-bottom:1px solid var(--line); padding:14px 20px; display:flex;
           justify-content:space-between; align-items:center; gap:16px; }
  header b { letter-spacing:.06em; text-transform:uppercase; font-size:13px; }
  main { max-width:900px; margin:0 auto; padding:24px 20px 64px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .muted { color:var(--muted); font-size:13px; }
  table { width:100%; border-collapse:collapse; margin-top:16px; }
  th, td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--line); }
  th { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  a { color:var(--accent); }
  .empty { border:1px dashed var(--line); border-radius:8px; padding:40px 20px;
           text-align:center; color:var(--muted); margin-top:16px; }
  .tag { font-size:12px; padding:2px 8px; border:1px solid var(--line); border-radius:99px; }
  form.card { border:1px solid var(--line); border-radius:8px; padding:20px; max-width:360px;
              margin:64px auto; display:grid; gap:12px; }
  label { font-size:13px; color:var(--muted); display:grid; gap:4px; }
  input, textarea { font:inherit; padding:9px 10px; border:1px solid var(--line);
                    border-radius:6px; background:transparent; color:inherit; width:100%; }
  button { font:inherit; padding:9px 14px; border:0; border-radius:6px;
           background:var(--accent); color:#fff; cursor:pointer; }
  .err { color:var(--accent); font-size:13px; }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  ul.events { list-style:none; padding:0; margin:12px 0 0; }
  ul.events li { border-left:2px solid var(--line); padding:6px 0 6px 12px; margin-bottom:6px; }
`;

/**
 * The page shell.
 *
 * `body` is inserted as-is: it is markup the caller has already built and
 * escaped. `title` is escaped, because it can carry a gym name.
 */
export function layout({ title = 'Yoyo Gyms', body = '', user = null, indexable = false }) {
  // noindex is right for the staff panel and WRONG for the two public pages.
  // A signup page nobody can find is a signup page nobody uses, so `indexable`
  // is opt-in per page rather than a blanket rule.
  const robots = indexable ? 'index,follow' : 'noindex,nofollow';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${robots}">
<title>${h(title)} · Yoyo Gyms</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <b>Yoyo Gyms</b>
  ${
    user
      ? `<nav class="row">
    <a href="/platform/home">Today</a>
    <a href="/platform/applications">Applications</a>
    <a href="/platform/registry">Gyms</a>
    <a href="/platform/owners">Owners</a>
    <a href="/platform/plans">Plans</a>
    <a href="/platform/finance">Finances</a>
    <a href="/platform/security">Security</a>
    <a href="/platform/audit">Audit</a>
    <a href="/platform/account">Account</a>
  </nav>`
      : ''
  }
  <span class="muted">${user ? h(user.email) : ''}</span>
</header>
<main>
${body}
</main>
</body>
</html>`;
}

/** Sign-in. Password and the second factor together — 2FA is not optional here. */
export function loginPage({ error = '' } = {}) {
  return layout({
    title: 'Sign in',
    body: `
<form class="card" method="post" action="/platform/login">
  <h1>Sign in</h1>
  <p class="muted">For gym owners and Yoyo Gyms staff. Gym members sign in at their gym —
  <a href="/platform/find">find your gym</a>.</p>
  ${error ? `<p class="err">${h(error)}</p>` : ''}
  <label>Email
    <input type="email" name="email" autocomplete="username" required>
  </label>
  <label>Password
    <input type="password" name="password" autocomplete="current-password" required>
  </label>
  <label>Authentication code <span class="muted">(if you have set one up)</span>
    <input type="text" name="totp" inputmode="numeric" autocomplete="one-time-code"
           placeholder="6 digits">
  </label>
  <button type="submit">Sign in</button>
  <p><a href="/platform/forgot">Forgot your password?</a></p>
  <p class="muted">Lost your device? Use a recovery code in place of the authentication code.</p>
  <p class="muted"><a href="/platform/privacy">Privacy policy</a> · <a href="/platform/delete-account">Delete your account</a></p>
</form>`,
  });
  // The code field used to be `required`. Two-factor is REQUIRED for Yoyo
  // staff but OPTIONAL for gym owners (D-119), so an owner without it could
  // not submit the form until they typed something meaningless into a box
  // they had never been given. Staff without a code are still refused — by
  // the server, which is where that rule belongs. `pattern` went with it: a
  // recovery code is not all digits.
}

/** "I forgot my password." The same answer whether or not the account exists. */
export function forgotPage({ message = '', error = '' } = {}) {
  return layout({
    title: 'Reset your password',
    body: `
<form class="card" method="post" action="/platform/forgot">
  <h1>Reset your password</h1>
  ${message ? `<p>${h(message)}</p>` : `<p class="muted">Enter the email you sign in with. We will send a link to choose a new password.</p>`}
  ${error ? `<p class="err">${h(error)}</p>` : ''}
  <label>Email
    <input type="email" name="email" autocomplete="username" required>
  </label>
  <button type="submit">Send the link</button>
  <p><a href="/platform/login">Back to sign in</a></p>
</form>`,
  });
}

/** Choose a new password, from the emailed link. */
export function resetPage({ token = '', error = '' } = {}) {
  return layout({
    title: 'Choose a new password',
    body: `
<form class="card" method="post" action="/platform/reset">
  <h1>Choose a new password</h1>
  ${error ? `<p class="err">${h(error)}</p>` : ''}
  <input type="hidden" name="token" value="${h(token)}">
  <label>New password
    <input type="password" name="password" autocomplete="new-password" minlength="10" required>
  </label>
  <p class="muted">At least 10 characters. If you own a gym, this also becomes your sign-in for its admin panel.</p>
  <button type="submit">Save password</button>
</form>`,
  });
}

/** Done. Says plainly what changed, and where to go next. */
export function resetDonePage({ gymAccountsUpdated = 0 } = {}) {
  return layout({
    title: 'Password changed',
    body: `
<div class="card">
  <h1>Password changed</h1>
  <p>You can sign in with your new password now.</p>
  ${gymAccountsUpdated ? '<p class="muted">Your gym\'s admin panel uses the new password too — sign in there as <b>owner</b>.</p>' : ''}
  <p><a href="/platform/login">Sign in</a></p>
</div>`,
  });
}

const statusTag = (status) => `<span class="tag">${h(status)}</span>`;

/** The review queue. */
export function applicationsPage({ applications = [], user = null } = {}) {
  const body = applications.length
    ? `<table>
  <thead><tr><th>Gym</th><th>City</th><th>Status</th><th>Submitted</th></tr></thead>
  <tbody>
${applications
  .map(
    (a) => `    <tr>
      <td><a href="/platform/applications/${h(a.id)}">${h(a.proposed_gym_name || 'Unnamed')}</a></td>
      <td>${h(a.city)}</td>
      <td>${statusTag(a.status)}</td>
      <td class="muted">${h(when(a.submitted_at))}</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">No applications waiting for review.</div>`;

  return layout({
    title: 'Applications',
    user,
    body: `<h1>Applications</h1>
<p class="muted">Every gym is reviewed by a person before it appears in app search.</p>
${body}`,
  });
}

/** One application: documents, history, and the decision. */
export function applicationDetailPage({ application, documents = [], events = [], user = null, csrfToken = '' }) {
  const docs = documents.length
    ? `<table>
  <thead><tr><th>Document</th><th>File</th><th>Status</th><th>Decide</th></tr></thead>
  <tbody>
${documents
  .map(
    (d) => `    <tr>
      <td>${h(d.doc_type)}</td>
      <td><a href="/platform/documents/${h(d.id)}" target="_blank" rel="noopener">${h(d.filename || 'open')}</a></td>
      <td>${statusTag(d.status)}${d.reject_reason ? `<br><span class="muted">${h(d.reject_reason)}</span>` : ''}</td>
      <td>${
        d.status === 'pending'
          ? `<form method="post" action="/platform/documents/${h(d.id)}/decide" class="row">
        <input type="hidden" name="csrf" value="${h(csrfToken)}">
        <button type="submit" name="action" value="accept">Accept</button>
        <input name="reason" placeholder="Reason, if rejecting">
        <button type="submit" name="action" value="reject">Reject</button>
      </form>`
          : '<span class="muted">decided</span>'
      }</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>
<p class="muted">Opening a document is recorded in the audit log: who opened it, and when.</p>`
    : `<div class="empty">No documents uploaded.</div>`;

  const history = events.length
    ? `<ul class="events">
${events
  .map(
    (e) => `  <li><b>${h(e.event)}</b> <span class="muted">${h(exact(e.created_at))}</span>${
      e.reason ? `<br>${h(e.reason)}` : ''
    }</li>`
  )
  .join('\n')}
</ul>`
    : `<p class="muted">No history yet.</p>`;

  const decided = ['approved', 'rejected'].includes(application.status);

  return layout({
    title: application.proposed_gym_name || 'Application',
    user,
    body: `<h1>${h(application.proposed_gym_name || 'Application')}</h1>
<p class="row"><span class="muted">${h(application.city)} ${h(application.country)}</span> ${statusTag(application.status)}</p>
${application.decision_reason ? `<p class="muted">Reason: ${h(application.decision_reason)}</p>` : ''}

<h2>Documents</h2>
${docs}

<h2>History</h2>
${history}

${
  decided
    ? `<p class="muted">This application has been decided. Decisions are final; the owner may submit a new application.</p>`
    : `<h2>Decision</h2>
<form class="card" method="post" action="/platform/applications/${h(application.id)}/decide">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <label>Reason or message
    <textarea name="reason" rows="3"></textarea>
  </label>
  <div class="row">
    <button type="submit" name="action" value="approve">Approve and provision</button>
    <button type="submit" name="action" value="request_info">Request information</button>
    <button type="submit" name="action" value="reject">Reject</button>
  </div>
  <p class="muted">Approving creates this gym's database. Rejecting requires a reason.</p>
</form>`
}`,
  });
}

// ---------------------------------------------------------------------------
// Public: gym-owner application
// ---------------------------------------------------------------------------

/**
 * The plan chooser, written for a GYM OWNER.
 *
 * Leads with what their MEMBERS can do, because that is what an owner is
 * buying — not a list of admin screens. Prices come from the database and are
 * shown only when set; "Contact us" is honest while they are not.
 */
function planCard(plan, { selected = false } = {}) {
  const price = plan.price
    ? `R${(plan.price / 100).toFixed(0)}<span class="muted"> / month</span>`
    : '<span class="muted">Contact us</span>';

  return `
<label class="plan${selected ? ' plan-selected' : ''}">
  <input type="radio" name="plan" value="${h(plan.key)}"${selected ? ' checked' : ''} required>
  <div class="plan-head">
    <b>${h(plan.label)}</b>
    <span class="plan-price">${price}</span>
  </div>
  <p class="muted">${h(plan.summary)}</p>
  <p class="plan-limit">${h(plan.memberLimit)}</p>

  <p class="plan-sub">What your members can do</p>
  <ul>${plan.memberBenefits.map((b) => `<li>${h(b)}</li>`).join('')}</ul>

  <p class="plan-sub">What you get</p>
  <ul>${plan.included.map((f) => `<li>${h(f)}</li>`).join('')}</ul>

  ${
    plan.nextPlanAdds.length
      ? `<p class="muted plan-next">The next plan adds: ${plan.nextPlanAdds.map((f) => h(f)).join(', ')}.</p>`
      : `<p class="muted plan-next">This is the complete system.</p>`
  }
</label>`;
}

const SIGNUP_STYLE = `
  .plans { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); margin:16px 0 24px; }
  .plan { border:1px solid var(--line); border-radius:10px; padding:16px; cursor:pointer; display:block; }
  .plan:has(input:checked) { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
  .plan-head { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
  .plan-price { font-weight:600; }
  .plan-limit { font-size:13px; margin:6px 0 10px; }
  .plan-sub { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin:12px 0 4px; }
  .plan ul { margin:0; padding-left:18px; font-size:13px; }
  .plan-next { margin-top:12px; font-size:12px; }
  form.wide { max-width:820px; margin:0 auto; display:grid; gap:14px; }
  .two { display:grid; gap:12px; grid-template-columns:1fr 1fr; }
  @media (max-width:560px){ .two { grid-template-columns:1fr; } }
`;

export function signupPage({ plans = [], values = {}, error = '', selectedPlan = '' } = {}) {
  return layout({
    title: 'List your gym',
    indexable: true,   // the front door — it must be findable
    body: `<style>${SIGNUP_STYLE}</style>
<h1>List your gym on Yoyo Gyms</h1>
<p class="muted">Tell us about your gym and choose a plan. We review every application by hand,
so your members only ever find real gyms.</p>
${error ? `<p class="err">${h(error)}</p>` : ''}

<form class="wide" method="post" action="/platform/apply">
  <div class="two">
    <label>Your name
      <input name="owner_name" required value="${h(values.owner_name)}">
    </label>
    <label>Your email
      <input type="email" name="email" required autocomplete="email" value="${h(values.email)}">
    </label>
  </div>

  <label>Choose a password
    <input type="password" name="password" required minlength="10" autocomplete="new-password">
    <span class="muted">At least 10 characters. You will use it to follow your application and upload your documents.</span>
  </label>

  <div class="two">
    <label>Gym name
      <input name="gym_name" required value="${h(values.gym_name)}">
      <span class="muted">This is the name your members will search for.</span>
    </label>
    <label>City
      <input name="city" required value="${h(values.city)}">
    </label>
  </div>

  <div class="two">
    <label>Country
      <input name="country" maxlength="2" placeholder="ZA" required value="${h(values.country)}">
    </label>
    <label>Roughly how many members?
      <input type="number" name="estimated_members" min="0" value="${h(values.estimated_members)}">
    </label>
  </div>

  <h2>Choose your plan</h2>
  <div class="plans">
    ${plans.map((p) => planCard(p, { selected: selectedPlan === p.key })).join('')}
  </div>

  <label>Is there anything your gym needs that this does not do?
    <textarea name="needs" rows="3" placeholder="Optional — but it genuinely shapes what we build next."></textarea>
  </label>

  <button type="submit">Submit application</button>
  <p class="muted">We will ask for your business registration, ID, proof of premises and tax
  clearance before approving. Nothing is charged until your gym is live.</p>
</form>`,
  });
}

export function signupSuccessPage({ gymName = '' } = {}) {
  return layout({
    title: 'Application received',
    body: `<h1>Application received</h1>
<p>Thank you — we have your application for <b>${h(gymName)}</b>.</p>

<div class="card">
  <h2>What happens next</h2>
  <ol>
    <li><b>Upload your documents now.</b> <a href="/platform/login">Sign in</a> with your email and the
    password you just chose, and open <b>Your gym</b>. We need your business registration, your ID,
    proof of your premises and tax clearance.</li>
    <li><b>A person reviews it.</b> It is not instant. We email you with the decision.</li>
    <li><b>Once approved,</b> you receive an activation link and a code. Using them opens your gym,
    and gives you your own gym admin panel.</li>
  </ol>
</div>
<p class="muted">Your gym will not appear in member search until it is approved and live.</p>`,
  });
}

// ---------------------------------------------------------------------------
// The gym registry — every gym the platform has provisioned
// ---------------------------------------------------------------------------

/**
 * The registry list.
 *
 * Deliberately shows gym METADATA only: name, city, plan, status, subscription
 * state. Never a member, never a schema name, never a connection. Support staff
 * need to see that a gym is broken without being able to read anybody's
 * personal data (D-044), and the way to guarantee that is not to render it.
 */
/**
 * Where you are in a long list, and how to move.
 *
 * Always rendered — even on a single page — because "Showing 1–7 of 7" is the
 * sentence that tells a reader the list is COMPLETE. Silence does not say
 * that; silence is what a truncated list also looks like.
 *
 * `params` are the filters in force. They are carried into every link, because
 * losing a search when you turn a page is the single most irritating thing a
 * paginated list can do.
 */
function pager(page, basePath, params = {}) {
  if (!page) return '';

  const prev = page.hasPrev
    ? `<a href="${h(pageLink(basePath, params, page.page - 1))}">← Previous</a>`
    : '<span class="muted">← Previous</span>';

  const next = page.hasNext
    ? `<a href="${h(pageLink(basePath, params, page.page + 1))}">Next →</a>`
    : '<span class="muted">Next →</span>';

  // One page and nothing to turn to: the count alone, with no dead controls.
  // A link that goes nowhere is the "dead text" this panel is meant not to
  // have.
  if (!page.hasPrev && !page.hasNext) {
    return `<p class="muted">${h(page.label)}</p>`;
  }

  return `<p class="muted" style="display:flex;gap:1rem;align-items:center">
  ${prev}<span>${h(page.label)}</span>${next}
</p>`;
}

export function registryPage({ gyms = [], user = null, canSuspend = false, filter = {}, page = null } = {}) {
  const body = gyms.length
    ? `<table>
  <thead><tr><th>Gym</th><th>City</th><th>Plan</th><th>Status</th><th>Billing</th></tr></thead>
  <tbody>
${gyms
  .map(
    (g) => `    <tr>
      <td><a href="/platform/registry/${h(g.id)}">${h(g.search_name || g.slug)}</a></td>
      <td>${h(g.city)}</td>
      <td>${h(g.plan_key || '—')}</td>
      <td>${statusTag(g.status)}</td>
      <td>${statusTag(g.subscription_status || 'none')}</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">No gyms have been provisioned yet.</div>`;

  return layout({
    title: 'Gyms',
    user,
    body: `<h1>Gyms</h1>
<p class="muted">${
      page && page.total !== null
        ? `${h(count(page.total, 'gym'))} on the platform.`
        : `${h(count(gyms.length, 'gym'))} shown.`
    }${canSuspend ? '' : ' You have read-only access.'}</p>
<p><a href="/platform/reconcile">Check for drift →</a></p>

<form class="card row" method="get" action="/platform/registry">
  <label>Search<input name="q" value="${h(filter.query)}" placeholder="gym name or slug"></label>
  <label>Status
    <select name="status">
      <option value="">Any</option>
      ${['pending', 'active', 'suspended', 'cancelled']
        .map((v) => `<option value="${v}"${filter.status === v ? ' selected' : ''}>${v}</option>`)
        .join('')}
    </select>
  </label>
  <button type="submit">Search</button>
</form>
${body}
${pager(page, '/platform/registry', { q: filter.query, status: filter.status })}`,
  });
}

/** One gym: what it is, what it pays, and the two buttons that change that. */
export function gymDetailPage({
  gym,
  subscription = null,
  invoices = [],
  user = null,
  csrfToken = '',
  canSuspend = false,
  canBill = false,
  plans = [],
  stats = null,
}) {
  const suspended = gym.status === 'suspended';

  // The control is rendered only for someone who may use it. Hiding a button
  // is not the security boundary — the router checks the permission again —
  // but offering a control that will be refused is its own kind of lie.
  const controls = canSuspend
    ? `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/${
        suspended ? 'reactivate' : 'suspend'
      }">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>${suspended ? 'Reactivate this gym' : 'Suspend this gym'}</h2>
  <p class="muted">${
    suspended
      ? 'Members and staff will be able to sign in again immediately.'
      : 'Members and staff will be locked out until it is reactivated. <b>No data is deleted.</b>'
  }</p>
  <label>Reason<input name="reason" placeholder="Why?" ${suspended ? '' : 'required'}></label>
  <button type="submit">${suspended ? 'Reactivate' : 'Suspend'}</button>
</form>`
    : '';

  const bills = invoices.length
    ? `<table>
  <thead><tr><th>Invoice</th><th>Amount</th><th>Status</th><th>Issued</th></tr></thead>
  <tbody>
${invoices
  .map(
    (i) => `    <tr><td>${h(i.number)}</td><td>${fmtMoney(i.amount_cents, i.currency)}</td>
      <td>${statusTag(i.status)}</td><td class="muted">${h(when(i.issued_at))}</td></tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">No invoices yet.</div>`;

  return layout({
    title: gym.search_name || gym.slug,
    user,
    body: `<p><a href="/platform/registry">← All gyms</a></p>
<h1>${h(gym.search_name || gym.slug)}</h1>
<p class="muted">${h(gym.city)}${gym.country ? `, ${h(gym.country)}` : ''} · ${statusTag(gym.status)}</p>

${
  stats
    ? `<div class="card">
  <h2>Activity</h2>
  ${
    stats.reachable
      ? `<table><tbody>
    <tr><td class="muted">Active members</td><td><b>${h(stats.activeMembers ?? '—')}</b></td></tr>
    <tr><td class="muted">Check-ins this month</td><td>${h(stats.checkinsThisMonth ?? '—')}</td></tr>
    <tr><td class="muted">Last check-in</td><td>${h(stats.lastActivityAt) || '<span class="muted">none yet</span>'}</td></tr>
  </tbody></table>
  <p class="muted"><b>Counts only.</b> The platform never reads a member's name, phone,
  ID or health answers — only how many there are. Every one of these reads is
  written to the audit log with your name on it.</p>`
      : `<p class="muted">⚠️ This gym's data could not be reached, so there are no counts.
         That is worth looking into — it usually means the gym is not serving traffic either.</p>`
  }
</div>`
    : ''
}

<div class="card">
  <h2>Subscription</h2>
  ${
    subscription
      ? `<p>${statusTag(subscription.status)} on <b>${h(gym.plan_key || '—')}</b></p>
  <p class="muted">Trial ends ${h(subscription.trial_ends_at) || '—'} · Period ends ${
          h(subscription.current_period_end) || '—'
        }</p>`
      : `<p class="muted">No subscription record.</p>`
  }
</div>

${
  canBill && plans.length
    ? `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/plan">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Move to another plan</h2>
  <label>Plan
    <select name="plan_key">
      ${plans
        .map(
          (p) => `<option value="${h(p.key)}"${p.key === gym.plan_key ? ' selected' : ''}>${h(p.label)}</option>`
        )
        .join('')}
    </select>
  </label>
  <p class="muted"><b>A downgrade never deletes members.</b> Existing members stay; only new
  registrations stop once the gym is over the new plan's limit. The change applies from the next
  billing date — nobody is re-billed for this month.</p>
  <button type="submit">Change plan</button>
</form>`
    : ''
}

<h2>Invoices</h2>
${bills}

${controls}`,
  });
}

/** Cents to something a person reads. Never rounds silently to a whole rand. */
function money(cents, currency = 'ZAR') {
  if (!Number.isFinite(Number(cents))) return '—';
  return `${h(currency)} ${(Number(cents) / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Public: how a member finds their gym
// ---------------------------------------------------------------------------

/**
 * The member-facing gym finder (D-036).
 *
 * This is the one platform page a member ever sees. It is a thin shell over
 * GET /platform/gyms, which returns only public metadata — so even a bug here
 * cannot leak one gym's data to another gym's member.
 *
 * Location is OPTIONAL and asked for, never taken. A member who declines still
 * gets a working search by name, because "allow location" is a question many
 * people answer no to, and the answer must not break the product.
 */
export function finderPage() {
  return layout({
    title: 'Find your gym',
    indexable: true,
    body: `<h1>Find your gym</h1>
<p class="muted">Search by name, or use your location to see the closest gyms first.</p>

<form class="card" id="finder" onsubmit="return false">
  <label>Gym name<input id="q" name="q" placeholder="e.g. BOS GYM" autocomplete="off"></label>
  <button type="button" id="near">Use my location</button>
  <p class="muted" id="note"></p>
</form>

<div id="results"><div class="empty">Start typing to search.</div></div>

<script>
(function () {
  var q = document.getElementById('q');
  var out = document.getElementById('results');
  var note = document.getElementById('note');
  var coords = null;
  var timer = null;

  // Escaped here as well as on the server: this inserts a gym's name into the
  // page, and a gym name is text somebody typed.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(gyms) {
    if (!gyms.length) {
      out.innerHTML = '<div class="empty">No gyms found. Ask your gym if they are on Yoyo Gyms yet.</div>';
      return;
    }
    out.innerHTML = gyms.map(function (g) {
      var where = [g.city, g.country].filter(Boolean).map(esc).join(', ');
      var far = g.distance_km == null ? '' : ' · ' + esc(g.distance_km) + ' km away';
      return '<a class="card block" href="/g/' + encodeURIComponent(g.slug) + '">' +
        '<b>' + esc(g.name) + '</b><br><span class="muted">' + where + far + '</span></a>';
    }).join('');
  }

  function search() {
    var params = new URLSearchParams();
    if (q.value.trim()) params.set('q', q.value.trim());
    if (coords) { params.set('lat', coords.lat); params.set('lng', coords.lng); }
    if (!params.toString()) return;

    fetch('/platform/gyms?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (d) { render(d.gyms || []); })
      .catch(function () { out.innerHTML = '<div class="empty">Could not search just now.</div>'; });
  }

  // Debounced: one request per pause in typing, not one per keystroke.
  q.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(search, 250);
  });

  document.getElementById('near').addEventListener('click', function () {
    if (!navigator.geolocation) { note.textContent = 'Your browser cannot share a location.'; return; }
    note.textContent = 'Asking for your location…';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        coords = { lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) };
        note.textContent = 'Showing the closest gyms first.';
        search();
      },
      function () {
        // Declining is a normal answer, not an error to complain about.
        note.textContent = 'No problem — search by name instead.';
      }
    );
  });
})();
</script>`,
  });
}

/**
 * The drift report, on demand.
 *
 * Findings are written as plain sentences rather than a table of codes,
 * because the person reading this is deciding whether to touch a database by
 * hand, and "gym_ghost" on its own tells them nothing about what is at stake.
 */
export function driftPage({ report, user = null, csrfToken = '' }) {
  const list = (items, render) =>
    items.length ? `<ul>${items.map(render).join('')}</ul>` : '<div class="empty">None.</div>';

  return layout({
    title: 'Drift report',
    user,
    body: `<p><a href="/platform/registry">← All gyms</a></p>
<h1>Drift report</h1>
<p class="muted">Compares the schemas that exist against the gyms the registry knows about.
This report <b>never changes anything</b>.</p>

${report ? `<p>${report.ok ? '✅ Nothing is out of step.' : '⚠️ Findings below.'}
  Checked ${h(report.checkedSchemas)} gym schemas.</p>

<h2>Schemas no gym owns</h2>
${list(report.orphans || [], (o) => `<li><b>${h(o.schema_name)}</b> — ${h(o.risk)}<br>
  <span class="muted">${h(o.likely_cause)}. ${h(o.next_step)}</span></li>`)}

<h2>Gyms whose schema is missing</h2>
${list(report.dangling || [], (d) => `<li><b>${h(d.gym_id)}</b> → ${h(d.schema_name)}<br>
  <span class="muted">${h(d.impact)}</span></li>`)}` : ''}

<form class="card" method="post" action="/platform/reconcile">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <button type="submit">Run the check again</button>
</form>`,
  });
}

// ---------------------------------------------------------------------------
// Owner activation
// ---------------------------------------------------------------------------

/**
 * The activation form.
 *
 * The token arrives in the URL and is carried in a hidden field. The code is
 * typed, because the whole purpose of the second half is that it is not in the
 * link — putting it in the URL too would make it decoration.
 */
export function activatePage({ token = '', gymName = '', error = '', code = '' } = {}) {
  return layout({
    title: 'Activate your account',
    body: `<h1>Activate your account</h1>
<p class="muted">${
      gymName
        ? `Your gym <b>${h(gymName)}</b> has been approved.`
        : 'Your gym has been approved.'
    } Enter the six-digit code from your email and choose a password.</p>
${error ? `<p class="err">${h(error)}</p>` : ''}

<form class="card" method="post" action="/platform/activate">
  <input type="hidden" name="token" value="${h(token)}">
  <label>Six-digit code
    <input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required
           autocomplete="one-time-code" value="${h(code)}">
  </label>
  <label>Choose a password
    <input type="password" name="password" required minlength="10" autocomplete="new-password">
  </label>
  <p class="muted">At least 10 characters. You will use this to sign in from now on.</p>
  <button type="submit">Activate</button>
</form>`,
  });
}

/** Activation done. Says plainly what is true, including what is not yet true. */
export function activateSuccessPage({ gymActivated = false, gymSlug = '', gymUsername = '' } = {}) {
  // THE TWO ACCOUNTS, SAID PLAINLY.
  //
  // An owner now has a platform login (their email — billing, documents, the
  // subscription) and a gym login (a username — members, check-ins, classes).
  // Two logins nobody explained is two support emails, so this page names
  // both, here, at the one moment the owner is looking.
  const gymLogin =
    gymActivated && gymSlug && gymUsername
      ? `<div class="card">
  <h2>Running your gym</h2>
  <p>Your gym's own panel is where you add members, take check-ins and record payments.</p>
  <p>Sign in there as <b>${h(gymUsername)}</b>, with the same password you just chose.</p>
  <p><a href="${h(gymAdminPath(gymSlug))}">Open your gym admin panel →</a></p>
  <p class="muted">You can change that password, and add staff, from Settings inside the panel.</p>
</div>`
      : '';

  return layout({
    title: 'Account activated',
    body: `<div class="card">
  <h1>Your account is active</h1>
  <p>You can now sign in with your email and the password you just chose.</p>
  ${
    gymActivated
      ? `<p><b>Your gym is open.</b> Your members can find it and sign in from now on.</p>
         <p class="muted">Your free trial has started. We will email you before it ends.</p>`
      : `<p class="muted">Your gym is not open to members yet. We will email you when it is.</p>`
  }
  <p><a href="/platform/login">Sign in →</a></p>
</div>
${gymLogin}`,
  });
}

// ---------------------------------------------------------------------------
// The gym owner's own page
// ---------------------------------------------------------------------------

/**
 * What a gym owner sees after signing in to the PLATFORM.
 *
 * This is deliberately NOT where they run their gym. Members, check-ins,
 * payments and classes all live in their own gym admin panel, which is the
 * existing single-gym system and is untouched by any of this (§32). This page
 * is only the things that are between the owner and Yoyo Gyms: the
 * application, the documents, the subscription, and the way in.
 */
export function ownerDashboardPage({
  user = null,
  application = null,
  gym = null,
  subscription = null,
  documents = [],
  csrfToken = '',
  closureRequestedAt = null,
} = {}) {
  const docRows = documents.length
    ? `<table>
  <thead><tr><th>Document</th><th>File</th><th>Status</th></tr></thead>
  <tbody>
${documents
  .map(
    (d) => `    <tr><td>${h(readableDocType(d.doc_type))}</td><td>${h(d.filename)}</td>
      <td>${statusTag(d.status)}${d.reject_reason ? ` <span class="muted">${h(d.reject_reason)}</span>` : ''}</td></tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">Nothing uploaded yet.</div>`;

  // The upload form only appears while there is an application to attach to.
  const upload = application
    ? `<form class="card" id="doc-form">
  <h2>Send a document</h2>
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <input type="hidden" name="application_id" value="${h(application.id)}">
  <label>What is it?
    <select name="doc_type">
      <option value="business_registration">Business registration</option>
      <option value="id_document">Your ID</option>
      <option value="proof_of_address">Proof of address</option>
      <option value="tax_clearance">Tax clearance</option>
      <option value="insurance">Insurance</option>
      <option value="lease_agreement">Lease agreement</option>
      <option value="other_supporting">Something else</option>
    </select>
  </label>
  <label>File<input type="file" name="file" accept=".pdf,image/jpeg,image/png,image/webp,image/heic" required></label>
  <p class="muted">PDF or a photo, up to 10 MB. We look at every document by hand.</p>
  <button type="submit">Upload</button>
  <p class="muted" id="upload-note"></p>
</form>

<script>
(function () {
  var form = document.getElementById('doc-form');
  var note = document.getElementById('upload-note');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var file = form.file.files[0];
    if (!file) return;

    note.textContent = 'Preparing…';
    var common = new URLSearchParams({
      csrf: form.csrf.value,
      application_id: form.application_id.value,
      doc_type: form.doc_type.value,
      filename: file.name,
      mime_type: file.type,
      size_bytes: String(file.size)
    });

    try {
      // 1. Ask the server WHERE to put it. The server decides the path.
      var ask = await fetch('/platform/my-gym/documents/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: common.toString()
      });
      var target = await ask.json();
      if (!ask.ok) { note.textContent = target.error || 'That file was not accepted.'; return; }

      // 2. Send the bytes straight to storage — never through our function.
      note.textContent = 'Uploading…';
      var put = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, Authorization: 'Bearer ' + target.token },
        body: file
      });
      if (!put.ok) { note.textContent = 'The upload did not finish. Please try again.'; return; }

      // 3. Tell the server it is there, so a reviewer can find it.
      var done = document.createElement('form');
      done.method = 'post';
      done.action = '/platform/my-gym/documents/confirm';
      var fields = Object.assign({}, Object.fromEntries(common), { storage_ref: target.path });
      Object.keys(fields).forEach(function (k) {
        var input = document.createElement('input');
        input.type = 'hidden'; input.name = k; input.value = fields[k];
        done.appendChild(input);
      });
      document.body.appendChild(done);
      done.submit();
    } catch (err) {
      note.textContent = 'Something went wrong. Please try again.';
    }
  });
})();
</script>`
    : '';

  const status = gym
    ? `<div class="card">
  <h2>${h(gym.search_name || gym.slug)}</h2>
  <p>${statusTag(gym.status)}${subscription ? ` · ${statusTag(subscription.status)}` : ''}</p>
  ${
    gym.status === 'active'
      ? `<p><a href="${h(gymAdminPath(gym.slug))}">Open your gym admin panel →</a></p>
         <p class="muted">That is where you manage members, check-ins, payments and classes.
         Sign in as <b>${h(OWNER_USERNAME)}</b> with the password you chose when you activated.</p>`
      : `<p class="muted">Your gym is not open yet. We will email you the moment it is.</p>`
  }
  ${
    subscription?.trial_ends_at
      ? `<p class="muted">Trial ends ${h(until(subscription.trial_ends_at))}.</p>`
      : ''
  }
  ${
    subscription && ['trialing', 'past_due', 'suspended'].includes(subscription.status)
      ? `<form method="post" action="/platform/my-gym/pay">
      <input type="hidden" name="csrf" value="${h(csrfToken)}">
      <button type="submit">${subscription.status === 'suspended' ? 'Pay and reopen my gym' : 'Pay now'}</button>
      <p class="muted">You will be taken to Paystack. We never see or store your card —
      only a token that lets us take the same amount next month.</p>
    </form>`
      : ''
  }
  ${
    subscription?.card_last4
      ? `<p class="muted">Saved card: ${h(subscription.card_brand || 'card')} ending ${h(subscription.card_last4)}.</p>`
      : ''
  }
</div>`
    : application
      ? `<div class="card">
  <h2>${h(application.proposed_gym_name)}</h2>
  <p>${statusTag(application.status)}</p>
  <p class="muted">A person is reading your application. We will email you when there is a decision.</p>
</div>`
      : `<div class="empty">No application found for this account.</div>`;

  // Closing the account. Required by both stores, and ordinary decency: a
  // person who wants to leave should not have to find an email address.
  // Recorded, not instant — closing an account closes a gym with members in
  // it, and the page says exactly what happens next.
  const closure = closureRequestedAt
    ? `<div class="card">
  <h2>Closing your account</h2>
  <p>You asked to close your account on ${h(when(closureRequestedAt))}. We will contact you to confirm
  before anything is switched off.</p>
</div>`
    : `<details class="card">
  <summary>Close my account</summary>
  <p>We will contact you to confirm. Then your gym is closed to members, your sign-in is switched
  off, and your gym's data is kept for 90 days in case you change your mind, then deleted once we have
  confirmed it with you. <b>Download anything you want to keep first.</b></p>
  <form method="post" action="/platform/my-gym/close">
    <input type="hidden" name="csrf" value="${h(csrfToken)}">
    <button type="submit">Ask to close my account</button>
  </form>
</details>`;

  return layout({
    title: 'Your gym',
    user,
    body: `<h1>Your gym</h1>
${status}

<h2>Documents</h2>
${docRows}
${upload}

${closure}`,
  });
}

/**
 * How to delete your account and data — the web route both stores require,
 * reachable without the app installed.
 *
 * It explains rather than acts: deleting a member's data is done by their gym
 * (the gym holds it, POPIA makes the gym responsible), and proving who you are
 * is done by signing in the way you already do. A form here that deleted
 * anything on a membership number and phone would let anyone who knew those
 * two things erase somebody else.
 */
export function deleteAccountPage() {
  return layout({
    title: 'Delete your account',
    indexable: true,
    body: `
<div class="card">
  <h1>Delete your account and data</h1>

  <h2>If you are a gym member</h2>
  <ol>
    <li><a href="/platform/find">Find your gym</a> and sign in with your membership number and phone number.</li>
    <li>On the <b>Status</b> screen, scroll to the bottom and choose <b>Request data deletion</b>.</li>
    <li>Your gym is told straight away and deletes your records — your details, check-ins, bookings,
    health answers and any face data.</li>
  </ol>
  <p class="muted">Cannot sign in? Ask your gym directly. They hold your records and can delete them.</p>

  <h2>If you own a gym</h2>
  <ol>
    <li><a href="/platform/login">Sign in</a> and open <b>Your gym</b>.</li>
    <li>Choose <b>Close my account</b>. We contact you to confirm, close the gym to members and switch
    off your sign-in. Your gym's data is kept for 90 days in case you change your mind, then deleted
    once we have confirmed it with you.</li>
  </ol>
  <p class="muted">Forgot your password? <a href="/platform/forgot">Reset it</a> first.</p>
  <p class="muted"><a href="/platform/privacy">Privacy policy</a></p>
</div>`,
  });
}

/** Turn a stored doc_type into something a person would say. */
function readableDocType(key) {
  return (
    {
      business_registration: 'Business registration',
      id_document: 'ID document',
      proof_of_address: 'Proof of address',
      tax_clearance: 'Tax clearance',
      insurance: 'Insurance',
      lease_agreement: 'Lease agreement',
      other_supporting: 'Supporting document',
    }[key] || key
  );
}

// ---------------------------------------------------------------------------
// Plans and prices
// ---------------------------------------------------------------------------

/** Cents to rands, for a form field. Never rounds to whole rands. */
const rands = (cents) => (Number.isFinite(Number(cents)) ? (Number(cents) / 100).toFixed(2) : '');

/**
 * Plans and their prices.
 *
 * The form is in RANDS because that is what a person thinks in; everything
 * below this screen is in cents. An unpriced plan is called out in words,
 * because a blank box looks like a plan that is free and is actually a plan
 * that nobody is being charged for.
 */
export function plansPage({ plans = [], user = null, csrfToken = '', error = '' } = {}) {
  const unpriced = plans.filter((p) => !Number.isInteger(p.price_cents) || p.price_cents <= 0);

  return layout({
    title: 'Plans and prices',
    user,
    body: `<h1>Plans and prices</h1>
${error ? `<p class="err">${h(error)}</p>` : ''}
${
  unpriced.length
    ? `<div class="card"><b>⚠️ ${unpriced.length} plan${unpriced.length === 1 ? ' has' : 's have'} no price.</b>
  <p class="muted">Billing skips a plan with no price — those gyms are <b>not being billed at all</b>.
  Nothing is charged until a price is set here.</p></div>`
    : ''
}

${plans
  .map(
    (p) => `<form class="card" method="post" action="/platform/plans/${h(p.key)}">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>${h(p.label)} <span class="muted">${h(p.key)}</span></h2>
  <p>${
    Number.isInteger(p.price_cents) && p.price_cents > 0
      ? `Currently <b>${h(p.currency || 'ZAR')} ${rands(p.price_cents)}</b> per month`
      : '<b>No price set</b> — this plan bills nobody.'
  }</p>
  <div class="two">
    <label>Price per month (${h(p.currency || 'ZAR')})
      <input name="price" inputmode="decimal" value="${h(rands(p.price_cents))}" placeholder="e.g. 499.00">
    </label>
    <label>Maximum active members
      <input name="max_active_members" inputmode="numeric" value="${h(p.max_active_members)}">
    </label>
  </div>
  <label class="row"><input type="checkbox" name="is_enabled" value="1" ${
    p.is_enabled === false ? '' : 'checked'
  }> Offered to new gyms</label>
  <button type="submit">Save ${h(p.label)}</button>
</form>`
  )
  .join('\n')}

<p class="muted">Changing a price does not re-bill anyone. It applies from each gym's next
billing date. Every change here is written to the audit log.</p>`,
  });
}

// ---------------------------------------------------------------------------
// The audit log
// ---------------------------------------------------------------------------

/**
 * The platform audit log.
 *
 * Everything on the platform writes here — every approval, suspension, price
 * change and document view — and until now nothing could read it. It is also
 * the POPIA record of who looked at whose identity document.
 *
 * Filtered rather than paged: after a year this table is the largest thing on
 * the platform, and "show me everything" stops being a useful question.
 */
export function auditPage({ entries = [], user = null, filter = {}, page = null } = {}) {
  const rows = entries.length
    ? `<table>
  <thead><tr><th>When</th><th>Action</th><th>Who</th><th>What</th><th>Detail</th></tr></thead>
  <tbody>
${entries
  .map(
    (e) => `    <tr>
      <td class="muted">${h(exact(e.created_at))}</td>
      <td><b>${h(e.action)}</b></td>
      <td>${h(e.actor_kind || '')}${e.actor_user_id ? `<br><span class="muted">${h(e.actor_user_id)}</span>` : ''}</td>
      <td>${h(e.entity || '')}${e.entity_id ? `<br><span class="muted">${h(e.entity_id)}</span>` : ''}</td>
      <td class="muted">${h(detailText(e.detail))}</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">Nothing matches that filter.</div>`;

  return layout({
    title: 'Audit log',
    user,
    body: `<h1>Audit log</h1>
<p class="muted">Append-only. Every approval, suspension, price change and document view.</p>

<form class="card row" method="get" action="/platform/audit">
  <label>Action contains<input name="action" value="${h(filter.action)}" placeholder="e.g. suspend"></label>
  <label>Entity id<input name="entity_id" value="${h(filter.entityId)}" placeholder="a gym or document id"></label>
  <button type="submit">Filter</button>
</form>

${rows}
${pager(page, '/platform/audit', { action: filter.action, entity_id: filter.entityId })}`,
  });
}

/**
 * Render a detail blob as text.
 *
 * Stringified and then escaped by the caller. It is written by us, but it
 * CONTAINS text people typed — a rejection reason, a gym name — so it is
 * treated as untrusted.
 */
function detailText(detail) {
  if (!detail) return '';
  try {
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

/** Gym owners, and the switch that stops one. */
export function ownersPage({ owners = [], user = null, csrfToken = '', filter = {}, page = null } = {}) {
  const rows = owners.length
    ? `<table>
  <thead><tr><th>Owner</th><th>Email</th><th>Gyms</th><th>Status</th><th></th></tr></thead>
  <tbody>
${owners
  .map(
    (o) => `    <tr>
      <td>${h(o.full_name || '—')}</td>
      <td>${h(o.email)}</td>
      <td>${h(o.gym_count ?? 0)}</td>
      <td>${statusTag(o.is_active === false ? 'suspended' : 'active')}${
        o.closure_requested_at && o.is_active !== false ? ` ${statusTag('asked to close')}` : ''
      }</td>
      <td><form method="post" action="/platform/owners/${h(o.id)}/${
        o.is_active === false ? 'reactivate' : 'deactivate'
      }">
        <input type="hidden" name="csrf" value="${h(csrfToken)}">
        <button type="submit">${o.is_active === false ? 'Switch on' : 'Switch off'}</button>
      </form></td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">No owners match that search.</div>`;

  return layout({
    title: 'Gym owners',
    user,
    body: `<h1>Gym owners</h1>
<p class="muted">Switching an owner off stops them signing in. <b>It does not close their gym</b>
and it deletes nothing — suspend the gym itself if that is what you mean.</p>

<form class="card row" method="get" action="/platform/owners">
  <label>Search<input name="q" value="${h(filter.query)}" placeholder="name or email"></label>
  <button type="submit">Search</button>
</form>

${rows}
${pager(page, '/platform/owners', { q: filter.query })}`,
  });
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** What the platform is owed and what it has been paid. */
export function financePage({ summary = {}, user = null } = {}) {
  const byStatus = summary.gyms_by_status || {};
  const unpriced = summary.unpriced_plans || [];

  return layout({
    title: 'Finances',
    user,
    body: `<h1>Finances</h1>

${
  unpriced.length
    ? `<div class="card"><b>⚠️ Gyms on ${unpriced.map((k) => h(k)).join(', ')} are not being billed.</b>
  <p class="muted">Those plans have <b>no price</b>, so billing skips them entirely.
  <a href="/platform/plans">Set a price →</a></p></div>`
    : ''
}

<div class="card">
  <h2>Paid</h2>
  <p><b>${h(summary.currency || 'ZAR')} ${((Number(summary.paid_cents) || 0) / 100).toFixed(2)}</b></p>
</div>

<div class="card">
  <h2>Outstanding</h2>
  <p><b>${h(summary.currency || 'ZAR')} ${((Number(summary.outstanding_cents) || 0) / 100).toFixed(2)}</b></p>
  <p class="muted">Invoices issued and not yet paid.</p>
</div>

<h2>Gyms by subscription state</h2>
<table>
  <thead><tr><th>State</th><th>Gyms</th></tr></thead>
  <tbody>
${Object.entries(byStatus)
  .map(([state, count]) => `    <tr><td>${statusTag(state)}</td><td>${h(count)}</td></tr>`)
  .join('\n')}
  </tbody>
</table>

<p class="muted">Figures come from <code>platform_invoices</code>. Money the platform is owed by
gyms — <b>never a member's payment to their gym</b>, which the platform does not see (D-013).</p>`,
  });
}

// ---------------------------------------------------------------------------
// When the activation email could not be sent
// ---------------------------------------------------------------------------

/**
 * Hand the activation details to the reviewer, once.
 *
 * The bug this closes: approving a gym provisioned a real database, generated
 * an activation link, and then nothing sent it and nothing showed it. The
 * owner could never activate and the gym never opened.
 *
 * Shown ONCE and never stored — only hashes of these values exist in the
 * database, and that is the property the whole activation design rests on. If
 * the reviewer navigates away without copying them, a new activation must be
 * issued, which is correct rather than inconvenient.
 */
export function activationHandoverPage({ activation = {}, gymName = '', applicationId = '', user = null }) {
  return layout({
    title: 'Send this to the owner',
    user,
    body: `<h1>Approved — now send this to the owner</h1>

<div class="card">
  <p><b>⚠️ The activation email could not be sent${
    activation.emailReason ? ` (${h(activation.emailReason)})` : ''
  }.</b></p>
  <p class="muted">The gym <b>${h(gymName)}</b> is provisioned and waiting. The owner cannot open
  it until they use the link and the code below, so please send these to them yourself.</p>
</div>

<div class="card">
  <h2>Send to ${h(activation.to || 'the owner')}</h2>
  <p><b>Link</b></p>
  <p><input readonly value="${h(activation.link)}" style="width:100%" onclick="this.select()"></p>
  <p><b>Code</b></p>
  <p style="font-size:28px;letter-spacing:6px"><b>${h(activation.code)}</b></p>
  <p class="muted">Both are needed. The link alone is not enough, and it expires in
  ${h(activation.expiresInHours || 48)} hours.</p>
</div>

<div class="card">
  <p><b>This is shown once.</b> Only hashes are stored, so this page is the only
  place these values exist. If you navigate away without copying them, issue a new
  activation instead — nothing is lost, the owner simply gets a fresh link.</p>
  <p><a href="/platform/applications/${h(applicationId)}">Back to the application →</a></p>
</div>`,
  });
}

// ---------------------------------------------------------------------------
// Reviewing one document — the screen where a forgery is caught or missed
// ---------------------------------------------------------------------------

/**
 * A document, shown properly.
 *
 * It used to redirect to a signed storage URL: the reviewer left the panel,
 * downloaded a file, opened it in another application, and had nothing beside
 * it to compare against. Whether a registration certificate is forged is a
 * judgement made by comparing the document to what the applicant CLAIMED, and
 * that comparison is impossible on two separate screens.
 *
 * So: the document is rendered inline, and everything needed to judge it sits
 * next to it — the applicant's own claims, the facts about the bytes, and
 * anywhere else this exact file has been seen before.
 *
 * The file itself is loaded from /platform/documents/<id>/file, which issues a
 * short-lived signed URL. The URL never appears in this page's source.
 */
export function documentReviewPage({
  doc,
  application = null,
  facts = null,
  duplicates = [],
  user = null,
  csrfToken = '',
  canDecide = false,
}) {
  const isImage = String(doc.mime_type || '').startsWith('image/');
  const src = `/platform/documents/${h(doc.id)}/file`;

  // The document itself. An <object> for PDFs because it falls back cleanly
  // when the browser has no viewer, which is exactly when a reviewer needs to
  // be told rather than shown a blank rectangle.
  const viewer = isImage
    ? `<img src="${src}" alt="${h(doc.filename)}" style="max-width:100%;border:1px solid var(--line);border-radius:8px">`
    : `<object data="${src}" type="application/pdf" style="width:100%;height:78vh;border:1px solid var(--line);border-radius:8px">
  <div class="empty">
    <p>Your browser cannot display this file inline.</p>
    <p><a href="${src}" target="_blank" rel="noopener">Open it in a new tab →</a></p>
  </div>
</object>`;

  // Flags are facts, phrased as facts. None of them is a verdict.
  const flagList = (facts?.flags || []).length
    ? `<div class="card" style="border-left:4px solid var(--bad)">
  <h2>⚠️ Worth a closer look</h2>
  <ul>${facts.flags
    .map((f) => `<li><b>${h(f.severity)}</b> — ${h(f.detail)}</li>`)
    .join('')}</ul>
  <p class="muted">These are observations, not conclusions. A genuine document can
  trip them, and a convincing forgery can pass all of them.</p>
</div>`
    : '';

  // The strongest signal available, and the one a human would never spot
  // unaided: this exact file on somebody else's application.
  const dupeList = duplicates.length
    ? `<div class="card" style="border-left:4px solid var(--bad)">
  <h2>⚠️ This exact file appears on ${duplicates.length} other application${
        duplicates.length === 1 ? '' : 's'
      }</h2>
  <ul>${duplicates
    .map(
      (d) => `<li><a href="/platform/applications/${h(d.application_id)}">${h(
        d.proposed_gym_name || d.application_id
      )}</a> <span class="muted">${h(when(d.uploaded_at))}</span></li>`
    )
    .join('')}</ul>
  <p class="muted">Byte-for-byte identical. The same person applying twice is
  ordinary; two different gyms sending one file is not.</p>
</div>`
    : '';

  const claims = application
    ? `<div class="card">
  <h2>What the applicant says</h2>
  <table>
    <tbody>
      <tr><td class="muted">Gym</td><td><b>${h(application.proposed_gym_name)}</b></td></tr>
      <tr><td class="muted">City</td><td>${h(application.city)} ${h(application.country)}</td></tr>
      <tr><td class="muted">Document type</td><td>${h(doc.doc_type)}</td></tr>
      <tr><td class="muted">Applied</td><td>${h(when(application.submitted_at))}</td></tr>
    </tbody>
  </table>
  <p class="muted">Compare these against the document. A name or an address that
  does not match is the thing to look for.</p>
</div>`
    : '';

  const controls =
    canDecide && doc.status === 'pending'
      ? `<form class="card" method="post" action="/platform/documents/${h(doc.id)}/decide">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Decision</h2>
  <label>Reason (required to reject)
    <input name="reason" placeholder="e.g. the name does not match the application">
  </label>
  <div class="row">
    <button type="submit" name="action" value="accept">Accept</button>
    <button type="submit" name="action" value="reject">Reject</button>
  </div>
</form>`
      : `<div class="card"><p class="muted">${
          doc.status === 'pending' ? 'You have read-only access.' : `Already ${h(doc.status)}.`
        }${doc.reject_reason ? ` ${h(doc.reject_reason)}` : ''}</p></div>`;

  return layout({
    title: doc.filename || 'Document',
    user,
    body: `<p><a href="/platform/applications/${h(doc.application_id)}">← Back to the application</a></p>
<h1>${h(doc.filename || 'Document')}</h1>

${dupeList}
${flagList}

${viewer}

${claims}

<div class="card">
  <h2>The file itself</h2>
  <table>
    <tbody>
      <tr><td class="muted">Uploaded as</td><td>${h(doc.mime_type || '—')}</td></tr>
      <tr><td class="muted">Actually is</td><td>${
        facts?.actualType ? h(facts.actualType) : '<span class="muted">not recognised</span>'
      }</td></tr>
      <tr><td class="muted">Size</td><td>${h(readableSizeLabel(facts?.bytes ?? doc.size_bytes))}</td></tr>
      <tr><td class="muted">Uploaded</td><td>${h(exact(doc.uploaded_at))}</td></tr>
      <tr><td class="muted">SHA-256</td><td style="word-break:break-all;font-family:monospace;font-size:0.8rem">${h(
        facts?.sha256 || doc.sha256 || '—'
      )}</td></tr>
    </tbody>
  </table>
  <p class="muted">The hash is computed from the bytes actually in storage, not from
  anything the uploader told us. It is what makes the duplicate check above possible.</p>
</div>

${controls}

<p class="muted">Opening this document has been recorded in the audit log, with your
name and the time.</p>`,
  });
}

/** Bytes as a person reads them. Mirrors readableSize in platform/forensics.js. */
function readableSizeLabel(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Platform security (CLAUDE.md §16)
// ---------------------------------------------------------------------------

/**
 * What is worth a person's attention today.
 *
 * PLATFORM security, not a gym's. Nothing here concerns a gym's members, its
 * check-ins or its takings — those belong to that gym's own admin panel and
 * the platform never sees them (D-044).
 *
 * Every alert states its innocent explanation next to it, deliberately. Most
 * of these patterns usually ARE innocent, and a screen that does not say so
 * trains people first to panic and then to stop reading it.
 */
export function securityPage({ alerts = [], windowHours = 24, user = null }) {
  const body = alerts.length
    ? alerts
        .map(
          (a) => `<div class="card" style="border-left:4px solid ${
            a.severity === 'high' ? 'var(--bad)' : '#b7791f'
          }">
  <h2>${h(a.detail)}</h2>
  <p class="muted">${h(a.innocent)}</p>
  <p class="muted"><a href="/platform/audit?action=${h(auditFilterFor(a.code))}">
    See the entries →</a></p>
</div>`
        )
        .join('\n')
    : `<div class="card">
  <h2>✅ Nothing needs attention</h2>
  <p class="muted">No unusual activity in the last ${h(windowHours)} hours.</p>
</div>`;

  return layout({
    title: 'Security',
    user,
    body: `<h1>Security</h1>
<p class="muted">The last ${h(windowHours)} hours on the platform. This watches sign-ins,
access to applicants' identity documents, and gyms that failed to be created —
<b>never a gym's own members</b>, which the platform does not see.</p>

${body}

<p class="muted"><b>Nothing here acts on its own.</b> No account is locked and no gym is
suspended by this screen. Every pattern above has an ordinary explanation, and
deciding which one applies is a person's job.</p>`,
  });
}

/** Map an alert back to the audit filter that shows its entries. */
function auditFilterFor(code) {
  return (
    {
      repeated_failed_logins: 'login.failed',
      staff_blocked_no_2fa: 'blocked_no_2fa',
      unusual_document_access: 'document.viewed',
      document_path_rejected: 'rejected_path',
      unmatched_payment: 'webhook.unmatched',
      provisioning_failed: 'provision.failed',
    }[code] || ''
  );
}

// ---------------------------------------------------------------------------
// First run
// ---------------------------------------------------------------------------

/**
 * Claim the seeded owner account.
 *
 * The secret is carried in a hidden field rather than stored anywhere between
 * the two requests: there is no session yet, and a half-finished setup should
 * leave nothing behind. Reloading simply mints a new one.
 */
export function setupPage({ token = '', email = '', secret = '', otpauth = '', error = '' } = {}) {
  return layout({
    title: 'Set up your account',
    body: `<h1>Set up your platform account</h1>
<p class="muted">Your account exists but has no password yet. This page sets one, and turns on
two-factor authentication at the same time — a platform account reaches every gym, so it is
not optional here.</p>
${error ? `<p class="err">${h(error)}</p>` : ''}

<div class="card">
  <h2>1. Add this to your authenticator app</h2>
  <p class="muted">Google Authenticator, 1Password, Authy — any of them.</p>
  <p>Scan this, or type the key in by hand:</p>
  <p style="font-family:monospace;font-size:1.1rem;letter-spacing:2px;word-break:break-all">${h(secret)}</p>
  <p class="muted"><a href="${h(otpauth)}">Open in your authenticator app →</a></p>
</div>

<form class="card" method="post" action="/platform/setup">
  <input type="hidden" name="token" value="${h(token)}">
  <input type="hidden" name="secret" value="${h(secret)}">
  <h2>2. Choose a password</h2>
  <!-- The visible field is disabled so it cannot be edited, and a DISABLED
       INPUT IS NEVER SUBMITTED — nor is one without a name. Both were true
       here, so the server received no email, found no account, and reported
       an invalid link when the link was fine. The hidden field is what
       actually travels. -->
  <input type="hidden" name="email" value="${h(email)}">
  <label>Email<input value="${h(email)}" disabled></label>
  <label>Password
    <input type="password" name="password" required minlength="12" autocomplete="new-password">
  </label>
  <p class="muted">At least 12 characters.</p>

  <h2>3. Prove the app works</h2>
  <label>The six-digit code showing now
    <input name="totp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required
           autocomplete="one-time-code">
  </label>
  <p class="muted">Checked before two-factor is switched on. If it were not, a wrong setup would
  lock you out of your own platform with no second account to fix it from.</p>

  <button type="submit">Finish setup</button>
</form>`,
  });
}

/** The recovery codes, shown once and never again. */
export function setupDonePage({ recoveryCodes = [] } = {}) {
  return layout({
    title: 'Account ready',
    body: `<h1>Your account is ready</h1>

<div class="card">
  <h2>⚠️ Save these recovery codes now</h2>
  <p class="muted">Each one signs you in once if you lose your phone. <b>This is the only time
  they are shown</b> — only their hashes are stored, so nobody, including us, can show them
  to you again.</p>
  <p style="font-family:monospace;font-size:1.15rem;line-height:2;letter-spacing:2px">
    ${recoveryCodes.map((c) => h(c)).join('<br>')}
  </p>
  <p class="muted">Print them, or put them somewhere that is not the phone with your
  authenticator on it.</p>
</div>

<div class="card">
  <p><a href="/platform/login">Sign in →</a></p>
  <p class="muted">Remove <code>PLATFORM_SETUP_TOKEN</code> from your environment now.
  It is no longer needed — this account already has a password, so the setup page
  would refuse it anyway, but a secret nobody needs is a secret not worth keeping.</p>
</div>`,
  });
}

// ---------------------------------------------------------------------------
// After Paystack sends the owner back
// ---------------------------------------------------------------------------

/**
 * What happened to the payment.
 *
 * Says whether renewals will work, because that is the difference between a
 * subscription and a single payment, and the owner should not discover it next
 * month when their gym is suspended.
 */
export function paymentResultPage({ ok = false, reason = '', alreadyPaid = false, recurring = false } = {}) {
  if (!ok) {
    return layout({
      title: 'Payment not completed',
      body: `<div class="card">
  <h1>That payment did not go through</h1>
  <p>${h(reason) || 'Nothing has been charged.'}</p>
  <p class="muted"><b>Nothing has been charged.</b> Your gym is unaffected — you can try again
  whenever you are ready.</p>
  <p><a href="/platform/my-gym">Back to your gym →</a></p>
</div>`,
    });
  }

  return layout({
    title: 'Payment received',
    body: `<div class="card">
  <h1>Thank you — payment received</h1>
  ${alreadyPaid ? '<p class="muted">This one was already recorded. You have not been charged twice.</p>' : ''}
  <p>Your gym is active and your members can use it.</p>
  ${
    recurring
      ? `<p class="muted">Your card is saved, so next month is taken automatically. We will email you
         before each payment, and you can stop it whenever you want.</p>`
      : `<p class="muted"><b>This payment was one-off.</b> Your card could not be saved for next
         month, so we will email you when the next one is due and you will pay the same way again.</p>`
  }
  <p><a href="/platform/my-gym">Back to your gym →</a></p>
</div>`,
  });
}

/**
 * Something went wrong, said usefully.
 *
 * Replaces the bare `<p>error</p>` these paths used to render — a white page
 * with four words on it, which is the least helpful thing a first-run screen
 * can do to the person setting the system up.
 *
 * `fix` is only ever set for operator-facing problems (a missing environment
 * variable, a seed that has not been run). Attacker-facing refusals still say
 * one generic thing and no more.
 */
export function problemPage({ title = 'Something went wrong', message = '', fix = null } = {}) {
  return layout({
    title,
    body: `<div class="card">
  <h1>${h(title)}</h1>
  <p>${h(message)}</p>
  ${fix ? `<div class="card" style="border-left:4px solid #b7791f"><b>How to fix it</b><p>${h(fix)}</p></div>` : ''}
</div>`,
  });
}

// ---------------------------------------------------------------------------
// Your own account
// ---------------------------------------------------------------------------

/** Where you replace recovery codes you did not keep. */
export function accountPage({ user = null, remaining = 0, csrfToken = '', error = '', codes = null }) {
  if (codes) {
    return layout({
      title: 'New recovery codes',
      user,
      body: `<h1>Your new recovery codes</h1>
<div class="card">
  <h2>⚠️ Save these now</h2>
  <p class="muted"><b>Your previous codes no longer work.</b> Each of these signs you in once if
  you lose your phone, and <b>this is the only time they are shown</b> — only their hashes are
  stored.</p>
  <p style="font-family:monospace;font-size:1.15rem;line-height:2;letter-spacing:2px">
    ${codes.map((c) => h(c)).join('<br>')}
  </p>
  <p class="muted">Put them somewhere that is not the phone your authenticator is on.</p>
</div>`,
    });
  }

  return layout({
    title: 'Your account',
    user,
    body: `<h1>Your account</h1>

<div class="card">
  <h2>Recovery codes</h2>
  <p>${
    remaining > 0
      ? `You have <b>${h(remaining)}</b> unused code${remaining === 1 ? '' : 's'}.`
      : '<b>You have no recovery codes left.</b>'
  }</p>
  <p class="muted">These are what let you back in if you lose the phone with your authenticator
  on it. Yours is the only account that reaches every gym — there is no second owner to let you
  back in, so this matters more here than it would anywhere else.</p>
</div>

${error ? `<p class="err">${h(error)}</p>` : ''}

<form class="card" method="post" action="/platform/account/recovery-codes">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Issue a new set</h2>
  <p class="muted"><b>Your current codes will stop working.</b> Only do this if you have lost
  them, or think somebody else has seen them.</p>

  <label>Your password
    <input type="password" name="password" required autocomplete="current-password">
  </label>
  <label>Code from your authenticator
    <input name="totp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required
           autocomplete="one-time-code">
  </label>
  <p class="muted">Asked for again on purpose: recovery codes bypass two-factor authentication,
  so a borrowed browser tab must not be enough to mint a new set.</p>

  <button type="submit">Issue new codes</button>
</form>`,
  });
}


// ---------------------------------------------------------------------------
// The front page
// ---------------------------------------------------------------------------

/**
 * What needs you today.
 *
 * Signing in used to land on the applications queue — one list, chosen because
 * it was built first. A panel for running a business should open on the things
 * waiting for a decision, and say plainly when there are none.
 *
 * Every number here is a link. A figure a person cannot act on is decoration,
 * and decoration on an operations screen is worse than a blank space because
 * it looks like information.
 */
export function dashboardPage({
  user = null,
  waiting = 0,
  gyms = 0,
  activeGyms = 0,
  alerts = 0,
  unpricedPlans = [],
  outstandingCents = 0,
  currency = 'ZAR',
  trialsEndingSoon = [],
  driftFindings = null,
  closureRequests = 0,
  provisioningOff = false,
} = {}) {
  // Ordered by what it costs to ignore, not by what is interesting.
  const needsYou = [];

  // Applications are waiting and approving them CANNOT work: said before
  // anyone presses Approve and wonders why nothing happened.
  if (provisioningOff && waiting) {
    needsYou.push({
      urgency: 'high',
      text: 'Creating gyms is switched off on this server, so approving an application cannot open a gym yet.',
      href: '/platform/applications',
      action: 'See what is waiting',
    });
  }

  // Someone asked to leave. The stores require it to be honoured, and an
  // owner still being billed after asking to close is a complaint waiting.
  if (closureRequests) {
    needsYou.push({
      urgency: 'high',
      text: `${count(closureRequests, 'owner')} asked to close their account.`,
      href: '/platform/owners',
      action: 'Contact them',
    });
  }

  if (unpricedPlans.length) {
    needsYou.push({
      urgency: 'high',
      text: `${unpricedPlans.map((k) => h(k)).join(', ')} ${
        unpricedPlans.length === 1 ? 'has' : 'have'
      } no price, so ${unpricedPlans.length === 1 ? 'that plan bills' : 'those plans bill'} nobody.`,
      href: '/platform/plans',
      action: 'Set a price',
    });
  }

  if (waiting) {
    needsYou.push({
      urgency: 'normal',
      text: `${count(waiting, 'gym')} waiting for a decision.`,
      href: '/platform/applications',
      action: 'Review',
    });
  }

  if (alerts) {
    needsYou.push({
      urgency: 'high',
      text: `${count(alerts, 'security item')} worth a look in the last day.`,
      href: '/platform/security',
      action: 'Look',
    });
  }

  if (driftFindings) {
    needsYou.push({
      urgency: 'high',
      text: `${count(driftFindings, 'gym')} out of step between the registry and the database.`,
      href: '/platform/reconcile',
      action: 'See the report',
    });
  }

  for (const t of trialsEndingSoon) {
    needsYou.push({
      urgency: 'normal',
      text: `${h(t.name)}'s trial ends ${h(until(t.trial_ends_at))}.`,
      href: `/platform/registry/${h(t.gym_id)}`,
      action: 'Open',
    });
  }

  const todo = needsYou.length
    ? needsYou
        .map(
          (item) => `<div class="card" style="border-left:4px solid ${
            item.urgency === 'high' ? 'var(--bad)' : '#b7791f'
          }">
  <p style="margin:0 0 0.6rem">${item.text}</p>
  <p style="margin:0"><a href="${item.href}">${h(item.action)} →</a></p>
</div>`
        )
        .join('\n')
    : `<div class="card">
  <h2>✅ Nothing needs you</h2>
  <p class="muted">No applications waiting, no security items, no plan billing nobody,
  and nothing out of step. Come back tomorrow.</p>
</div>`;

  return layout({
    title: 'Yoyo Gyms',
    user,
    body: `<h1>Today</h1>

${todo}

<h2>The platform</h2>
<div class="card">
  <table>
    <tbody>
      <tr>
        <td><a href="/platform/registry">Gyms</a></td>
        <td><b>${h(gyms)}</b> ${gyms ? `<span class="muted">· ${h(activeGyms)} active</span>` : ''}</td>
      </tr>
      <tr>
        <td><a href="/platform/finance">Outstanding</a></td>
        <td><b>${h(fmtMoney(outstandingCents, currency))}</b>
            <span class="muted">invoiced, not yet paid</span></td>
      </tr>
      <tr>
        <td><a href="/platform/owners">Gym owners</a></td>
        <td><a href="/platform/owners">Manage →</a></td>
      </tr>
      <tr>
        <td><a href="/platform/audit">Audit log</a></td>
        <td><a href="/platform/audit">Everything that happened →</a></td>
      </tr>
    </tbody>
  </table>
</div>

<p class="muted">Counts only — the platform never reads a gym member's name,
phone, ID or health answers.</p>`,
  });
}

// ---------------------------------------------------------------------------
// Privacy policy
// ---------------------------------------------------------------------------

/**
 * The privacy policy — required by both stores, and by POPIA.
 *
 * EVERY STATEMENT HERE WAS CHECKED AGAINST THE CODE on 2026-09-24: the member
 * columns in db/schema.sql, the owner alert templates, the retention rules
 * (D-071, D-121), the providers actually called. It describes what the system
 * does, not what a policy usually says. When the system changes, this must.
 *
 * NOT IN FORCE UNTIL SOMEONE SAYS SO. A privacy policy is a legal promise;
 * it is shown as a draft until PLATFORM_PRIVACY_APPROVED=true, the same way
 * billing and provisioning are dry runs until switched on.
 *
 * @param {object} opts
 * @param {boolean} opts.approved  PLATFORM_PRIVACY_APPROVED
 * @param {string}  opts.contact   PLATFORM_PRIVACY_CONTACT — where to write
 * @param {string}  opts.operator  the business that runs Yoyo Gyms
 */
export function privacyPage({ approved = false, contact = '', operator = 'MuleSoo Digital Solutions' } = {}) {
  const contactLine = contact
    ? `<a href="mailto:${h(contact)}">${h(contact)}</a>`
    : '<i>the contact address will be added before this policy takes effect</i>';

  return layout({
    title: 'Privacy policy',
    indexable: approved,
    body: `
<div class="card">
  ${approved ? '' : `<p class="err">DRAFT — under review and not yet in force.</p>`}
  <h1>Privacy policy</h1>
  <p>Yoyo Gyms connects gyms with their members and runs each gym's own system. It is operated by
  ${h(operator)}. Questions about this policy: ${contactLine}.</p>

  <h2>Who is responsible for what</h2>
  <p><b>If you are a gym member</b>, your gym decides what it collects about you and why, and is
  responsible for it. We store and process it for your gym, and nothing else. Each gym's records are
  kept separate from every other gym's.</p>
  <p><b>If you own a gym</b>, we are responsible for the information about you and your business.</p>

  <h2>What your gym may collect about you</h2>
  <ul>
    <li><b>Identity and contact:</b> name, date of birth, gender, ID or passport number, nationality,
    phone, email, address, and an emergency contact. For a minor, a guardian's consent.</li>
    <li><b>Your membership:</b> plan, dates, payments your gym records, check-ins, class bookings,
    training notes, progress entries you add, and messages with your gym.</li>
    <li><b>Health:</b> your answers to the PAR-Q health questions, injuries you tell your gym about,
    and whether you have medical aid. Used for your safety when you exercise.</li>
    <li><b>A photo</b> for your membership card.</li>
    <li><b>Face data, only if you agree to it:</b> a set of numbers made from your photo, used to
    recognise you at check-in and sign-in. It is not a picture, and you can use the gym without it.</li>
  </ul>

  <h2>What we collect about gym owners</h2>
  <ul>
    <li>Your name, email, password (stored only in a form that cannot be reversed) and your gym's details.</li>
    <li>The documents you upload with your application.</li>
    <li>For your subscription, Paystack handles your card. We keep only a token that lets us charge the
    same card again, and the card type and last four digits so you can recognise it. We never see or
    store the card number.</li>
  </ul>

  <h2>The app</h2>
  <ul>
    <li><b>Camera:</b> only when you press Scan, to read a gym's QR code. No image is kept.</li>
    <li><b>Location:</b> only when you press "Use my location", to show the nearest gyms first. It is
    not saved to your account.</li>
    <li>The app remembers which gym you chose, on your phone only. You can make it forget.</li>
  </ul>

  <h2>Who else handles it</h2>
  <ul>
    <li><b>Supabase</b> stores the databases. <b>Vercel</b> runs the service.</li>
    <li><b>Brevo</b> sends emails — membership confirmations, reminders and account emails.</li>
    <li><b>Paystack</b> takes gym owners' subscription payments.</li>
    <li><b>CallMeBot</b>, if your gym switches it on, sends the gym owner WhatsApp or Telegram alerts.
    A new-member alert includes the member's name, membership number, phone, email and whether the
    PAR-Q health questions need a doctor's clearance.</li>
  </ul>
  <p>These providers may store information outside your country.</p>

  <h2>How long it is kept</h2>
  <ul>
    <li>A member's records are kept until the gym deletes them, or until you ask for them to be deleted.</li>
    <li>When a gym closes, its records are kept for 90 days in case it reopens, and then deleted after
    we have confirmed it with the gym.</li>
    <li>Documents from an application we decline are deleted 90 days after the decision.</li>
  </ul>

  <h2>Your rights</h2>
  <p>You can ask to see, correct or delete what is held about you. Members: ask your gym, or use
  <b>Request data deletion</b> in the member area. Everyone: <a href="/platform/delete-account">how to
  delete your account</a>. In South Africa you may also complain to the Information Regulator.</p>

  <h2>Changes</h2>
  <p>If this policy changes, the new version is published here with its date.</p>
</div>`,
  });
}

// ---------------------------------------------------------------------------
// The front door
// ---------------------------------------------------------------------------

/**
 * What a visitor to the website sees first.
 *
 * The site root used to redirect straight to the STAFF sign-in, with no link
 * anywhere to joining a gym or listing one. The owner application and the gym
 * finder existed and nobody could reach them from the website. The staff
 * panel is still the website's main job (D-133); this page only makes sure a
 * gym member or a gym owner who arrives here has a way forward.
 */
export function welcomePage() {
  return layout({
    title: 'Yoyo Gyms',
    indexable: true,
    body: `<style>
  .doors { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin: 24px 0; }
  .door { display: block; padding: 24px; border-radius: 16px; text-decoration: none; color: inherit;
          border: 1px solid var(--line); background: var(--card, transparent); }
  .door:hover { border-color: #E63946; }
  .door h2 { margin: 0 0 8px; }
  .door .go { color: #E63946; font-weight: 600; }
</style>
<h1>Yoyo Gyms</h1>
<p class="muted">Many gyms, one place to find them.</p>

<div class="doors">
  <a class="door" href="/platform/find">
    <h2>I train at a gym</h2>
    <p class="muted">Find your gym to join as a new member, or sign in with your membership number and phone.</p>
    <span class="go">Find your gym →</span>
  </a>
  <a class="door" href="/platform/apply">
    <h2>I own a gym</h2>
    <p class="muted">List your gym on Yoyo Gyms. You get your own gym admin panel, member sign-up and check-in.</p>
    <span class="go">List your gym →</span>
  </a>
</div>

<p>Already applied, or already running your gym here? <a href="/platform/login">Sign in</a></p>
<p class="muted"><a href="/platform/privacy">Privacy policy</a> · <a href="/platform/delete-account">Delete your account</a> · <a href="/platform/login">Yoyo staff sign in</a></p>`,
  });
}
