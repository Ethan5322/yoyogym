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
import { BRAND, LOGO_ON_DARK } from '../shared/brand.js';
import { REQUIRED_DOCUMENTS, DOCUMENT_LABELS, missingRequiredDocuments, MAX_DOCUMENT_BYTES } from './documents.js';
import { INVITE_TTL_HOURS } from './team.js';
import { SERVICE_INFO, SERVICE_GROUPS, ALL_SERVICES, CORE_FEATURES, effectiveFeatures } from '../shared/features.js';

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

// The Yoyo Gyms brand on every page of the website (CLAUDE.md §37): near-black,
// white type, electric lime — the same in light and dark system themes, like
// the app. Values from shared/brand.js.
const STYLE = `
  :root { color-scheme: dark; --ink:#F2F5F3; --muted:rgba(255,255,255,.62); --line:rgba(255,255,255,.12);
          --accent:${BRAND.lime}; --accent-ink:${BRAND.limeInk}; --bg:${BRAND.ground}; --card:${BRAND.surface};
          --bad:#ff6b5e; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { border-bottom:1px solid var(--line); padding:12px 20px; display:flex;
           justify-content:space-between; align-items:center; gap:16px; background:var(--card); }
  header .brand { display:inline-flex; align-items:center; }
  header .brand img { display:block; height:48px; width:auto; }
  header nav a { color:var(--ink); text-decoration:none; font-weight:600; }
  header nav a:hover { color:var(--accent); }
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
  input, textarea, select { font:inherit; min-height:44px; padding:10px 12px; border:1px solid var(--line);
                    border-radius:6px; background:var(--bg); color:inherit; width:100%; }
  input:focus, textarea:focus, select:focus { outline:2px solid var(--accent); outline-offset:1px; }
  /* Every control at least 44 px tall — a comfortable target for a finger, and
     big enough to read at a glance (CLAUDE.md §41). */
  button { font:inherit; font-size:15px; font-weight:700; min-height:44px; padding:10px 20px; border:0; border-radius:99px;
           background:var(--accent); color:var(--accent-ink); cursor:pointer; }
  .err { color:var(--bad); font-size:13px; }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  ul.events { list-style:none; padding:0; margin:12px 0 0; }
  ul.events li { border-left:2px solid var(--line); padding:6px 0 6px 12px; margin-bottom:6px; }

  /* The sign-in page (CLAUDE.md §36, §36.1 Q8): the Yoyo Gyms brand — near-
     black, white type, electric lime — in both colour schemes. */
  body.auth { --ink:#fff; --muted:rgba(255,255,255,.62); --line:rgba(255,255,255,.12);
              --bg:#070c10; --accent:#bff642; min-height:100vh; display:grid; place-items:center; }
  body.auth main { width:100%; max-width:440px; padding:48px 24px; }
  body.auth a { color:#fff; }
  .auth-logo { display:block; width:144px; height:auto; margin:0 auto 32px; }
  body.auth form.card { max-width:none; margin:0; padding:32px 24px; gap:16px;
                        background:#10181d; border-radius:24px; }
  body.auth h1 { font-size:28px; line-height:1.15; text-align:center; margin:0; }
  body.auth .auth-sub { text-align:center; margin:0 0 8px; }
  body.auth input { padding:14px 16px; border-radius:14px; font-size:16px; background:#070c10; }
  body.auth input:focus { outline:2px solid #bff642; outline-offset:1px; }
  body.auth button { min-height:52px; border-radius:26px; color:#0b1400; font-weight:800; font-size:16px; }
  body.auth .err { color:#ff6b5e; }
  body.auth .auth-links { text-align:center; margin:0; }
  body.auth .auth-foot { text-align:center; margin:24px 0 0; }

  /* Every page's cards and status labels. */
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px 22px; margin:16px 0; }
  .card > :first-child { margin-top:0; } .card > :last-child { margin-bottom:0; }
  .tag { display:inline-block; font-size:12px; font-weight:700; padding:3px 10px; border-radius:99px;
         border:1px solid var(--line); color:var(--muted); white-space:nowrap; text-transform:capitalize; }
  .tag--good { color:#8ee07a; background:rgba(142,224,122,.1); border-color:rgba(142,224,122,.3); }
  .tag--warn { color:#f5c451; background:rgba(245,196,81,.1); border-color:rgba(245,196,81,.3); }
  .tag--bad  { color:#ff8a7e; background:rgba(255,107,94,.1); border-color:rgba(255,107,94,.32); }
  .tag--info { color:#7cc4ff; background:rgba(124,196,255,.1); border-color:rgba(124,196,255,.3); }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:15px; font-weight:700;
         min-height:44px; padding:10px 20px; border-radius:99px; background:var(--accent); color:var(--accent-ink);
         text-decoration:none; }
  .btn.ghost, button.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
  button.danger { background:var(--bad); color:#1a0503; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .lede { color:var(--muted); margin:0 0 8px; }
  .card h2 { font-size:17px; margin:0 0 10px; }
  .svc-block { border-top:1px solid var(--line); padding-top:14px; margin-top:4px; }
  .svc-title { font-weight:800; margin:0 0 4px; }
  .svc-h { font-size:12px; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); margin:14px 0 8px; font-weight:700; }
  .svc-core { margin:0; }
  .svc-grid { display:grid; gap:8px; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); }
  label.svc { display:flex; gap:10px; align-items:flex-start; color:var(--ink); font-size:14px; border:1px solid var(--line);
              border-radius:12px; padding:10px 12px; cursor:pointer; min-height:48px; }
  label.svc:has(input:checked) { border-color:rgba(191,246,66,.5); background:rgba(191,246,66,.05); }
  label.svc input { width:20px; height:20px; margin-top:1px; flex:none; }
  label.svc small { display:block; color:var(--muted); font-size:12px; }
  input[type=checkbox], input[type=radio] { width:auto; min-height:0; accent-color:var(--accent); }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 600px) { .two { grid-template-columns:1fr; } }
  /* A row of fields and buttons stays a row; a field in it does not take the
     whole width and push its button onto the next line. */
  .row > input, .row > select { width:auto; flex:1 1 160px; }
  .row > input[type=checkbox], .row > input[type=radio] { flex:none; }
  body.panel form.card.row { display:flex; flex-wrap:wrap; align-items:flex-end; }
  body.panel form.card.row > label { flex:1 1 220px; }
  body.panel form.card > button, body.panel form.card > .row { justify-self:start; }

  /* THE MAIN ADMIN PANEL (CLAUDE.md §40.1 F-40.6): a sidebar grouped by job,
     showing only what this person may open; a phone gets the same menu behind
     one button, with no script. */
  body.panel { display:grid; grid-template-columns:252px minmax(0,1fr); min-height:100vh; }
  .side { position:sticky; top:0; height:100vh; overflow-y:auto; overflow-x:hidden; background:#0a1115;
          border-right:1px solid var(--line); padding:18px 12px; display:flex; flex-direction:column; }
  .side .brand { display:block; padding:4px 10px 8px; }
  .side .brand img { display:block; height:44px; width:auto; }
  .navt { position:absolute; opacity:0; pointer-events:none; }
  .navt-label { display:none; }
  .side nav { display:flex; flex-direction:column; gap:2px; }
  .side .grp { font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
               color:rgba(255,255,255,.38); margin:18px 12px 6px; }
  .side nav a { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:10px;
                color:rgba(255,255,255,.74); text-decoration:none; font-weight:600; font-size:14px; }
  .side nav a svg { width:18px; height:18px; flex:none; }
  .side nav a:hover { background:rgba(255,255,255,.05); color:#fff; }
  .side nav a.on { background:rgba(191,246,66,.12); color:var(--accent); }
  .side .me { margin-top:auto; border-top:1px solid var(--line); padding:14px 12px 4px; display:flex;
              flex-direction:column; gap:10px; font-size:13px; }
  .side .me .who { color:var(--muted); word-break:break-all; }
  .side .me a { display:flex; align-items:center; gap:8px; color:#fff; text-decoration:none; font-weight:600; }
  .side .me a svg { width:16px; height:16px; }
  body.panel main { max-width:1200px; margin:0; padding:32px 40px 80px; min-width:0; }
  body.panel h1 { font-size:26px; letter-spacing:-.01em; margin:0 0 6px; }
  body.panel h2 { font-size:15px; margin:0 0 10px; }
  body.panel main > h2 { font-size:12px; text-transform:uppercase; letter-spacing:.14em; color:var(--muted); margin:32px 0 10px; }
  body.panel form.card { max-width:none; margin:16px 0; }
  body.panel table { background:var(--card); border:1px solid var(--line); border-radius:16px;
                     border-collapse:separate; border-spacing:0; overflow:hidden; }
  body.panel .card table { background:transparent; border:0; border-radius:0; margin-top:4px; }
  body.panel th { background:rgba(255,255,255,.03); }
  body.panel tbody tr:hover td { background:rgba(255,255,255,.025); }
  body.panel tbody tr:last-child td { border-bottom:0; }
  .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin:20px 0; }
  .kpi { display:block; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 18px;
         color:inherit; text-decoration:none; }
  a.kpi:hover { border-color:rgba(191,246,66,.45); }
  .kpi .lbl { font-size:12px; font-weight:600; color:var(--muted); }
  .kpi .val { font-size:28px; font-weight:800; letter-spacing:-.02em; margin-top:6px; font-variant-numeric:tabular-nums;
              overflow-wrap:anywhere; }
  .kpi .sub { font-size:12px; color:var(--muted); margin-top:2px; }
  .todo { display:flex; align-items:center; gap:12px; padding:14px 18px; border-top:1px solid var(--line);
          color:inherit; text-decoration:none; }
  .todo:first-of-type { border-top:0; }
  .todo:hover { background:rgba(255,255,255,.03); }
  .todo .dot { width:10px; height:10px; border-radius:50%; flex:none; background:#f5c451; }
  .todo .dot.bad { background:var(--bad); }
  .todo .go { margin-left:auto; color:var(--accent); font-weight:700; white-space:nowrap; }
  .checklist { list-style:none; padding:0; margin:8px 0 0; display:grid; gap:6px; }
  .checklist li::before { content:'○'; margin-right:8px; color:var(--muted); }
  .checklist li.ok::before { content:'●'; color:#8ee07a; }
  dl.facts { display:grid; grid-template-columns:minmax(120px,max-content) 1fr; gap:8px 18px; margin:0; }
  dl.facts dt { color:var(--muted); font-size:13px; }
  dl.facts dd { margin:0; overflow-wrap:anywhere; }
  .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }
  .grid2 > .card { margin:0; }

  /* An owner's own pages: the owner's menu, never the staff one (F-40.2). */
  header nav.row a.on { color:var(--accent); }

  @media (max-width: 900px) {
    body.panel { display:block; }
    .side { position:sticky; top:0; z-index:5; height:auto; flex-direction:row; flex-wrap:wrap; align-items:center;
            padding:10px 16px; }
    .side .brand { padding:0; }
    .side .brand img { height:34px; }
    .navt-label { display:inline-flex; margin-left:auto; border:1px solid var(--line); border-radius:99px;
                  padding:7px 14px; font-weight:700; cursor:pointer; }
    .side nav, .side .me { display:none; width:100%; }
    .navt:checked ~ nav, .navt:checked ~ .me { display:flex; }
    .navt:focus-visible + .navt-label { outline:2px solid var(--accent); }
    body.panel main { padding:20px 16px 64px; }
    body.panel table { display:block; overflow-x:auto; white-space:nowrap; }
    header { flex-wrap:wrap; }
  }
`;

// Line icons for the sidebar, 24-unit grid, drawn in the text colour.
const ICON_PATHS = {
  today: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  applications: 'M9 3h6v3H9zM8 4.5H5.5v16h13v-16H16M8.5 11h7M8.5 15h5',
  gyms: 'M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 11h.01M15 11h.01',
  owners: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  plans: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  finance: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01',
  security: 'M12 3l8 3v6c0 5-3.5 8.5-8 9.5C7.5 20.5 4 17 4 12V6zM9 12l2 2 4-4',
  audit: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  team: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M22 11h-6',
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  signout: 'M15 12H3M7 8l-4 4 4 4M13 4h6v16h-6',
};

function icon(name) {
  const d = ICON_PATHS[name];
  return d
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`
    : '';
}

/**
 * The staff menu, grouped by job. Each entry names the permission that opens
 * it, and a person sees only what they may open — a link that answers
 * "forbidden" is a dead button (CLAUDE.md §40.1 F-40.2). The routes check the
 * same permissions again; hiding a link is tidiness, not security.
 */
const STAFF_NAV = [
  ['Overview', [['home', '/platform/home', 'Today', null]]],
  ['Onboarding', [['applications', '/platform/applications', 'Applications', 'application.view']]],
  ['Gyms', [
    ['registry', '/platform/registry', 'Gyms', 'gym.view'],
    ['owners', '/platform/owners', 'Owners', 'platform.manage'],
  ]],
  ['Money', [
    ['plans', '/platform/plans', 'Plans and prices', 'subscription.manage'],
    ['finance', '/platform/finance', 'Finances', 'subscription.manage'],
  ]],
  ['Trust', [
    ['security', '/platform/security', 'Security', 'audit.view'],
    ['audit', '/platform/audit', 'Audit log', 'audit.view'],
  ]],
  ['Company', [
    ['team', '/platform/team', 'Team', 'platform.manage'],
    ['settings', '/platform/settings', 'Settings', 'platform.manage'],
  ]],
];

const ICON_FOR = { home: 'today', registry: 'gyms' };

function staffNav(user, active) {
  // No permission list (a page rendered on its own, as the tests do): the
  // whole menu, as before.
  const may = (perm) => !perm || !Array.isArray(user.perms) || user.perms.includes(perm);
  return STAFF_NAV.map(([group, items]) => {
    const shown = items.filter(([, , , perm]) => may(perm));
    if (!shown.length) return '';
    return `<div class="grp">${h(group)}</div>
${shown
  .map(
    ([key, href, label]) =>
      `<a href="${href}"${key === active ? ' class="on" aria-current="page"' : ''}>${icon(ICON_FOR[key] || key)}${h(label)}</a>`
  )
  .join('\n')}`;
  }).join('\n');
}

/**
 * The page shell.
 *
 * `body` is inserted as-is: it is markup the caller has already built and
 * escaped. `title` is escaped, because it can carry a gym name.
 */
export function layout({
  title = 'Yoyo Gyms',
  body = '',
  user = null,
  indexable = false,
  bare = false,
  bodyClass = 'auth',
  active = '',
}) {
  // noindex is right for the staff panel and WRONG for the two public pages.
  // A signup page nobody can find is a signup page nobody uses, so `indexable`
  // is opt-in per page rather than a blanket rule.
  const robots = indexable ? 'index,follow' : 'noindex,nofollow';
  const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${robots}">
<title>${h(title)} · Yoyo Gyms</title>
<style>${STYLE}</style>
</head>
`;

  // A sign-in page stands alone: no panel header, the brand instead.
  if (bare) {
    return `${head}<body class="${bodyClass}">
<main>
${body}
</main>
</body>
</html>`;
  }

  // Yoyo staff: the main admin panel.
  if (user && user.kind !== 'gym_owner') {
    return `${head}<body class="panel">
<aside class="side">
  <a class="brand" href="/platform/home"><img src="${LOGO_ON_DARK}" width="720" height="531" alt="Yoyo Gyms"></a>
  <input type="checkbox" id="navt" class="navt" aria-label="Show the menu">
  <label for="navt" class="navt-label">Menu</label>
  <nav aria-label="Main admin panel">
${staffNav(user, active)}
  </nav>
  <div class="me">
    <span class="who">${h(user.email)}</span>
    <a href="/platform/account"${active === 'account' ? ' aria-current="page"' : ''}>${icon('account')}Your account</a>
    <a href="/platform/logout">${icon('signout')}Sign out</a>
  </div>
</aside>
<main>
${body}
</main>
</body>
</html>`;
  }

  // A gym owner, or nobody signed in: the brand, and for an owner their own
  // two links — never the staff menu (CLAUDE.md §40.1 F-40.2).
  const owner = Boolean(user);
  return `${head}<body>
<header>
  <a class="brand" href="${owner ? '/platform/my-gym' : '/platform/welcome'}"><img src="${LOGO_ON_DARK}" width="720" height="531" alt="Yoyo Gyms"></a>
  ${
    owner
      ? `<nav class="row">
    <a href="/platform/my-gym"${active === 'my-gym' ? ' class="on"' : ''}>My gym</a>
    <a href="/platform/logout">Sign out</a>
  </nav>`
      : ''
  }
  <span class="muted">${owner ? h(user.email) : ''}</span>
</header>
<main>
${body}
</main>
</body>
</html>`;
}

/**
 * Sign-in. Password and the second factor together.
 *
 * ONE form, two audiences, because the server decides who is who (login.js).
 * The Yoyo staff panel is the default (CLAUDE.md §36.1 Q8). A gym owner
 * checking their application arrives from the app with `?as=owner` and is not
 * told they are at the "platform administrator" login.
 */
export function loginPage({ error = '', audience = 'staff' } = {}) {
  const owner = audience === 'owner';
  return layout({
    title: owner ? 'Gym owner account' : 'Platform administrator login',
    bare: true,
    body: `
<img class="auth-logo" src="${LOGO_ON_DARK}" width="720" height="531" alt="Yoyo Gyms">
<form class="card" method="post" action="/platform/login">
  <h1>${owner ? 'Gym owner account' : 'Yoyo Gyms Platform'}</h1>
  <p class="muted auth-sub">${owner ? 'Your application, documents and subscription.' : 'Platform administrator login'}</p>
  ${owner ? '<input type="hidden" name="as" value="owner">' : ''}
  ${error ? `<p class="err">${h(error)}</p>` : ''}
  <label>Email
    <input type="email" name="email" autocomplete="username" required>
  </label>
  <label>Password
    <input type="password" name="password" autocomplete="current-password" required>
  </label>
  <label>${owner ? 'Authentication code <span class="muted">(if you have set one up)</span>' : 'Authentication code'}
    <input type="text" name="totp" inputmode="numeric" autocomplete="one-time-code"
           placeholder="6 digits">
  </label>
  <button type="submit">Sign in</button>
  <p class="auth-links"><a href="/platform/forgot">Forgot password?</a></p>
  <p class="muted auth-links">Lost your device? Use a recovery code in place of the authentication code.</p>
</form>
${owner ? '' : '<p class="muted auth-foot">Gym owner? <a href="/platform/login?as=owner">Sign in to your owner account</a></p>'}
<p class="muted auth-foot">Gym member? You sign in at your own gym — <a href="/platform/find">find your gym</a>.</p>
<p class="muted auth-foot"><a href="/platform/privacy">Privacy policy</a> · <a href="/platform/delete-account">Delete your account</a></p>`,
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

// Coloured by what the state MEANS, so a healthy gym and a suspended one no
// longer look the same at a glance (CLAUDE.md §40.1 F-40.6).
const STATUS_TONE = {
  active: 'good', approved: 'good', accepted: 'good', paid: 'good', healthy: 'good', ready: 'good',
  included: 'good', on: 'good', done: 'good', off: 'muted', draft: 'muted',
  submitted: 'warn', under_review: 'warn', info_requested: 'warn', pending: 'warn', past_due: 'warn', issued: 'warn',
  invited: 'warn',
  trialing: 'info',
  rejected: 'bad', suspended: 'bad', cancelled: 'bad', failed: 'bad', overdue: 'bad', 'asked to close': 'bad',
  'switched off': 'bad',
};

const statusTag = (status) =>
  `<span class="tag${STATUS_TONE[status] ? ` tag--${STATUS_TONE[status]}` : ''}">${h(String(status ?? '').replace(/_/g, ' '))}</span>`;

/**
 * The review queue, in tabs by what each application is waiting for, with a
 * search (CLAUDE.md §40.1 F-40.6).
 */
export const APPLICATION_TABS = [
  ['review', 'To review', ['submitted', 'under_review']],
  // A draft has not been sent: the owner is still uploading (CLAUDE.md §42).
  ['owner', 'Waiting on the owner', ['info_requested', 'draft']],
  ['approved', 'Approved', ['approved']],
  ['rejected', 'Rejected', ['rejected']],
  ['all', 'All', []],
];

export function applicationsPage({ applications = [], user = null, tab = 'review', counts = null, query = '' } = {}) {
  const tabCount = (states) =>
    counts ? (states.length ? states : Object.keys(counts)).reduce((n, s) => n + (counts[s] || 0), 0) : null;

  const tabs = `<nav class="row" aria-label="Application states" style="margin:18px 0 4px">
${APPLICATION_TABS.map(([key, label, states]) => {
  const n = tabCount(states);
  const href = `/platform/applications?tab=${key}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
  return `  <a class="btn${key === tab ? '' : ' ghost'}" href="${h(href)}">${h(label)}${n === null ? '' : ` <span>${h(n)}</span>`}</a>`;
}).join('\n')}
</nav>`;

  const body = applications.length
    ? `<table>
  <thead><tr><th>Gym</th><th>City</th><th>Plan</th><th>Status</th><th>Submitted</th></tr></thead>
  <tbody>
${applications
  .map(
    (a) => `    <tr>
      <td><a href="/platform/applications/${h(a.id)}"><b>${h(a.proposed_gym_name || 'Unnamed')}</b></a></td>
      <td>${h(a.city)}${a.country ? ` <span class="muted">${h(a.country)}</span>` : ''}</td>
      <td>${h(a.requested_plan_key || '—')}</td>
      <td>${statusTag(a.status)}</td>
      <td class="muted">${h(when(a.submitted_at))}</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">${
        query
          ? 'No applications match that search.'
          : tab === 'review'
            ? 'No applications waiting for review.'
            : 'No applications here.'
      }</div>`;

  return layout({
    active: 'applications',
    title: 'Applications',
    user,
    body: `<h1>Applications</h1>
<p class="lede">Every gym is reviewed by a person before it appears in app search. A gym is approved
once its ID, business registration and proof of address have each been accepted.</p>
${tabs}
<form class="card row" method="get" action="/platform/applications">
  <input type="hidden" name="tab" value="${h(tab)}">
  <label style="flex:1">Search<input name="q" value="${h(query)}" placeholder="gym name or city"></label>
  <button type="submit">Search</button>
</form>
${body}`,
  });
}

/** One required document's line on the checklist. */
function requiredLine(type, documents) {
  const ofType = documents.filter((d) => d.doc_type === type);
  const accepted = ofType.some((d) => d.status === 'accepted');
  const waiting = ofType.some((d) => d.status === 'pending');
  const state = accepted
    ? 'accepted'
    : waiting
      ? 'uploaded — waiting for you to check it'
      : ofType.length
        ? 'rejected — waiting for a new file'
        : 'not uploaded yet';
  return `<li class="${accepted ? 'ok' : ''}"><b>${h(DOCUMENT_LABELS[type] || type)}</b> <span class="muted">· ${h(state)}</span></li>`;
}

/** One application: who applied, their documents, the history, and the decision. */
export function applicationDetailPage({
  application,
  applicant = null,
  documents = [],
  events = [],
  user = null,
  csrfToken = '',
}) {
  const missing = missingRequiredDocuments(documents);

  const docs = documents.length
    ? `<table>
  <thead><tr><th>Document</th><th>File</th><th>Status</th><th>Decide</th></tr></thead>
  <tbody>
${documents
  .map(
    (d) => `    <tr>
      <td>${h(DOCUMENT_LABELS[d.doc_type] || d.doc_type)}${
        REQUIRED_DOCUMENTS.includes(d.doc_type) ? ' <span class="muted">· required</span>' : ''
      }</td>
      <td><a href="/platform/documents/${h(d.id)}">${h(d.filename || 'open')}</a></td>
      <td>${statusTag(d.status)}${d.reject_reason ? `<br><span class="muted">${h(d.reject_reason)}</span>` : ''}</td>
      <td>${
        d.status === 'pending'
          ? `<form method="post" action="/platform/documents/${h(d.id)}/decide" class="row">
        <input type="hidden" name="csrf" value="${h(csrfToken)}">
        <button type="submit" name="action" value="accept">Accept</button>
        <input name="reason" placeholder="Reason, if rejecting">
        <button type="submit" name="action" value="reject" class="ghost">Reject</button>
      </form>`
          : '<span class="muted">decided</span>'
      }</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>
<p class="muted">Open a document to see it beside what the applicant told us. Opening one is recorded
in the audit log: who opened it, and when.</p>`
    : `<div class="empty">No documents uploaded yet.</div>`;

  const history = events.length
    ? `<ul class="events">
${events
  .map(
    (e) => `  <li><b>${h(String(e.event || '').replace(/_/g, ' '))}</b> <span class="muted">${h(exact(e.created_at))}</span>${
      e.reason ? `<br>${h(e.reason)}` : ''
    }</li>`
  )
  .join('\n')}
</ul>`
    : `<p class="muted">No history yet.</p>`;

  const decided = ['approved', 'rejected'].includes(application.status);
  const a = application;

  const who = `<div class="card">
  <h2>Applicant</h2>
  <dl class="facts">
    <dt>Owner</dt><dd>${h(applicant?.full_name || '—')}</dd>
    <dt>Email</dt><dd>${applicant?.email ? `<a href="mailto:${h(applicant.email)}">${h(applicant.email)}</a>` : '—'}</dd>
    <dt>Phone</dt><dd>${a.owner_phone ? `<a href="tel:${h(a.owner_phone)}">${h(a.owner_phone)}</a>` : '<span class="muted">not given</span>'}</dd>
    <dt>Plan</dt><dd>${h(a.requested_plan_key || '—')}</dd>
    <dt>Expected members</dt><dd>${h(a.estimated_members ?? '—')}</dd>
    <dt>Applied</dt><dd>${h(exact(a.submitted_at)) || '—'}</dd>
  </dl>
</div>`;

  const gym = `<div class="card">
  <h2>Gym</h2>
  <dl class="facts">
    <dt>Name</dt><dd><b>${h(a.proposed_gym_name || '—')}</b></dd>
    <dt>Street address</dt><dd>${h(a.gym_address) || '<span class="muted">not given</span>'}</dd>
    <dt>City</dt><dd>${h(a.city) || '—'}${a.country ? `, ${h(a.country)}` : ''}</dd>
    <dt>Search name</dt><dd class="muted">${h(a.slug || '—')}</dd>
    <dt>What they need</dt><dd>${h(a.owner_needs) || '<span class="muted">nothing added</span>'}</dd>
  </dl>
</div>`;

  const checklist = `<div class="card">
  <h2>Required before approval</h2>
  <ul class="checklist">
    ${REQUIRED_DOCUMENTS.map((t) => requiredLine(t, documents)).join('\n    ')}
  </ul>
  ${
    missing.length
      ? '<p class="muted">Approve becomes available once all three are accepted.</p>'
      : '<p class="muted">All three are accepted.</p>'
  }
</div>`;

  // The LATEST build attempt, whatever order the events arrive in.
  const lastBuild = [...events]
    .filter((e) => e.event === 'provisioned' || e.event === 'provision_failed')
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0];
  const buildFailed = a.status === 'approved' && lastBuild?.event === 'provision_failed';
  const retry = buildFailed
    ? `<form class="card" method="post" action="/platform/applications/${h(a.id)}/decide" style="border-left:4px solid var(--bad)">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>The gym was not fully created</h2>
  <p>Approved, but building the gym stopped${lastBuild.detail?.failed_at ? ` at <b>${h(lastBuild.detail.failed_at)}</b>` : ''}${
      lastBuild.detail?.error ? `: <span class="muted">${h(lastBuild.detail.error)}</span>` : '.'
    }</p>
  <p class="muted">The owner has not been emailed yet. Trying again finishes the gym from where it stopped —
  nothing already built is made twice — and then emails the owner their activation link.</p>
  <button type="submit" name="action" value="retry_provision">Try again</button>
</form>`
    : '';

  const decision = a.status === 'draft'
    ? `<div class="card"><h2>Not sent yet</h2><p class="muted">The owner is still uploading their documents and
checking what they wrote. Nothing can be decided until they press Submit; it then appears under
<a href="/platform/applications">To review</a>.</p></div>`
    : decided
    ? `<div class="card"><p class="muted">This application has been decided. Decisions are final; the owner
may submit a new application.${
        a.status === 'approved' && a.slug
          ? ` <a href="/platform/registry?q=${h(encodeURIComponent(a.slug))}">Find the gym in the registry →</a>`
          : ''
      }</p></div>`
    : `<form class="card" method="post" action="/platform/applications/${h(a.id)}/decide">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Decision</h2>
  <label>Message to the owner
    <textarea name="reason" rows="3" placeholder="Required to reject or to ask for more. The owner is emailed this."></textarea>
  </label>
  <div class="row">
    <button type="submit" name="action" value="approve"${missing.length ? ' disabled' : ''}>Approve and provision</button>
    <button type="submit" name="action" value="request_info" class="ghost">Request information</button>
    <button type="submit" name="action" value="reject" class="danger">Reject</button>
  </div>
  <p class="muted">${
    missing.length
      ? `Approve is unavailable until the required documents are accepted: ${h(
          missing.map((t) => DOCUMENT_LABELS[t] || t).join(', ')
        )}.`
      : 'Approving creates this gym and emails the owner their activation link.'
  } Rejecting, or asking for more, emails the owner your message.</p>
</form>`;

  return layout({
    active: 'applications',
    title: a.proposed_gym_name || 'Application',
    user,
    body: `<p><a href="/platform/applications">← All applications</a></p>
<h1>${h(a.proposed_gym_name || 'Application')}</h1>
<p class="row">${statusTag(a.status)} <span class="muted">${h(a.city)} ${h(a.country)}</span></p>
${a.decision_reason ? `<div class="card"><b>Reason given:</b> ${h(a.decision_reason)}</div>` : ''}
${
  a.status === 'info_requested' && a.review_notes
    ? `<div class="card"><b>Asked of the owner:</b> ${h(a.review_notes)}</div>`
    : ''
}

<div class="grid2">
${who}
${gym}
</div>

${retry}

${checklist}

<h2>Documents</h2>
${docs}

${decision}

<h2>History</h2>
${history}`,
  });
}

// ---------------------------------------------------------------------------
// Public: gym-owner application
// ---------------------------------------------------------------------------

function planPrice(plan) {
  if (!plan.price) return '<span class="muted">Price on request</span>';
  const amount = Math.round(plan.price / 100).toLocaleString('en-ZA');
  const money = plan.currency && plan.currency !== 'ZAR' ? `${h(plan.currency)} ${amount}` : `R${amount}`;
  return `${money}<span class="muted"> / month</span>`;
}

/**
 * One plan, as a gym owner chooses it: the price the main admin set, what
 * their members get, what they get, and what Yoyo Gyms commits to (§41.1 Q6).
 * From the second plan on, only what it ADDS is listed — "everything in
 * Basic, plus" reads; the same forty lines three times does not.
 */
function planCard(plan, { selected = false, previous = null, recommended = false } = {}) {
  const adds = (list, prev) => (prev ? list.filter((x) => !prev.includes(x)) : list);
  const members = adds(plan.memberBenefits, previous?.memberBenefits);
  const tools = adds(plan.included, previous?.included);
  const lead = previous ? `<li class="plan-lead">Everything in ${h(previous.label)}, plus:</li>` : '';

  return `
<label class="plan${recommended ? ' plan-rec' : ''}">
  ${recommended ? '<span class="plan-badge">Recommended</span>' : ''}
  <input type="radio" name="plan" value="${h(plan.key)}"${selected ? ' checked' : ''} required>
  <b class="plan-name">${h(plan.label)}</b>
  <span class="plan-price">${planPrice(plan)}</span>
  <span class="plan-limit">${h(plan.memberLimit)}</span>
  ${plan.summary ? `<p class="muted plan-sum">${h(plan.summary)}</p>` : ''}

  <p class="plan-sub">Your members get</p>
  <ul>${lead}${members.map((b) => `<li>${h(b)}</li>`).join('')}</ul>

  <p class="plan-sub">You get</p>
  <ul>${lead}${tools.map((f) => `<li>${h(f)}</li>`).join('')}</ul>

  <p class="plan-sub">Our support</p>
  <ul class="plan-support">${(plan.support || []).map((s) => `<li>${h(s)}</li>`).join('')}</ul>
  <span class="plan-pick">${selected ? 'Selected' : 'Choose'} ${h(plan.label)}</span>
</label>`;
}

const SIGNUP_STYLE = `
  main { max-width:1120px; }
  .apply-hero { text-align:center; padding:24px 0 8px; }
  .apply-hero .eyebrow { color:var(--accent); font-weight:800; letter-spacing:.14em; text-transform:uppercase; font-size:12px; margin:0 0 10px; }
  .apply-hero h1 { font-size:clamp(28px,5vw,44px); line-height:1.1; margin:0 0 12px; letter-spacing:-.02em; }
  .apply-hero .lede { max-width:640px; margin:0 auto; font-size:17px; }
  .trust { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin:22px 0 8px; }
  .trust span { border:1px solid var(--line); border-radius:99px; padding:8px 14px; font-weight:700; font-size:14px; }
  .trust span::before { content:'✓ '; color:var(--accent); }
  .apply-h2 { font-size:12px; text-transform:uppercase; letter-spacing:.14em; color:var(--muted); margin:40px 0 14px; }
  .includes { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); }
  .includes div { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 18px; }
  .includes b { display:block; margin-bottom:4px; }
  .includes p { margin:0; color:var(--muted); font-size:14px; }
  .plans { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); margin:0 0 8px; align-items:start; }
  .plan { position:relative; display:flex; flex-direction:column; gap:2px; background:var(--card); border:1px solid var(--line);
          border-radius:20px; padding:22px; cursor:pointer; color:var(--ink); font-size:15px; }
  .plan input[type=radio] { position:absolute; opacity:0; pointer-events:none; }
  .plan:has(input:checked) { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent); }
  .plan:focus-within { outline:2px solid var(--accent); outline-offset:2px; }
  .plan-rec { border-color:rgba(191,246,66,.45); }
  .plan-badge { position:absolute; top:-12px; left:22px; background:var(--accent); color:var(--accent-ink); font-size:12px;
                font-weight:800; border-radius:99px; padding:4px 12px; }
  .plan-name { font-size:20px; }
  .plan-price { font-size:30px; font-weight:800; letter-spacing:-.02em; margin-top:6px; }
  .plan-price .muted { font-size:14px; font-weight:500; }
  .plan-limit { font-weight:700; font-size:14px; }
  .plan-sum { margin:8px 0 0; }
  .plan-sub { font-size:12px; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); margin:16px 0 6px; font-weight:700; }
  .plan ul { list-style:none; margin:0; padding:0; display:grid; gap:6px; font-size:14px; }
  .plan li { padding-left:22px; position:relative; }
  .plan li::before { content:'✓'; position:absolute; left:0; color:var(--accent); font-weight:800; }
  .plan li.plan-lead { padding-left:0; font-weight:700; }
  .plan li.plan-lead::before { content:''; }
  .plan-pick { margin-top:18px; text-align:center; border:1px solid var(--line); border-radius:99px; padding:12px; font-weight:800; }
  .plan:has(input:checked) .plan-pick { background:var(--accent); color:var(--accent-ink); border-color:var(--accent); }
  form.wide { max-width:none; margin:0; display:grid; gap:14px; }
  .apply-card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:24px; display:grid; gap:14px; }
  .terms-list { list-style:none; margin:0; padding:0; display:grid; gap:10px; }
  .terms-list li b { display:block; }
  .terms-list li span { color:var(--muted); font-size:14px; }
  .agree { display:flex; gap:12px; align-items:flex-start; font-size:15px; color:var(--ink); cursor:pointer;
           border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  .agree input { width:22px; height:22px; margin-top:1px; flex:none; }
  .draft { display:inline-block; font-size:12px; font-weight:800; color:#f5c451; border:1px solid rgba(245,196,81,.4);
           border-radius:99px; padding:2px 10px; margin-left:8px; }
  .submit-row button { min-height:56px; font-size:17px; width:100%; }
  .two { display:grid; gap:12px; grid-template-columns:1fr 1fr; }
  @media (max-width:560px){ .two { grid-template-columns:1fr; } }
`;

/** The opening sentence of an agreement section, for the key-terms list. */
function firstSentence(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
}

/**
 * The gym-owner registration page (CLAUDE.md §41.1 Q2, Q5, Q6): what every
 * plan includes, the plans themselves as the main admin set them, and the key
 * terms with a required "I agree". Every line on it is something the product
 * or the team actually does.
 */
export function signupPage({
  plans = [],
  values = {},
  error = '',
  selectedPlan = '',
  terms = [],
  termsApproved = false,
  includes = [],
  // A signed-in owner correcting their own draft (CLAUDE.md §42): the account
  // exists and the agreement was accepted, so neither is asked again.
  editing = false,
  email = '',
  csrfToken = '',
} = {}) {
  const chosen = selectedPlan || (plans.find((p) => p.key === 'medium') ? 'medium' : plans[0]?.key || '');

  return layout({
    title: 'List your gym',
    indexable: true, // the front door — it must be findable
    body: `<style>${SIGNUP_STYLE}</style>
<section class="apply-hero">
  <p class="eyebrow">For gym owners</p>
  <h1>Bring your gym to Yoyo Gyms</h1>
  <p class="muted lede">Your own branded member app, check-in at the door, payments, classes and more —
  and we set it up with you. Your first 30 days are free.</p>
  <div class="trust"><span>Verified gyms only</span><span>30 days free</span><span>Setup help included</span><span>Your data kept separate</span></div>
</section>
<style>${APPLY_STEP_STYLE}</style>
${applySteps(1)}

${
  includes.length
    ? `<h2 class="apply-h2">Every plan includes</h2>
<div class="includes">
${includes.map(([title, text]) => `  <div><b>${h(title)}</b><p>${h(text)}</p></div>`).join('\n')}
</div>`
    : ''
}

${error ? `<p class="err" role="alert" style="margin-top:24px">${h(error)}</p>` : ''}

<form class="wide" method="post" action="/platform/apply">
  ${editing ? `<input type="hidden" name="editing" value="1"><input type="hidden" name="csrf" value="${h(csrfToken)}">` : ''}
  <h2 class="apply-h2">1. Choose your plan</h2>
  <div class="plans">
    ${plans
      .map((p, i) =>
        planCard(p, { selected: chosen === p.key, previous: i > 0 ? plans[i - 1] : null, recommended: p.key === 'medium' })
      )
      .join('')}
  </div>
  <p class="muted">You can move to another plan at any time. Moving down never deletes a member.</p>

  <h2 class="apply-h2">2. About you and your gym</h2>
  <div class="apply-card">
    ${
      editing
        ? `<label>Your name
        <input name="owner_name" required autocomplete="name" value="${h(values.owner_name)}">
      </label>
      <p class="muted">Signed in as <b>${h(email)}</b>. Your email and password stay as they are.</p>`
        : `<div class="two">
      <label>Your name
        <input name="owner_name" required autocomplete="name" value="${h(values.owner_name)}">
      </label>
      <label>Your email
        <input type="email" name="email" required autocomplete="email" value="${h(values.email)}">
      </label>
    </div>`
    }

    <div class="two">
      ${
        editing
          ? ''
          : `<label>Choose a password
        <input type="password" name="password" required minlength="10" autocomplete="new-password">
        <span class="muted">At least 10 characters. You will use it to finish and follow your application, from any device.</span>
      </label>`
      }
      <label>Your phone number
        <input type="tel" name="phone" required autocomplete="tel" placeholder="+27 82 123 4567" value="${h(values.phone)}">
        <span class="muted">With the country code. We call if anything needs checking.</span>
      </label>
    </div>

    <div class="two">
      <label>Gym name
        <input name="gym_name" required value="${h(values.gym_name)}">
        <span class="muted">This is the name your members will search for.</span>
      </label>
      <label>Gym street address
        <input name="address" required autocomplete="street-address" value="${h(values.address)}">
        <span class="muted">Where members train. It should match your proof of address.</span>
      </label>
    </div>

    <div class="two">
      <label>City
        <input name="city" required value="${h(values.city)}">
      </label>
      <label>Country
        <input name="country" maxlength="2" placeholder="ZA" required value="${h(values.country)}">
      </label>
    </div>

    <label>Roughly how many members?
      <input type="number" name="estimated_members" min="0" value="${h(values.estimated_members)}">
    </label>

    <label>Is there anything your gym needs that this does not do?
      <textarea name="needs" rows="3" placeholder="Optional — but it genuinely shapes what we build next.">${h(values.needs)}</textarea>
    </label>
  </div>

  ${
    editing
      ? ''
      : `<h2 class="apply-h2">3. The agreement</h2>
  <div class="apply-card">
    <p><b>Gym Owner Agreement — the key terms</b>${termsApproved ? '' : '<span class="draft">DRAFT</span>'}</p>
    <ul class="terms-list">
      ${terms.map((t) => `<li><b>${h(t.heading || t.title)}</b><span>${h(firstSentence(t.body))}</span></li>`).join('\n      ')}
    </ul>
    <p><a href="/platform/terms" target="_blank" rel="noopener">Read the full Gym Owner Agreement →</a></p>
    <label class="agree">
      <input type="checkbox" name="accept_terms" value="yes" required${values.accept_terms === 'yes' ? ' checked' : ''}>
      <span>I have read and agree to the Gym Owner Agreement.</span>
    </label>
    <p class="muted">Next you upload three documents — a PDF, or a photo from your phone: <b>your ID</b>,
    <b>your business registration</b> and <b>proof of the gym's address</b>. Then you check everything and
    submit. Nothing is sent until you do.</p>
  </div>`
  }

  <div class="submit-row"><button type="submit">${editing ? 'Save and continue' : 'Continue — upload your documents'}</button></div>
</form>`,
  });
}

export function signupSuccessPage({ gymName = '', emailed = true, user = null } = {}) {
  return layout({
    title: 'Application sent',
    user,
    body: `<style>${SIGNUP_STYLE}${APPLY_STEP_STYLE}</style>
${applySteps(4)}
<h1>Application sent</h1>
<p>Thank you — your application for <b>${h(gymName)}</b> and its documents are with us.${
      emailed ? ' We have emailed you a confirmation.' : ''
    }</p>

<div class="card">
  <h2>What happens next</h2>
  <ol>
    <li><b>A person checks it.</b> Your details and each document, by hand. It is not instant.</li>
    <li><b>We email you the decision.</b> If anything is missing, we tell you exactly what.</li>
    <li><b>Once approved,</b> we email you an activation link and a code. Using them opens your gym and
    gives you your own gym admin panel.</li>
  </ol>
</div>
<p><a class="btn" href="/platform/my-gym">Follow your application →</a></p>
<p class="muted">Your gym will not appear in member search until it is approved and live.</p>`,
  });
}

// ---------------------------------------------------------------------------
// The application, step by step (CLAUDE.md §42): details → documents → check
// and submit. Nothing reaches a reviewer until the owner presses Submit.
// ---------------------------------------------------------------------------

const APPLY_STEP_STYLE = `
  .steps { display:flex; gap:10px; list-style:none; padding:0; margin:20px 0 28px; }
  .steps li { flex:1; border-top:4px solid var(--line); padding-top:10px; font-weight:700; color:var(--muted); font-size:14px; }
  .steps li.on { border-color:var(--accent); color:var(--ink); }
  .steps li.done { border-color:var(--accent); }
  .docs { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); }
  .doc-box { position:relative; background:var(--card); border:1px solid var(--line); border-radius:20px; padding:20px; display:grid; gap:10px; align-content:start; }
  .doc-box.done { border-color:rgba(191,246,66,.55); }
  .doc-box.bad { border-color:rgba(255,107,107,.6); }
  .doc-box.busy { opacity:.7; pointer-events:none; }
  .doc-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .doc-head b { font-size:17px; }
  .req { font-size:12px; font-weight:800; color:var(--accent-ink); background:var(--accent); border-radius:99px; padding:3px 10px; }
  .doc-file { margin:0; word-break:break-word; }
  .doc-file::before { content:'✓ '; color:var(--accent); font-weight:800; }
  .upload-btn { position:relative; display:flex; align-items:center; justify-content:center; gap:8px; min-height:56px; border:2px dashed var(--line);
                border-radius:16px; font-weight:800; cursor:pointer; color:var(--ink); text-align:center; padding:8px 12px; }
  .upload-btn:hover, .upload-btn:focus-within { border-color:var(--accent); }
  .upload-btn input { position:absolute; opacity:0; width:1px; height:1px; }
  .doc-note { margin:0; min-height:1.2em; }
  .optional { margin-top:18px; }
  .optional summary { cursor:pointer; font-weight:800; min-height:44px; display:flex; align-items:center; }
  .optional summary::before { content:'+'; font-size:22px; width:22px; margin-right:8px; color:var(--accent); }
  .optional[open] summary::before { content:'–'; }
  .cta { display:flex; align-items:center; justify-content:center; min-height:56px; font-size:17px; width:100%; border-radius:99px; }
  a.cta { background:var(--accent); color:var(--accent-ink); font-weight:800; text-decoration:none; }
  .review-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
  .review-head h2 { margin:0; }
  .review-head a { font-weight:800; min-height:44px; display:inline-flex; align-items:center; }
`;

/** Where the owner is: 1 details, 2 documents, 3 check and submit, 4 sent. */
function applySteps(at) {
  const step = (n, label) =>
    `<li class="${n === at ? 'on' : n < at ? 'done' : ''}"${n === at ? ' aria-current="step"' : ''}>${n}. ${label}</li>`;
  return `<ol class="steps" aria-label="Your application">${step(1, 'Your details')}${step(2, 'Documents')}${step(3, 'Check and submit')}</ol>`;
}

/** What each document is, in the owner's words. */
const DOCUMENT_HINTS = {
  id_document: 'Your passport or national ID card — the side with your photo, all four corners in the picture.',
  business_registration: 'The certificate that registers the business that runs the gym.',
  proof_of_address: "A recent utility bill, lease or municipal account showing the gym's street address.",
  tax_clearance: 'A tax clearance certificate, if you have one.',
  insurance: 'Your public liability or business insurance, if you have it.',
  lease_agreement: 'The lease for the gym premises, if you rent them.',
  other_supporting: 'Anything else that helps us check your gym.',
};

const OPTIONAL_DOCUMENTS = ['tax_clearance', 'insurance', 'lease_agreement', 'other_supporting'];

function fileSize(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** The newest file of one type (documents arrive oldest first). */
function latestOf(type, documents) {
  const ofType = documents.filter((d) => d.doc_type === type);
  return ofType[ofType.length - 1] || null;
}

function docBox(type, documents, { required }) {
  const latest = latestOf(type, documents);
  const rejected = latest?.status === 'rejected';
  const done = latest && !rejected;
  return `<div class="doc-box${done ? ' done' : ''}${rejected ? ' bad' : ''}">
  <div class="doc-head"><b>${h(DOCUMENT_LABELS[type] || type)}</b>${required ? '<span class="req">Required</span>' : '<span class="muted">Optional</span>'}</div>
  <p class="muted" style="margin:0">${h(DOCUMENT_HINTS[type] || '')}</p>
  ${
    done
      ? `<p class="doc-file"><a href="/platform/apply/documents/${h(latest.id)}" target="_blank" rel="noopener">${h(latest.filename || 'Your file')}</a> <span class="muted">${h(fileSize(latest.size_bytes))}</span></p>`
      : ''
  }
  ${rejected ? `<p class="err" style="margin:0">Not accepted${latest.reject_reason ? `: ${h(latest.reject_reason)}` : ''} — please upload a new one.</p>` : ''}
  <label class="upload-btn">
    <input type="file" accept="application/pdf,image/*" data-type="${h(type)}">
    <span>${done ? 'Replace' : 'Upload'} — PDF or photo</span>
  </label>
  <p class="doc-note muted" aria-live="polite"></p>
</div>`;
}

/**
 * Step 2 — one upload box per document (CLAUDE.md §42). Works on any device:
 * on a phone the box offers the camera, the photo library and files.
 *
 * A PHOTO IS CONVERTED TO JPEG ON THE DEVICE before it is sent (§42.1 F-42.3).
 * An iPhone photo can be HEIC, which Chrome on a Windows computer cannot show,
 * so the reviewer would have had nothing to look at. It is also shrunk to at
 * most 2400 px — still sharp enough to read an ID number — so it uploads on a
 * weak signal. A PDF is sent exactly as it is.
 */
export function applyDocumentsPage({ application, documents = [], csrfToken = '', user = null } = {}) {
  const have = REQUIRED_DOCUMENTS.filter((t) => {
    const latest = latestOf(t, documents);
    return latest && latest.status !== 'rejected';
  }).length;
  const ready = have === REQUIRED_DOCUMENTS.length;
  const optionalUploaded = OPTIONAL_DOCUMENTS.some((t) => latestOf(t, documents));
  // Into a <script>: JSON, with "<" escaped so no value can close the tag.
  const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

  return layout({
    title: 'Upload your documents',
    user,
    body: `<style>${SIGNUP_STYLE}${APPLY_STEP_STYLE}</style>
${applySteps(2)}
<h1>Upload your documents</h1>
<p class="muted">For <b>${h(application.proposed_gym_name || 'your gym')}</b>. A PDF, or a clear photo — take one with
your phone's camera or choose a file. Up to 10 MB each. We look at every document by hand.</p>

<div class="docs">
${REQUIRED_DOCUMENTS.map((t) => docBox(t, documents, { required: true })).join('\n')}
</div>

<details class="optional"${optionalUploaded ? ' open' : ''}>
  <summary>Optional documents — they can speed up the review</summary>
  <div class="docs">
${OPTIONAL_DOCUMENTS.map((t) => docBox(t, documents, { required: false })).join('\n')}
  </div>
</details>

<p class="muted" style="margin-top:24px"><b>${have} of ${REQUIRED_DOCUMENTS.length}</b> required documents uploaded.</p>
<div class="submit-row">${
      ready
        ? '<a class="cta" href="/platform/apply/review">Continue — check and submit</a>'
        : '<button class="cta" type="button" disabled>Upload the three required documents to continue</button>'
    }</div>
<p><a href="/platform/apply">← Back to your details</a></p>

<script>
(function () {
  var CSRF = ${js(csrfToken)};
  var APPLICATION = ${js(application.id)};
  var MAX = ${MAX_DOCUMENT_BYTES};

  function isHeic(file) { return /\\.(heic|heif)$/i.test(file.name || '') || /heic|heif/i.test(file.type || ''); }

  // A photo becomes a JPEG any computer can show; a PDF is left alone.
  function asJpeg(file) {
    return new Promise(function (resolve) {
      if (!/^image\\//.test(file.type || '') && !isHeic(file)) return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
        var k = Math.min(1, 2400 / longest);
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * k);
        canvas.height = Math.round(img.naturalHeight * k);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) return resolve(file);
          var name = (file.name || 'photo').replace(/\\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.88);
      };
      // This browser cannot read it (a HEIC outside Safari): send the original.
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function post(url, params) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  }

  async function send(input) {
    var box = input.closest('.doc-box');
    var note = box.querySelector('.doc-note');
    var file = input.files && input.files[0];
    if (!file) return;
    box.classList.add('busy');
    note.textContent = 'Preparing…';
    try {
      file = await asJpeg(file);
      var type = file.type || (isHeic(file) ? 'image/heic' : '');
      if (file.size > MAX) { note.textContent = 'That file is larger than 10 MB. Please send a smaller scan or photo.'; return; }

      var params = new URLSearchParams({
        csrf: CSRF, application_id: APPLICATION, doc_type: input.dataset.type,
        filename: file.name, mime_type: type, size_bytes: String(file.size)
      });

      // 1. The server decides WHERE it goes.
      var ask = await post('/platform/my-gym/documents/request', params);
      var target = await ask.json().catch(function () { return {}; });
      if (!ask.ok) { note.textContent = target.error || 'That file was not accepted.'; return; }

      // 2. The bytes go straight to private storage, never through our server.
      note.textContent = 'Uploading…';
      var put = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': type, Authorization: 'Bearer ' + target.token },
        body: file
      });
      if (!put.ok) { note.textContent = 'The upload did not finish. Please try again.'; return; }

      // 3. Recorded, so a reviewer can find it.
      params.set('storage_ref', target.path);
      params.set('respond', 'json');
      var done = await post('/platform/my-gym/documents/confirm', params);
      if (!done.ok) { note.textContent = 'We could not record that upload. Please try again.'; return; }

      note.textContent = 'Uploaded ✓';
      location.reload();
    } catch (err) {
      note.textContent = 'Something went wrong. Please check your connection and try again.';
    } finally {
      box.classList.remove('busy');
      input.value = '';
    }
  }

  document.querySelectorAll('.doc-box input[type=file]').forEach(function (input) {
    input.addEventListener('change', function () { send(input); });
  });
})();
</script>`,
  });
}

/**
 * Step 3 — everything the owner wrote and every document, before it is sent
 * (CLAUDE.md §42: "submit after checking that he wrote correctly"). Submit is
 * unavailable until the three documents are in, and the server refuses it too.
 */
export function applyReviewPage({
  application,
  documents = [],
  email = '',
  ownerName = '',
  plans = [],
  csrfToken = '',
  error = '',
  user = null,
} = {}) {
  const a = application;
  const plan = plans.find((p) => p.key === a.requested_plan_key);
  const missing = REQUIRED_DOCUMENTS.filter((t) => {
    const latest = latestOf(t, documents);
    return !latest || latest.status === 'rejected';
  });
  const ready = missing.length === 0;
  const fact = (label, value) => `<dt>${h(label)}</dt><dd>${value ? h(value) : '<span class="muted">not given</span>'}</dd>`;

  const docLines = [...REQUIRED_DOCUMENTS, ...OPTIONAL_DOCUMENTS]
    .map((t) => {
      const latest = latestOf(t, documents);
      const required = REQUIRED_DOCUMENTS.includes(t);
      if (!latest && !required) return '';
      const ok = latest && latest.status !== 'rejected';
      return `<li class="${ok ? 'ok' : ''}"><b>${h(DOCUMENT_LABELS[t] || t)}</b> ${
        ok
          ? `<span class="muted">· <a href="/platform/apply/documents/${h(latest.id)}" target="_blank" rel="noopener">${h(latest.filename || 'open')}</a></span>`
          : '<span class="err">· missing</span>'
      }</li>`;
    })
    .filter(Boolean)
    .join('\n    ');

  return layout({
    title: 'Check and submit',
    user,
    body: `<style>${SIGNUP_STYLE}${APPLY_STEP_STYLE}</style>
${applySteps(3)}
<h1>Check and submit</h1>
<p class="muted">Read it through once. A person reviews exactly what is below, and uses it to decide.</p>
${error ? `<p class="err" role="alert">${h(error)}</p>` : ''}

<div class="apply-card">
  <div class="review-head"><h2>You and your gym</h2><a href="/platform/apply">Edit</a></div>
  <dl class="facts">
    ${fact('Your name', ownerName)}
    ${fact('Email', email)}
    ${fact('Phone', a.owner_phone)}
    ${fact('Gym name', a.proposed_gym_name)}
    ${fact('Street address', a.gym_address)}
    ${fact('City', a.city)}
    ${fact('Country', a.country)}
    ${fact('Plan', plan?.label || a.requested_plan_key)}
    ${fact('Roughly how many members', a.estimated_members != null ? String(a.estimated_members) : '')}
    ${fact('Anything else you need', a.owner_needs)}
  </dl>
</div>

<div class="apply-card" style="margin-top:14px">
  <div class="review-head"><h2>Documents</h2><a href="/platform/apply/documents">Change</a></div>
  <ul class="checklist">
    ${docLines}
  </ul>
</div>

<form class="wide" method="post" action="/platform/apply/submit" style="margin-top:14px">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <label class="agree">
    <input type="checkbox" name="confirm" value="yes" required>
    <span>I have checked that everything above is correct, and the documents are genuine.</span>
  </label>
  <div class="submit-row"><button type="submit"${ready ? '' : ' disabled'}>Submit application</button></div>
  ${ready ? '' : `<p class="muted">Upload the missing documents first: ${h(missing.map((t) => DOCUMENT_LABELS[t] || t).join(', '))}.</p>`}
</form>`,
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

/** A gym's counts, as a person reads them. */
const statCell = (value) => (value === null || value === undefined ? '<span class="muted">—</span>' : h(value));

/**
 * Every gym, with what it is doing (CLAUDE.md §40.1 F-40.7): members,
 * check-ins this month and the last check-in, read as COUNTS ONLY (D-130).
 */
export function registryPage({ gyms = [], user = null, canSuspend = false, filter = {}, page = null, stats = null } = {}) {
  const of = (g) => (stats && typeof stats.get === 'function' ? stats.get(g.id) : null) || null;

  const body = gyms.length
    ? `<table>
  <thead><tr><th>Gym</th><th>Plan</th><th>Status</th><th>Billing</th><th>Active members</th><th>Check-ins this month</th><th>Last check-in</th></tr></thead>
  <tbody>
${gyms
  .map((g) => {
    const s = of(g);
    const unreachable = s && s.reachable === false;
    return `    <tr>
      <td><a href="/platform/registry/${h(g.id)}"><b>${h(g.search_name || g.slug)}</b></a><br><span class="muted">${h(g.city)}${
        g.country ? `, ${h(g.country)}` : ''
      }</span></td>
      <td>${h(g.plan_key || '—')}</td>
      <td>${statusTag(g.status)}</td>
      <td>${statusTag(g.subscription_status || 'none')}</td>
      <td>${unreachable ? '<span class="tag tag--bad">unreachable</span>' : statCell(s?.activeMembers)}</td>
      <td>${unreachable ? '' : statCell(s?.checkinsThisMonth)}</td>
      <td class="muted">${s?.lastActivityAt ? h(when(s.lastActivityAt)) : unreachable ? '' : 'none yet'}</td>
    </tr>`;
  })
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">${filter.query || filter.status ? 'No gyms match that search.' : 'No gyms have been provisioned yet.'}</div>`;

  return layout({
    active: 'registry',
    title: 'Gyms',
    user,
    body: `<h1>Gyms</h1>
<p class="lede">${
      page && page.total !== null
        ? `${h(count(page.total, 'gym'))} on the platform.`
        : `${h(count(gyms.length, 'gym'))} shown.`
    }${canSuspend ? '' : ' You have read-only access.'} Figures are counts only — the platform never
reads a member's name, phone or health answers.</p>
${filter.setup ? '<p class="card">Showing gyms <b>waiting for setup help</b>. <a href="/platform/registry">Show all gyms</a></p>' : ''}

<form class="card row" method="get" action="/platform/registry">
  <label style="flex:1">Search<input name="q" value="${h(filter.query)}" placeholder="gym name, city or search name"></label>
  <label>Status
    <select name="status">
      <option value="">Any</option>
      ${['pending', 'active', 'suspended', 'cancelled']
        .map((v) => `<option value="${v}"${filter.status === v ? ' selected' : ''}>${v}</option>`)
        .join('')}
    </select>
  </label>
  <button type="submit">Search</button>
  <a class="btn ghost" href="/platform/reconcile">Check for drift</a>
</form>
${body}
${pager(page, '/platform/registry', { q: filter.query, status: filter.status, setup: filter.setup ? '1' : '' })}`,
  });
}

/**
 * One gym's services (CLAUDE.md §41.1 Q2): what its plan gives, what the
 * platform added or took away for this gym alone, and the result — the same
 * rule the gym's API applies (shared/features.js effectiveFeatures).
 */
function gymServicesCard({ gym, plan, canBill, csrfToken }) {
  const planFeatures = Array.isArray(plan?.features) ? plan.features : [];
  const added = Array.isArray(gym.features_added) ? gym.features_added : [];
  const removed = Array.isArray(gym.features_removed) ? gym.features_removed : [];
  const result = new Set(effectiveFeatures(planFeatures, added, removed));
  const switchable = ALL_SERVICES.filter((f) => SERVICE_INFO[f].group !== 'core');

  const rows = switchable
    .map((f) => {
      const choice = added.includes(f) ? 'add' : removed.includes(f) ? 'remove' : 'plan';
      const fromPlan = planFeatures.includes(f);
      return `    <tr>
      <td><b>${h(SERVICE_INFO[f].label)}</b>${SERVICE_INFO[f].forMembers ? `<br><span class="muted">${h(SERVICE_INFO[f].forMembers)}</span>` : ''}</td>
      <td>${fromPlan ? statusTag('included') : '<span class="muted">not in plan</span>'}</td>
      <td>${
        canBill
          ? `<select name="svc_${h(f)}" aria-label="${h(SERVICE_INFO[f].label)} for this gym">
          <option value="plan"${choice === 'plan' ? ' selected' : ''}>As the plan says</option>
          <option value="add"${choice === 'add' ? ' selected' : ''}>Add for this gym</option>
          <option value="remove"${choice === 'remove' ? ' selected' : ''}>Remove for this gym</option>
        </select>`
          : h({ plan: 'As the plan says', add: 'Added for this gym', remove: 'Removed for this gym' }[choice])
      }</td>
      <td>${result.has(f) ? statusTag('on') : statusTag('off')}</td>
    </tr>`;
    })
    .join('\n');

  const table = `<table>
  <thead><tr><th>Service</th><th>Plan</th><th>For this gym</th><th>Result</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;

  return canBill
    ? `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/services">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Services for this gym</h2>
  <p class="muted">The plan decides, unless you add or remove a service for this gym alone — a trial of face
  recognition, say. Always included: ${h(CORE_FEATURES.map((f) => SERVICE_INFO[f].label).join(', '))}. The owner can
  still switch member services off for their own members.</p>
  ${table}
  <button type="submit">Save services</button>
</form>`
    : `<div class="card"><h2>Services for this gym</h2>${table}</div>`;
}

/** The gym's named Yoyo contact (§41.1 Q6). */
function accountManagerCard({ gym, staff, canManage, csrfToken, manager }) {
  if (!canManage) return '';
  const current = gym.account_manager_id || '';
  return `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/account-manager">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Account manager</h2>
  <p class="muted">${
    gym.plan_key === 'prime'
      ? 'Prime gyms are promised a named Yoyo contact who checks in monthly. The owner sees this name and email on their page.'
      : 'Account managers are promised on Prime. You can still name one for this gym.'
  }</p>
  <label>Who looks after this gym
    <select name="staff_id">
      <option value="">Nobody yet</option>
      ${staff
        .map((m) => `<option value="${h(m.id)}"${m.id === current ? ' selected' : ''}>${h(m.full_name || m.email)}</option>`)
        .join('')}
    </select>
  </label>
  ${manager ? `<p class="muted">Now: <b>${h(manager.full_name || manager.email)}</b></p>` : ''}
  <button type="submit">Save account manager</button>
</form>`;
}

/** Setup help the owner asked for, and whether it was given (§41.1 Q6). */
function setupHelpCard({ gym, canOnboard, csrfToken }) {
  if (!gym.setup_help_requested_at && !gym.setup_help_done_at) return '';
  if (gym.setup_help_done_at) {
    return `<div class="card"><h2>Setup help</h2><p>${statusTag('done')} Given ${h(when(gym.setup_help_done_at))}.</p></div>`;
  }
  return `<div class="card" style="border-color:rgba(245,196,81,.45)">
  <h2>The owner asked for setup help</h2>
  <p class="muted">Asked ${h(when(gym.setup_help_requested_at))}. Help them set their plans and prices, import their members
  and print their QR posters, then record it here.</p>
  ${
    canOnboard
      ? `<form method="post" action="/platform/registry/${h(gym.id)}/setup-done">
    <input type="hidden" name="csrf" value="${h(csrfToken)}">
    <button type="submit">Mark setup help as given</button>
  </form>`
      : ''
  }
</div>`;
}

/** One gym: what it is, who runs it, what it does, what it pays — and the controls. */
export function gymDetailPage({
  gym,
  subscription = null,
  invoices = [],
  owner = null,
  plan = null,
  application = null,
  user = null,
  csrfToken = '',
  canSuspend = false,
  canBill = false,
  canOnboard = false,
  canManage = false,
  staff = [],
  plans = [],
  stats = null,
  notice = '',
}) {
  const suspended = gym.status === 'suspended';
  const limit = plan?.max_active_members ?? null;

  // The control is rendered only for someone who may use it. Hiding a button
  // is not the security boundary — the router checks the permission again —
  // but offering a control that will be refused is its own kind of lie.
  const controls = canSuspend
    ? `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/${
        suspended ? 'reactivate' : 'suspend'
      }" style="border-color:${suspended ? 'var(--line)' : 'rgba(255,107,94,.35)'}">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>${suspended ? 'Reactivate this gym' : 'Suspend this gym'}</h2>
  <p class="muted">${
    suspended
      ? 'Members and staff will be able to sign in again within a minute.'
      : 'Members and staff will be locked out within a minute — on the app and on every web address. <b>No data is deleted.</b>'
  }</p>
  <label>Reason<input name="reason" placeholder="Why?" ${suspended ? '' : 'required'}></label>
  <button type="submit"${suspended ? '' : ' class="danger"'}>${suspended ? 'Reactivate' : 'Suspend'}</button>
</form>`
    : '';

  const resend =
    canOnboard && gym.status === 'pending' && gym.owner_user_id
      ? `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/resend-activation">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>The owner has not activated yet</h2>
  <p class="muted">The gym opens when the owner uses the link and code from their activation email.
  If it was lost or the 48 hours ran out, send a new one — the old link stops working.</p>
  <button type="submit">Send a new activation link</button>
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

  const activity = stats
    ? stats.reachable
      ? `<div class="kpis">
  <div class="kpi"><div class="lbl">Active members</div><div class="val">${h(stats.activeMembers ?? '—')}</div>
    <div class="sub">${limit ? `of ${h(limit)} on ${h(plan?.label || gym.plan_key)}` : 'no plan limit'}</div></div>
  <div class="kpi"><div class="lbl">Check-ins this month</div><div class="val">${h(stats.checkinsThisMonth ?? '—')}</div></div>
  <div class="kpi"><div class="lbl">Last check-in</div><div class="val" style="font-size:18px">${
    stats.lastActivityAt ? h(when(stats.lastActivityAt)) : 'none yet'
  }</div></div>
  <div class="kpi"><div class="lbl">Subscription</div><div class="val" style="font-size:18px">${
    subscription ? statusTag(subscription.status) : statusTag('none')
  }</div></div>
</div>
<p class="muted"><b>Counts only.</b> The platform never reads a member's name, phone,
ID or health answers — only how many there are. Every one of these reads is
written to the audit log with your name on it.</p>`
      : `<div class="card" style="border-color:rgba(255,107,94,.35)"><p>⚠️ This gym's data could not be reached, so there are no counts.
         That is worth looking into — it usually means the gym is not serving traffic either.</p></div>`
    : '';

  return layout({
    active: 'registry',
    title: gym.search_name || gym.slug,
    user,
    body: `<p><a href="/platform/registry">← All gyms</a></p>
<h1>${h(gym.search_name || gym.slug)}</h1>
<p class="row">${statusTag(gym.status)} <span class="tag">${h(gym.plan_key || 'no plan')}</span>
<span class="muted">${h(gym.city)}${gym.country ? `, ${h(gym.country)}` : ''}</span></p>
${notice ? `<div class="card" style="border-color:rgba(142,224,122,.4)">${h(notice)}</div>` : ''}

${activity}

<div class="grid2">
<div class="card">
  <h2>Owner</h2>
  ${
    owner
      ? `<dl class="facts">
    <dt>Name</dt><dd>${h(owner.full_name || '—')}</dd>
    <dt>Email</dt><dd><a href="mailto:${h(owner.email)}">${h(owner.email)}</a></dd>
    <dt>Phone</dt><dd>${
      application?.owner_phone ? `<a href="tel:${h(application.owner_phone)}">${h(application.owner_phone)}</a>` : '<span class="muted">not given</span>'
    }</dd>
    <dt>Account</dt><dd>${statusTag(owner.is_active === false ? 'switched off' : 'active')}</dd>
    <dt>Last sign-in</dt><dd class="muted">${owner.last_login_at ? h(when(owner.last_login_at)) : 'not yet'}</dd>
  </dl>
  <p><a href="/platform/owners?q=${h(encodeURIComponent(owner.email))}">Manage this owner →</a></p>`
      : '<p class="muted">No owner is recorded for this gym.</p>'
  }
</div>
<div class="card">
  <h2>Gym</h2>
  <dl class="facts">
    <dt>Search name</dt><dd>${h(gym.slug)}</dd>
    <dt>Admin sign-in</dt><dd><a href="${h(gymAdminPath(gym.slug))}" target="_blank" rel="noopener">${h(gymAdminPath(gym.slug))}</a></dd>
    <dt>Plan</dt><dd>${h(plan?.label || gym.plan_key || '—')}${
      plan && Number.isInteger(plan.price_cents) ? ` <span class="muted">· ${h(fmtMoney(plan.price_cents, plan.currency || 'ZAR'))} a month</span>` : ''
    }</dd>
    <dt>On the platform since</dt><dd class="muted">${h(when(gym.created_at)) || '—'}</dd>
    ${application?.id ? `<dt>Application</dt><dd><a href="/platform/applications/${h(application.id)}">Open →</a></dd>` : ''}
  </dl>
</div>
</div>

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

${resend}

${setupHelpCard({ gym, canOnboard, csrfToken })}

${gymServicesCard({ gym, plan, canBill, csrfToken })}

${accountManagerCard({ gym, staff, canManage, csrfToken, manager: staff.find((m) => m.id === gym.account_manager_id) || null })}

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
/**
 * Where a picked gym leads, by what the person came to do (CLAUDE.md §36 on
 * the web). A fixed list: the value only ever chooses one of these paths.
 */
const FINDER_NEXT = {
  join: { title: 'Join a gym', sub: 'Find the gym you want to join, then register with them.', path: '/register' },
  signin: { title: 'Member sign in', sub: 'Find your gym, then sign in with your membership number and phone.', path: '/member' },
  admin: {
    title: 'Gym owner login',
    sub: 'Choose your gym, then sign in with your admin email or username and password. Your staff use the same sign-in.',
    path: '/admin/login',
  },
};

export function finderPage({ next = '' } = {}) {
  const go = FINDER_NEXT[next] || { title: 'Find your gym', sub: 'Search by name, or use your location to see the closest gyms first.', path: '' };
  return layout({
    title: go.title,
    indexable: !FINDER_NEXT[next],
    body: `<p><a href="/platform/welcome">← Back</a></p>
<h1>${h(go.title)}</h1>
<p class="muted">${h(go.sub)}</p>

<form class="card" id="finder" onsubmit="return false">
  <label>Gym name<input id="q" name="q" placeholder="e.g. BOS GYM" autocomplete="off"></label>
  <button type="button" id="near">Use my location</button>
  <p class="muted" id="note"></p>
</form>

<div id="results"><div class="empty">Start typing to search.</div></div>

<script>
(function () {
  var NEXT_PATH = ${JSON.stringify(go.path)};
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
      return '<a class="card block" href="/g/' + encodeURIComponent(g.slug) + NEXT_PATH + '">' +
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
    active: 'registry',
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
export function activatePage({ token = '', gymName = '', error = '', code = '', email = '', expired = false } = {}) {
  if (expired) {
    return layout({
      title: 'Activate your account',
      body: `<h1>This link has expired</h1>
<p class="muted">Activation links and codes work for 10 minutes. You can receive one link a day.</p>
<form class="card" method="post" action="/platform/activate/renew">
  <input type="hidden" name="token" value="${h(token)}">
  <p>We will email a new link and code to the address you applied with.</p>
  <button type="submit">Send me a new link</button>
</form>`,
    });
  }
  return layout({
    title: 'Activate your account',
    body: `<h1>Activate your account</h1>
<p class="muted">${
      gymName
        ? `Your gym <b>${h(gymName)}</b> has been approved.`
        : 'Your gym has been approved.'
    } Enter the six-digit code from your email and choose a password. The link and code work for
    <b>10 minutes</b>.</p>
${error ? `<p class="err">${h(error)}</p>` : ''}

<form class="card" method="post" action="/platform/activate">
  <input type="hidden" name="token" value="${h(token)}">
  ${
    // THE BROWSER'S SAVED PASSWORD. The owner chose a password when applying,
    // and the browser saved it for this site. Without a username beside the
    // new password it could not tell which saved login this replaces, so it
    // kept the OLD one — and filled it into the gym sign-in, which refused it
    // (2026-09-29). Named here, the browser offers to update it instead.
    email ? `<input type="text" name="username" value="${h(email)}" autocomplete="username" readonly hidden>` : ''
  }
  <label>Six-digit code
    <input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required
           autocomplete="one-time-code" value="${h(code)}">
  </label>
  <label>Choose a password
    <input type="password" name="password" required minlength="10" autocomplete="new-password">
  </label>
  <p class="muted">At least 10 characters. <b>This becomes your one password</b> — for your Yoyo Gyms account and your
  gym admin panel — and it <b>replaces the one you chose when you applied</b>. Type it yourself: if your browser
  offers a saved password here, that is the old one.</p>
  <label class="check">
    <input type="checkbox" name="accept_terms" value="yes" required>
    I have read and accept the <a href="/platform/terms" target="_blank" rel="noopener">Gym Owner Agreement</a>.
  </label>
  <button type="submit">Activate</button>
</form>`,
  });
}

/** Activation done. Says plainly what is true, including what is not yet true. */
export function activateSuccessPage({ gymActivated = false, gymSlug = '', gymUsername = '', ownerRef = '' } = {}) {
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
  <p>Sign in there as <b>${h(gymUsername)}</b> (or with your email), using the password you <b>just chose</b> —
  not the one from your application, which it replaced.</p>
  <p><a href="${h(gymAdminPath(gymSlug))}">Open your gym admin panel →</a></p>
  <p class="muted">You can change that password, and add staff, from Settings inside the panel.</p>
</div>`
      : '';

  return layout({
    title: 'Account activated',
    body: `<div class="card">
  <h1>Your account is active</h1>
  ${ownerRef ? `<p>Your <b>Owner ID</b> is <b style="font-size:1.2em;letter-spacing:.05em">${h(ownerRef)}</b>. Keep it — quote it whenever you contact us.</p>` : ''}
  <p>You can now sign in with your email and the password you just chose. Your signed
  <b>Gym Owner Agreement</b> is on your owner page as a PDF, to download any time.</p>
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
/**
 * What an owner is told about their application, in words (CLAUDE.md §40.1
 * F-40.5). The reviewer's request and the reason for a refusal used to live
 * only on the staff screen; the owner saw a status word and nothing else.
 */
function ownerApplicationText(application) {
  switch (application.status) {
    case 'draft':
      return `<p><b>Your application has not been sent yet.</b> Upload your three documents, check what
  you wrote, and submit it — then a person reviews it.</p>
  <p><a class="btn" href="/platform/apply/documents">Continue your application →</a></p>`;
    case 'info_requested':
      return `<p><b>We need something more from you:</b> ${h(application.review_notes) || 'please check your email.'}</p>
  <p class="muted">Upload it below and the review carries on straight away.</p>`;
    case 'rejected':
      return `<p><b>Your application was not approved.</b>${
        application.decision_reason ? ` Reason: ${h(application.decision_reason)}` : ''
      }</p>
  <p class="muted">You are welcome to apply again once that is resolved. <a href="/platform/apply">Apply again →</a></p>`;
    default:
      return `<p class="muted">A person is reviewing your application. Upload the three documents below —
  your gym is approved once each has been checked. We email you as soon as there is a decision.</p>`;
  }
}

/** One required document, as the owner sees it. */
function ownerRequiredLine(type, documents) {
  const ofType = documents.filter((d) => d.doc_type === type);
  const accepted = ofType.some((d) => d.status === 'accepted');
  const state = accepted
    ? 'checked'
    : ofType.some((d) => d.status === 'pending')
      ? 'received — being checked'
      : ofType.length
        ? 'not accepted — please upload a new one'
        : 'please upload';
  return `<li class="${accepted ? 'ok' : ''}"><b>${h(DOCUMENT_LABELS[type] || type)}</b> <span class="muted">· ${h(state)}</span></li>`;
}

export function ownerDashboardPage({
  user = null,
  application = null,
  gym = null,
  subscription = null,
  documents = [],
  csrfToken = '',
  closureRequestedAt = null,
  ownerRef = '',
  support = null,
  planSupport = null,
} = {}) {
  // What Yoyo Gyms promises this owner, and how to reach it (§41.1 Q6, Q7).
  const prime = gym?.plan_key === 'prime';
  const supportCard =
    gym && planSupport
      ? `<div class="card">
  <h2>Your support</h2>
  <ul class="checklist">${planSupport.map((p) => `<li class="ok">${h(p)}</li>`).join('')}</ul>
  <dl class="facts" style="margin-top:14px">
    <dt>Email</dt><dd><a href="mailto:${h(support?.email || 'hello@mulesoo.com')}">${h(support?.email || 'hello@mulesoo.com')}</a></dd>
    ${
      prime && support?.whatsapp
        ? `<dt>WhatsApp</dt><dd><a href="https://wa.me/${h(support.whatsapp.replace(/^\+/, ''))}" target="_blank" rel="noopener">${h(support.whatsapp)}</a></dd>`
        : ''
    }
    ${
      support?.manager
        ? `<dt>Your account manager</dt><dd>${h(support.manager.full_name || '')} · <a href="mailto:${h(support.manager.email)}">${h(support.manager.email)}</a></dd>`
        : prime
          ? '<dt>Your account manager</dt><dd class="muted">Being assigned — they will introduce themselves.</dd>'
          : ''
    }
  </dl>
  ${
    support?.setupDoneAt
      ? `<p class="muted">Setup help given ${h(when(support.setupDoneAt))}.</p>`
      : support?.setupRequestedAt
        ? `<p>You asked for setup help ${h(when(support.setupRequestedAt))}. We will be in touch.</p>`
        : `<form method="post" action="/platform/my-gym/setup-help" style="margin-top:14px">
    <input type="hidden" name="csrf" value="${h(csrfToken)}">
    <button type="submit">Ask for setup help</button>
    <p class="muted">We help you set your plans and prices, move your members across and print your QR posters.</p>
  </form>`
  }
</div>`
      : '';
  // The owner's ID and their signed agreement, once there is a gym to agree
  // about. The PDF is built fresh each time from the account and the audit
  // log, so it always matches what was accepted.
  const agreementCard = gym
    ? `<div class="card">
  <h2>Your agreement</h2>
  <p>Owner ID: <b style="letter-spacing:.05em">${h(ownerRef)}</b></p>
  <p><a href="/platform/my-gym/agreement.pdf">Download your Gym Owner Agreement (PDF) →</a></p>
  <p class="muted"><a href="/platform/terms">Read the agreement online</a></p>
</div>`
    : '';
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
  const upload = application && application.status !== 'draft'
    ? `<form class="card" id="doc-form">
  <h2>Send a document</h2>
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <input type="hidden" name="application_id" value="${h(application.id)}">
  <label>What is it?
    <select name="doc_type">
      <option value="id_document">Your ID (required)</option>
      <option value="business_registration">Business registration (required)</option>
      <option value="proof_of_address">Proof of the gym's address (required)</option>
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
  ${ownerApplicationText(application)}
  ${
    application.status === 'rejected'
      ? ''
      : `<h2 style="margin-top:18px">Before your gym can be approved</h2>
  <ul class="checklist">
    ${REQUIRED_DOCUMENTS.map((t) => ownerRequiredLine(t, documents)).join('\n    ')}
  </ul>`
  }
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
    active: 'my-gym',
    title: 'Your gym',
    user: user && { ...user, kind: 'gym_owner' },
    body: `<h1>Your gym</h1>
${status}
${supportCard}
${agreementCard}

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
  return DOCUMENT_LABELS[key] || key;
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
    active: 'plans',
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
  ${serviceSwitches(p.features)}
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
 * A plan's services as switches (CLAUDE.md §41.1 Q2). Core services are shown
 * as always included, not as switches: a gym without them is not running, and
 * the server keeps them on whatever is sent.
 */
function serviceSwitches(features) {
  const on = new Set(Array.isArray(features) ? features : []);
  const group = (key, title) => {
    const items = ALL_SERVICES.filter((f) => SERVICE_INFO[f].group === key);
    if (!items.length) return '';
    if (key === 'core') {
      return `<p class="svc-h">${h(title)}</p><p class="muted svc-core">${items.map((f) => h(SERVICE_INFO[f].label)).join(' · ')}</p>`;
    }
    return `<p class="svc-h">${h(title)}</p>
  <div class="svc-grid">
    ${items
      .map(
        (f) => `<label class="svc"><input type="checkbox" name="svc_${h(f)}" value="1"${on.has(f) ? ' checked' : ''}>
      <span><b>${h(SERVICE_INFO[f].label)}</b>${SERVICE_INFO[f].forMembers ? `<small>${h(SERVICE_INFO[f].forMembers)}</small>` : ''}</span></label>`
      )
      .join('\n    ')}
  </div>`;
  };
  return `<div class="svc-block">
  <p class="svc-title">Services in this plan</p>
  ${SERVICE_GROUPS.map(([key, title]) => group(key, title)).join('\n  ')}
</div>`;
}

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
      <td>${h(e.entity || '')}${e.entity_id || e.detail?.entity_key ? `<br><span class="muted">${h(e.entity_id || e.detail.entity_key)}</span>` : ''}</td>
      <td class="muted">${h(detailText(e.detail))}</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">Nothing matches that filter.</div>`;

  return layout({
    active: 'audit',
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
      <td>${statusTag(o.is_active === false ? 'switched off' : 'active')}${
        o.closure_requested_at && o.is_active !== false ? ` ${statusTag('asked to close')}` : ''
      }</td>
      <td><form method="post" action="/platform/owners/${h(o.id)}/${
        o.is_active === false ? 'reactivate' : 'deactivate'
      }">
        <input type="hidden" name="csrf" value="${h(csrfToken)}">
        <button type="submit"${o.is_active === false ? '' : ' class="danger"'}>${o.is_active === false ? 'Switch on' : 'Switch off'}</button>
      </form></td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">No owners match that search.</div>`;

  return layout({
    active: 'owners',
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
    active: 'finance',
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
export function activationHandoverPage({ activation = {}, gymName = '', applicationId = '', backHref = '', user = null }) {
  return layout({
    active: 'applications',
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
  <p class="muted">Both are needed. The link alone is not enough, and it expires
  <b>${h(activation.expiresInMinutes || 10)} minutes</b> after it was made — send it now. Once it has
  expired, the owner can ask for the next one from the link itself (one a day).</p>
</div>

<div class="card">
  <p><b>This is shown once.</b> Only hashes are stored, so this page is the only
  place these values exist. If you navigate away without copying them, issue a new
  activation instead — nothing is lost, the owner simply gets a fresh link.</p>
  <p><a class="btn" href="${h(backHref || `/platform/applications/${applicationId}`)}">${
    backHref ? 'Back to the gym' : 'Back to the application'
  } →</a></p>
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
  // ALWAYS-VISIBLE controls (CLAUDE.md §40.1 F-40.8). Most phone browsers
  // show an embedded PDF as a blank box, and the fallback inside <object>
  // only appears where it is not needed.
  const tools = `<p class="row">
  <a class="btn" href="${src}" target="_blank" rel="noopener">Open in a new tab</a>
  <a class="btn ghost" href="${src}?download=1">Download</a>
</p>`;
  const viewer = isImage
    ? `${tools}<img src="${src}" alt="${h(doc.filename)}" style="max-width:100%;border:1px solid var(--line);border-radius:12px"
  onerror="this.outerHTML='<div class=&quot;empty&quot;><p>This browser cannot show this photo. Use <b>Download</b> above to open it.</p></div>'">`
    : `${tools}<object data="${src}" type="application/pdf" style="width:100%;height:78vh;border:1px solid var(--line);border-radius:12px;background:#fff">
  <div class="empty">
    <p>This browser cannot show the PDF here. Use <b>Open in a new tab</b> or <b>Download</b> above.</p>
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
      <tr><td class="muted">Document type</td><td>${h(DOCUMENT_LABELS[doc.doc_type] || doc.doc_type)}</td></tr>
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
    <button type="submit" name="action" value="reject" class="ghost">Reject</button>
  </div>
</form>`
      : `<div class="card"><p class="muted">${
          doc.status === 'pending' ? 'You have read-only access.' : `Already ${h(doc.status)}.`
        }${doc.reject_reason ? ` ${h(doc.reject_reason)}` : ''}</p></div>`;

  return layout({
    active: 'applications',
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
    active: 'security',
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
export function setupPage({ token = '', email = '', secret = '', otpauth = '', error = '', action = '/platform/setup' } = {}) {
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

<form class="card" method="post" action="${h(action)}">
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
export function setupDonePage({ recoveryCodes = [], invited = false } = {}) {
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
  ${
    invited
      ? ''
      : `<p class="muted">Remove <code>PLATFORM_SETUP_TOKEN</code> from your environment now.
  It is no longer needed — this account already has a password, so the setup page
  would refuse it anyway, but a secret nobody needs is a secret not worth keeping.</p>`
  }
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
export function problemPage({ title = 'Something went wrong', message = '', fix = null, back = null, user = null } = {}) {
  return layout({
    title,
    // Inside the panel when a staff member hit it, so the way on is the menu
    // they already know — not a dead end with four words on it.
    user,
    body: `<div class="card">
  <h1>${h(title)}</h1>
  <p>${h(message)}</p>
  ${fix ? `<div class="card" style="border-left:4px solid #b7791f"><b>How to fix it</b><p>${h(fix)}</p></div>` : ''}
  ${back ? `<p><a class="btn" href="${h(back.href)}">${h(back.label)} →</a></p>` : ''}
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
    active: 'account',
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
    active: 'account',
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

/** What an audit entry means, for the activity list on Today. */
const ACTIVITY_TEXT = {
  'application.submitted': 'New application',
  'platform.login': 'Staff sign-in',
  'platform.login.failed': 'Failed sign-in attempt',
  'platform.login.locked': 'Account locked after failed sign-ins',
  'platform.gym.suspended': 'Gym suspended',
  'platform.gym.reactivated': 'Gym reactivated',
  'platform.gym.plan_changed': 'Gym moved to another plan',
  'platform.document.uploaded': 'Document uploaded',
  'platform.document.viewed': 'Document opened',
  'platform.document.accepted': 'Document accepted',
  'platform.document.rejected': 'Document rejected',
  'platform.owner.activation_issued': 'Activation link sent',
  'platform.owner.activation_resent': 'New activation link sent',
  'platform.owner.agreement_accepted': 'Owner activated their gym',
  'platform.owner.closure_requested': 'Owner asked to close their account',
  'platform.owner.deactivated': 'Owner switched off',
  'platform.owner.reactivated': 'Owner switched back on',
  'platform.plan.updated': 'Plan price changed',
  'platform.staff.invited': 'Staff member invited',
  'platform.staff.role_changed': 'Staff role changed',
  'platform.staff.deactivated': 'Staff member switched off',
  'platform.staff.joined': 'Staff member finished setting up',
  'platform.application.decision_email_failed': 'Decision email could not be sent',
};

/** Entries worth reading on Today — reads of figures are not news. */
const QUIET = new Set(['platform.gym.stats_read', 'platform.logout']);

function activityLine(e) {
  const text =
    ACTIVITY_TEXT[e.action] ||
    String(e.action || '')
      .replace(/^platform\./, '')
      .replace(/[._]/g, ' ');
  const name = e.detail && typeof e.detail === 'object' ? e.detail.gym_name || e.detail.email || '' : '';
  return `<li><b>${h(text)}</b>${name ? ` <span class="muted">· ${h(name)}</span>` : ''} <span class="muted" style="float:right">${h(
    when(e.created_at)
  )}</span></li>`;
}

/**
 * What needs you today — and the state of the platform at a glance.
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
  waitingOnOwner = 0,
  gyms = 0,
  activeGyms = 0,
  gymCounts = null,
  owners = null,
  alerts = 0,
  unpricedPlans = [],
  outstandingCents = 0,
  mrrCents = null,
  currency = 'ZAR',
  trialsEndingSoon = [],
  driftFindings = null,
  closureRequests = 0,
  provisioning = null,
  recent = [],
  setupRequests = 0,
} = {}) {
  // What this person may open. A tile or a link they would be refused is a
  // dead button (CLAUDE.md §40.1 F-40.2); rendered on its own, with no
  // permission list, the page shows everything, as before.
  const can = (perm) => !Array.isArray(user?.perms) || user.perms.includes(perm);

  // Ordered by what it costs to ignore, not by what is interesting.
  const needsYou = [];

  // Can this server create a gym? Said on the home page — by setting NAME,
  // never a value — so "is it set up?" is answered by signing in, before
  // anyone presses Approve and wonders why nothing happened.
  // A to-do only when it is a mistake (switched on, not set up) or it is in
  // someone's way (switched off, applications waiting). Deliberately off with
  // nothing waiting is not a problem; the status line below still says it.
  if (provisioning && !provisioning.ready && (provisioning.live || waiting)) {
    needsYou.push({
      urgency: 'high',
      text:
        (provisioning.live
          ? 'Creating gyms is switched on but not fully set up: '
          : 'Creating gyms is switched off: ') +
        provisioning.problems.map((p) => h(p)).join(' '),
      href: '/platform/settings',
      action: 'See settings',
      perm: 'platform.manage',
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
      perm: 'platform.manage',
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
      perm: 'subscription.manage',
    });
  }

  if (waiting) {
    needsYou.push({
      urgency: 'normal',
      text: `${count(waiting, 'gym')} waiting for a decision.`,
      href: '/platform/applications',
      action: 'Review',
      perm: 'application.view',
    });
  }

  if (alerts) {
    needsYou.push({
      urgency: 'high',
      text: `${count(alerts, 'security item')} worth a look in the last day.`,
      href: '/platform/security',
      action: 'Look',
      perm: 'audit.view',
    });
  }

  if (driftFindings) {
    needsYou.push({
      urgency: 'high',
      text: `${count(driftFindings, 'gym')} out of step between the registry and the database.`,
      href: '/platform/reconcile',
      action: 'See the report',
      perm: 'gym.view',
    });
  }

  // A promise made on the registration page (§41.1 Q6): somebody is waiting.
  if (setupRequests) {
    needsYou.push({
      urgency: 'normal',
      text: `${count(setupRequests, 'gym')} asked for setup help.`,
      href: '/platform/registry?setup=1',
      action: 'Help them',
      perm: 'gym.view',
    });
  }

  for (const t of trialsEndingSoon) {
    needsYou.push({
      urgency: 'normal',
      text: `${h(t.name)}'s trial ends ${h(until(t.trial_ends_at))}.`,
      href: `/platform/registry/${h(t.gym_id)}`,
      action: 'Open',
      perm: 'gym.view',
    });
  }

  const todo = needsYou.length
    ? `<div class="card" style="padding:0;overflow:hidden">
${needsYou
  .map((item) =>
    // Told, but not offered a door they would be refused at.
    can(item.perm)
      ? `  <a class="todo" href="${item.href}"><span class="dot${item.urgency === 'high' ? ' bad' : ''}"></span>
    <span>${item.text}</span><span class="go">${h(item.action)} →</span></a>`
      : `  <div class="todo"><span class="dot${item.urgency === 'high' ? ' bad' : ''}"></span><span>${item.text}</span></div>`
  )
  .join('\n')}
</div>`
    : `<div class="card">
  <h2>✅ Nothing needs you</h2>
  <p class="muted">No applications waiting, no security items, no plan billing nobody,
  and nothing out of step. Come back tomorrow.</p>
</div>`;

  const byStatus = gymCounts || {};
  const tile = (href, label, value, sub = '', perm = null) =>
    !can(perm)
      ? ''
      : `<a class="kpi" href="${href}"><div class="lbl">${h(label)}</div><div class="val">${value}</div>${
      sub ? `<div class="sub">${sub}</div>` : ''
    }</a>`;

  // Whole units in a tile: a headline figure, not a statement. Finances keep
  // the cents.
  const kpiMoney = (cents) => {
    try {
      return new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
        (Number(cents) || 0) / 100
      );
    } catch {
      return fmtMoney(cents, currency);
    }
  };

  const kpis = `<div class="kpis">
  ${tile('/platform/applications', 'To review', h(waiting), waitingOnOwner ? `${h(waitingOnOwner)} waiting on the owner` : 'applications', 'application.view')}
  ${tile(
    '/platform/registry?status=active',
    'Active gyms',
    h(activeGyms),
    `of ${h(gyms)}${byStatus.suspended ? ` · ${h(byStatus.suspended)} suspended` : ''}${byStatus.pending ? ` · ${h(byStatus.pending)} not activated` : ''}`,
    'gym.view'
  )}
  ${owners === null ? '' : tile('/platform/owners', 'Gym owners', h(owners), '', 'platform.manage')}
  ${mrrCents === null ? '' : tile('/platform/finance', 'Monthly revenue', h(kpiMoney(mrrCents)), 'from paying gyms', 'subscription.manage')}
  ${outstandingCents === null ? '' : tile('/platform/finance', 'Outstanding', h(kpiMoney(outstandingCents)), 'invoiced, not yet paid', 'subscription.manage')}
  ${tile('/platform/security', 'Security items', h(alerts), 'last 24 hours', 'audit.view')}
</div>`;

  const shown = (recent || []).filter((e) => !QUIET.has(e.action)).slice(0, 8);
  // The audit log's own entries: only for someone who may read it.
  const activity = !can('audit.view')
    ? ''
    : `<div class="card">
  <h2>Recent activity</h2>
  ${shown.length ? `<ul class="events">${shown.map(activityLine).join('\n')}</ul>` : '<p class="muted">Nothing has happened yet.</p>'}
  <p><a href="/platform/audit">Everything that happened →</a></p>
</div>`;

  return layout({
    active: 'home',
    title: 'Yoyo Gyms',
    user,
    body: `<h1>Today</h1>
<p class="lede">What needs a decision, and how the platform is doing.</p>

${kpis}

<h2>Needs you</h2>
${todo}

<div class="grid2" style="margin-top:16px">
${activity}
<div class="card">
  <h2>The platform</h2>
  <dl class="facts">
    ${
      provisioning
        ? `<dt>Creating new gyms</dt><dd>${
            provisioning.ready
              ? '<b>✅ Ready</b> <span class="muted">· approving an application opens the gym</span>'
              : '<b>❌ Not ready</b> <span class="muted">· see above</span>'
          }</dd>`
        : ''
    }
    <dt>Gyms</dt><dd>${can('gym.view') ? `<a href="/platform/registry">${h(gyms)}</a>` : h(gyms)} <span class="muted">· ${h(activeGyms)} active</span></dd>
    ${can('platform.manage') ? '<dt>Settings</dt><dd><a href="/platform/settings">Every switch, and whether it is set →</a></dd>' : ''}
  </dl>
</div>
</div>

<p class="muted">Counts only — the platform never reads a gym member's name,
phone, ID or health answers.</p>`,
  });
}

// ---------------------------------------------------------------------------
// The Yoyo staff team (CLAUDE.md §40.1 Q4)
// ---------------------------------------------------------------------------

/**
 * Who runs the main admin panel, and the controls to change that.
 *
 * Your own row has no controls: nobody changes their own role or switches
 * themselves off (platform/team.js). The server refuses it too.
 */
export function teamPage({ staff = [], roles = [], user = null, me = '', csrfToken = '', error = '', notice = '' } = {}) {
  const roleOptions = (current) =>
    roles
      .map(([key, label]) => `<option value="${h(key)}"${key === current ? ' selected' : ''}>${h(label)}</option>`)
      .join('');

  const state = (s) =>
    s.is_active === false ? statusTag('switched off') : !s.set_up ? statusTag('invited') : statusTag('active');

  const rows = staff.length
    ? `<table>
  <thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
  <tbody>
${staff
  .map((s) => {
    const self = s.id === me;
    const role = (s.roles || [])[0] || '';
    return `    <tr>
      <td><b>${h(s.full_name || '—')}</b>${self ? ' <span class="muted">(you)</span>' : ''}<br><span class="muted">${h(s.email)}</span></td>
      <td>${
        self
          ? h(roles.find(([k]) => k === role)?.[1] || role || '—')
          : `<form method="post" action="/platform/team/${h(s.id)}/role" class="row">
        <input type="hidden" name="csrf" value="${h(csrfToken)}">
        <select name="role" aria-label="Role for ${h(s.email)}">${roleOptions(role)}</select>
        <button type="submit" class="ghost">Save</button>
      </form>`
      }</td>
      <td>${state(s)}${s.set_up && !s.totp_enabled ? ' <span class="tag tag--warn">no authenticator</span>' : ''}</td>
      <td class="muted">${s.last_login_at ? h(when(s.last_login_at)) : 'never'}</td>
      <td>${
        self
          ? ''
          : `<div class="row">${
              !s.set_up && s.is_active !== false
                ? `<form method="post" action="/platform/team/${h(s.id)}/resend">
          <input type="hidden" name="csrf" value="${h(csrfToken)}">
          <button type="submit" class="ghost">New invite link</button>
        </form>`
                : ''
            }<form method="post" action="/platform/team/${h(s.id)}/${s.is_active === false ? 'reactivate' : 'deactivate'}">
          <input type="hidden" name="csrf" value="${h(csrfToken)}">
          <button type="submit"${s.is_active === false ? '' : ' class="danger"'}>${s.is_active === false ? 'Switch on' : 'Switch off'}</button>
        </form></div>`
      }</td>
    </tr>`;
  })
  .join('\n')}
  </tbody>
</table>`
    : '<div class="empty">No staff yet.</div>';

  return layout({
    active: 'team',
    title: 'Team',
    user,
    body: `<h1>Team</h1>
<p class="lede">The Yoyo staff who run this panel. Everyone signs in with a password <b>and</b> an
authenticator code. Switching someone off stops them signing in at once.</p>
${error ? `<p class="err">${h(error)}</p>` : ''}
${notice ? `<div class="card" style="border-color:rgba(142,224,122,.4)">${h(notice)}</div>` : ''}

${rows}

<form class="card" method="post" action="/platform/team/invite">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Invite someone</h2>
  <div class="grid2" style="gap:12px">
    <label>Name<input name="full_name" required autocomplete="off"></label>
    <label>Email<input type="email" name="email" required autocomplete="off"></label>
  </div>
  <label>Role
    <select name="role">${roleOptions('reviewer')}</select>
  </label>
  <button type="submit">Send invitation</button>
  <p class="muted">They get a link that works once, for ${h(INVITE_TTL_HOURS)} hours, to choose a password
  and connect an authenticator app.</p>
</form>

<div class="card">
  <h2>What each role can do</h2>
  <dl class="facts">
    ${roles.map(([, label, what]) => `<dt>${h(label)}</dt><dd>${h(what)}</dd>`).join('\n    ')}
  </dl>
</div>`,
  });
}

/** The invite link, shown once, when the email could not be sent. */
export function inviteHandoverPage({ invite = {}, user = null } = {}) {
  return layout({
    active: 'team',
    title: 'Send this invitation yourself',
    user,
    body: `<h1>Invitation created — send the link yourself</h1>
<div class="card">
  <p><b>⚠️ The invitation email could not be sent${invite.emailReason ? ` (${h(invite.emailReason)})` : ''}.</b></p>
  <p class="muted">Send this link to <b>${h(invite.to || 'them')}</b> yourself. It works once and expires in
  ${h(INVITE_TTL_HOURS)} hours. <b>It is shown only now</b> — only a hash of it is stored.</p>
  <p><input readonly value="${h(invite.link)}" style="width:100%"></p>
</div>
<p><a class="btn" href="/platform/team">Back to the team →</a></p>`,
  });
}

// ---------------------------------------------------------------------------
// Platform settings — every switch, read-only (CLAUDE.md §16, §40.1)
// ---------------------------------------------------------------------------

/**
 * The switches that decide what this platform does, and whether each is set.
 *
 * NAMES AND STATES ONLY. Not one value is shown: several of these are secrets,
 * and a settings page is exactly the screen that ends up in a screenshot. The
 * switches themselves live in Vercel's environment, where changing them needs a
 * redeploy — deliberately, for the ones that move money or create databases.
 */
export function settingsPage({ switches = [], baseUrl = '', user = null, support = null, saved = false, csrfToken = '' } = {}) {
  // Editable here, unlike the switches: where owners reach Yoyo support
  // (§41.1 Q7). The WhatsApp line is shown to Prime owners only once saved.
  const supportForm = support
    ? `<form class="card" method="post" action="/platform/settings/support">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Support contacts</h2>
  <p class="muted">Shown to every gym owner on their page. The WhatsApp line is shown to Prime owners, as their plan
  promises; until a number is saved they see the email.</p>
  ${saved ? '<p style="color:#8ee07a">Saved.</p>' : ''}
  <div class="two">
    <label>Support email<input type="email" name="email" value="${h(support.email)}" required></label>
    <label>Prime WhatsApp line<input type="tel" name="whatsapp" value="${h(support.whatsapp)}" placeholder="+27 82 123 4567"></label>
  </div>
  <button type="submit">Save support contacts</button>
</form>`
    : '';
  const rows = switches
    .map(
      (s) => `    <tr>
      <td><b>${h(s.label)}</b><br><span class="muted">${h(s.what)}</span></td>
      <td>${s.on ? `<span class="tag tag--good">${h(s.onText || 'on')}</span>` : `<span class="tag tag--${s.warn ? 'bad' : 'warn'}">${h(s.offText || 'off')}</span>`}</td>
      <td class="muted">${h(s.name)}${s.note ? `<br>${h(s.note)}` : ''}</td>
    </tr>`
    )
    .join('\n');

  return layout({
    active: 'settings',
    title: 'Settings',
    user,
    body: `<h1>Settings</h1>
<p class="lede">Every switch that decides what the platform does, and whether it is set. Values are never
shown here — several are secrets. They are changed in Vercel → Settings → Environment Variables, and take
effect after a redeploy.</p>

<table>
  <thead><tr><th>Switch</th><th>State</th><th>Variable</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>

${supportForm}

<div class="card">
  <h2>Addresses</h2>
  <dl class="facts">
    <dt>This panel</dt><dd>${h(baseUrl)}/platform/login</dd>
    <dt>Gym owner sign-up</dt><dd>${h(baseUrl)}/platform/apply</dd>
    <dt>Privacy policy</dt><dd><a href="/platform/privacy">${h(baseUrl)}/platform/privacy</a></dd>
    <dt>Gym Owner Agreement</dt><dd><a href="/platform/terms">${h(baseUrl)}/platform/terms</a></dd>
  </dl>
</div>`,
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
  // The website's front door, made to match the app's first screen (CLAUDE.md
  // §36): the user's photograph — which already carries the Yoyo Gyms logo, so
  // no header logo is added above it (§36.1 Q11) — the headline, and every
  // choice a person arrives with. The main admin panel is still the website's
  // main job (D-133); this page makes sure a member or an owner has a way in.
  return layout({
    title: 'Yoyo Gyms',
    indexable: true,
    bare: true,
    bodyClass: 'landing',
    body: `<style>
  body.landing main { max-width: 960px; padding: 0 0 48px; }
  .land-hero { position: relative; height: min(56vh, 520px); min-height: 260px; overflow: hidden; }
  .land-hero img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0; }
  .land-hero::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 50%;
                      background: linear-gradient(rgba(7,12,16,0), var(--bg) 92%); }
  .land-body { position: relative; margin-top: -64px; padding: 0 20px; text-align: center; }
  .land-h { font-size: clamp(32px, 8vw, 48px); line-height: 1.04; font-weight: 800; text-transform: uppercase;
            letter-spacing: -0.01em; margin: 0 0 12px; }
  .land-h span { display: block; color: var(--accent); }
  .land-lede { font-size: 16px; max-width: 32ch; margin: 0 auto 32px; }
  .land-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); text-align: left; }
  .land-card { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 24px; display: grid; gap: 12px; }
  .land-card h2 { margin: 0; font-size: 20px; }
  .land-card p { margin: 0 0 4px; }
  .btn { display: flex; align-items: center; justify-content: center; min-height: 52px; border-radius: 26px;
         font-weight: 800; text-decoration: none; background: var(--accent); color: var(--accent-ink); }
  .btn.ghost { background: transparent; color: var(--ink); border: 1.5px solid rgba(255,255,255,.86); }
  .btn:hover { filter: brightness(1.08); }
  .land-small { text-align: center; font-size: 14px; }
  .land-small a, .land-foot a { color: var(--muted); }
  .land-foot { margin-top: 32px; text-align: center; }

  /* A computer: the photograph in a phone-width panel beside the choices, never
     shown larger than it really is (941 px wide — §39.1 Q2), so it stays sharp. */
  @media (min-width: 900px) {
    body.landing main { max-width: 1200px; padding: 48px 32px; }
    .land { display: grid; grid-template-columns: 440px 1fr; gap: 56px; align-items: center; min-height: calc(100vh - 96px); }
    .land-grid { grid-template-columns: 1fr 1fr; }
    .land-hero { height: auto; min-height: 0; aspect-ratio: 941 / 956; border-radius: 28px;
                 box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06); }
    .land-hero::after { height: 30%; }
    .land-body { margin-top: 0; padding: 0; text-align: left; }
    .land-lede { margin: 0 0 32px; }
    .land-foot { text-align: left; }
  }
</style>
<div class="land">
<div class="land-hero"><img src="/brand/landing-hero.jpg" width="941" height="956"
  alt="Yoyo Gyms — lift, train, transform. A member training with a dumbbell."></div>
<div class="land-body">
  <h1 class="land-h">Your gym.<span>Your journey.</span></h1>
  <p class="muted land-lede">Connect to your gym, manage your membership, and stay committed to your goals.</p>

  <div class="land-grid">
    <section class="land-card">
      <h2>I’m a member</h2>
      <p class="muted">Choose your gym first, then join or sign in.</p>
      <a class="btn" href="/platform/find?next=join">Join a gym</a>
      <a class="btn ghost" href="/platform/find?next=signin">Member sign in</a>
    </section>
    <section class="land-card">
      <h2>I’m a gym owner</h2>
      <p class="muted">Open your gym’s admin panel with your email and password, or bring your gym to Yoyo.</p>
      <a class="btn" href="/owner/login">Owner login</a>
      <a class="btn ghost" href="/platform/apply">Apply to join Yoyo Gyms</a>
      <p class="land-small"><a href="/platform/find?next=admin">Gym staff sign in</a> · <a href="/platform/login?as=owner">Check application status</a></p>
    </section>
  </div>

  <p class="muted land-foot"><a href="/platform/privacy">Privacy policy</a> · <a href="/platform/delete-account">Delete your account</a> · <a href="/platform/login">Yoyo staff sign in</a></p>
</div>
</div>`,
  });
}


/** The Gym Owner Agreement, as a page — the same text as the PDF. */
export function termsPage({ sections = [], version = '', approved = false } = {}) {
  return layout({
    title: 'Gym Owner Agreement',
    indexable: approved,
    body: `<div class="card">
  ${approved ? '' : '<p class="err">DRAFT — under review and not yet in force.</p>'}
  <h1>Gym Owner Agreement</h1>
  <p class="muted">Version ${h(version)}</p>
  ${sections.map((x) => `<h2>${h(x.heading)}</h2><p>${h(x.body)}</p>`).join('')}
</div>`,
  });
}
