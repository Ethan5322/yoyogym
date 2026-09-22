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
  <p class="muted">Platform administration</p>
  ${error ? `<p class="err">${h(error)}</p>` : ''}
  <label>Email
    <input type="email" name="email" autocomplete="username" required>
  </label>
  <label>Password
    <input type="password" name="password" autocomplete="current-password" required>
  </label>
  <label>Authentication code
    <input type="text" name="totp" inputmode="numeric" autocomplete="one-time-code"
           pattern="[0-9]*" placeholder="6 digits" required>
  </label>
  <button type="submit">Sign in</button>
  <p class="muted">Lost your device? Use a recovery code in place of the authentication code.</p>
</form>`,
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
      <td class="muted">${h(a.submitted_at)}</td>
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
    (e) => `  <li><b>${h(e.event)}</b> <span class="muted">${h(e.created_at)}</span>${
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
    <span class="muted">At least 10 characters. You will set up two-factor authentication next.</span>
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
<p class="muted">A person reviews every application, so this is not instant. We will email you to
ask for your documents, and again once a decision is made.</p>
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
export function registryPage({ gyms = [], user = null, canSuspend = false } = {}) {
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
<p class="muted">${gyms.length} gym${gyms.length === 1 ? '' : 's'} on the platform.${
      canSuspend ? '' : ' You have read-only access.'
    }</p>
<p><a href="/platform/reconcile">Check for drift →</a></p>
${body}`,
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
    (i) => `    <tr><td>${h(i.number)}</td><td>${money(i.amount_cents, i.currency)}</td>
      <td>${statusTag(i.status)}</td><td class="muted">${h(i.issued_at)}</td></tr>`
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
export function activateSuccessPage({ gymActivated = false } = {}) {
  return layout({
    title: 'Account activated',
    body: `<div class="card">
  <h1>Your account is active</h1>
  <p>You can now sign in with your email and the password you just chose.</p>
  ${
    gymActivated
      ? '<p>Your gym is open. Your members can find it and sign in.</p>'
      : `<p class="muted">Your gym is not open to members yet — that happens once your
         subscription starts. We will email you when it does.</p>`
  }
  <p><a href="/platform/login">Sign in →</a></p>
</div>`,
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
  gymAdminUrl = '',
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
    gym.status === 'active' && gymAdminUrl
      ? `<p><a href="${h(gymAdminUrl)}">Open your gym admin panel →</a></p>
         <p class="muted">That is where you manage members, check-ins, payments and classes.</p>`
      : `<p class="muted">Your gym is not open yet. We will email you the moment it is.</p>`
  }
  ${
    subscription?.trial_ends_at
      ? `<p class="muted">Trial ends ${h(subscription.trial_ends_at)}.</p>`
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

  return layout({
    title: 'Your gym',
    user,
    body: `<h1>Your gym</h1>
${status}

<h2>Documents</h2>
${docRows}
${upload}`,
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
