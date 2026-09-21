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
export function layout({ title = 'Yoyo Gyms', body = '', user = null }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
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
export function applicationDetailPage({ application, documents = [], events = [], user = null }) {
  const docs = documents.length
    ? `<table>
  <thead><tr><th>Document</th><th>File</th><th>Status</th></tr></thead>
  <tbody>
${documents
  .map(
    (d) => `    <tr>
      <td>${h(d.doc_type)}</td>
      <td><a href="/platform/documents/${h(d.id)}">${h(d.filename || 'download')}</a></td>
      <td>${statusTag(d.status)}</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`
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
