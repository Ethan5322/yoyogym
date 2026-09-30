// The main admin panel after the design critique of 2026-09-29: plain words,
// plan names, grouped figures, decisions first on Today, one lime action per
// page, lists that become cards on a phone, and search as you type.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  layout,
  applicationsPage,
  applicationDetailPage,
  registryPage,
  gymDetailPage,
  driftPage,
  plansPage,
  auditPage,
  ownersPage,
  financePage,
  dashboardPage,
  teamPage,
  settingsPage,
  documentReviewPage,
} from '../platform/views.js';

const STAFF = { email: 'me@yoyogyms.com', kind: 'platform_staff' };
const PAGE = (total, returned = total) => ({ page: 1, first: returned ? 1 : 0, last: returned, total, hasPrev: false, hasNext: false, label: 'x' });

/** The page's own markup: no stylesheet, no script, no attribute values. */
function visible(html) {
  return html
    .split('<main')[1]
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/\s(value|name|action|href|id|for|data-[a-z]+)="[^"]*"/g, '');
}

/** Buttons and button-links filled lime: anything not outlined or red. */
function limeFills(html) {
  const main = html.split('<main')[1].replace(/<script[\s\S]*?<\/script>/g, '');
  const buttons = main.match(/<button(?![^>]*class="[^"]*\b(ghost|danger)\b)[^>]*>/g) || [];
  const links = main.match(/class="btn"/g) || [];
  return buttons.length + links.length;
}

const PAGES = {
  applications: applicationsPage({
    applications: [{ id: 'a1', proposed_gym_name: 'Bos', status: 'submitted', city: 'Cape Town', requested_plan_key: 'prime' }],
    counts: { submitted: 1 },
    user: STAFF,
  }),
  application: applicationDetailPage({
    application: { id: 'a1', proposed_gym_name: 'Bos', status: 'submitted', requested_plan_key: 'medium', slug: 'bos-gym', estimated_members: 1200 },
    documents: [{ id: 'd1', doc_type: 'id_document', status: 'pending', filename: 'id.pdf' }],
    user: STAFF,
    csrfToken: 't',
  }),
  registry: registryPage({
    gyms: [{ id: 'g1', slug: 'kom', search_name: 'KOM', status: 'active', plan_key: 'prime' }],
    stats: new Map([['g1', { reachable: true, activeMembers: 12345, checkinsThisMonth: 41, lastActivityAt: null }]]),
    page: PAGE(1),
    filter: {},
    user: STAFF,
  }),
  gym: gymDetailPage({
    gym: { id: 'g1', slug: 'kom', search_name: 'KOM', status: 'active', plan_key: 'prime' },
    plan: { max_active_members: 1500, price_cents: 149900, features: [] },
    stats: { reachable: true, activeMembers: 1234, checkinsThisMonth: 5 },
    subscription: { status: 'trialing', trial_ends_at: '2026-10-20T00:00:00Z', current_period_end: '2026-11-20T00:00:00Z' },
    invoices: [{ number: 'INV-1', amount_cents: 123456, status: 'paid', currency: 'ZAR' }],
    canSuspend: true,
    canBill: true,
    canManage: true,
    plans: [{ key: 'prime', label: 'Prime' }],
    user: STAFF,
    csrfToken: 't',
  }),
  finance: financePage({
    summary: { currency: 'ZAR', paid_cents: 199800, outstanding_cents: 5000, unpriced_plans: ['basic'], gyms_by_status: { active: 1200 } },
    user: STAFF,
  }),
  today: dashboardPage({ user: STAFF, waiting: 3, gyms: 1500, activeGyms: 1400, owners: 1234, mrrCents: 100000, outstandingCents: 0, unpricedPlans: ['medium'] }),
  plans: plansPage({ plans: [{ key: 'basic', label: 'Basic', price_cents: 49900 }, { key: 'prime', label: 'Prime', price_cents: 0 }], user: STAFF }),
  owners: ownersPage({ owners: Object.assign([{ id: 'o1', email: 'kuma@example.com', gym_count: 2, is_active: false }], { total: 1 }), user: STAFF, page: PAGE(1) }),
  team: teamPage({ staff: [{ id: 's1', email: 'z@yoyo.co', is_active: false, roles: ['x'] }], roles: [['x', 'X', 'does x']], user: STAFF, me: 'o' }),
  audit: auditPage({ entries: [{ action: 'gym.provisioned', actor_kind: 'platform_staff', created_at: '2026-09-29T10:00:00Z' }], user: STAFF }),
  settings: settingsPage({ switches: [{ label: 'Email', what: 'w', name: 'BREVO_API_KEY', on: true }], support: { email: 'a@b.co', whatsapp: '' }, user: STAFF }),
  document: documentReviewPage({ doc: { id: 'd1', application_id: 'a1', mime_type: 'application/pdf', filename: 'id.pdf', status: 'pending' }, canDecide: true, user: STAFF }),
  drift: driftPage({ report: { ok: true, checkedSchemas: 3, orphans: [], dangling: [] }, user: STAFF }),
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

test('NO RAW PLAN KEY ON ANY PANEL PAGE — a plan is named by its label', () => {
  for (const [name, html] of Object.entries(PAGES)) {
    assert.doesNotMatch(visible(html), /\b(basic|medium|prime)\b/, `${name} shows a plan key`);
  }
  assert.match(PAGES.applications, />Prime</);
  assert.match(PAGES.application, /<dt>Plan<\/dt><dd>Medium<\/dd>/);
  assert.match(PAGES.registry, /data-label="Plan">Prime</);
  assert.match(PAGES.gym, /<span class="tag">Prime<\/span>/);
  assert.match(PAGES.gym, /on <b>Prime<\/b>/, 'the subscription line too');
  assert.match(PAGES.finance, /Gyms on Basic are not being billed/);
  assert.match(PAGES.today, /Medium has no price/);
});

test('system words are gone: provision, drift, search name, login', () => {
  assert.match(PAGES.application, />Approve and set up the gym</);
  assert.match(PAGES.application, /name="action" value="approve"/, 'the form value is unchanged');
  assert.match(PAGES.application, /<dt>Web address<\/dt><dd class="muted">\/g\/bos-gym\/<\/dd>/);
  assert.match(PAGES.gym, /<dt>Web address<\/dt><dd>\/g\/kom\/<\/dd>/);
  assert.match(PAGES.registry, /href="\/platform\/reconcile">Check gyms are in sync</, 'the address is unchanged');
  assert.match(PAGES.drift, /<h1>Are the gyms in sync\?<\/h1>/);
  assert.match(PAGES.drift, /never changes anything/);
  for (const [name, html] of Object.entries(PAGES)) {
    // The audit log keeps each entry's recorded name under its words, on
    // purpose: it is what "Action contains" searches.
    const text = visible(html).replace(/<span class="muted">[a-z_]+(\.[a-z_]+)+<\/span>/g, '');
    // "/admin/login" is an address, shown as one; the word is what must go.
    assert.doesNotMatch(text, /provision|Search name|Check for drift|Drift report|(?<![/\w])log ?in\b/i, name);
  }
  assert.match(ownersPage({ owners: [{ id: 'o2', email: 'a@b.co', is_active: true }], user: STAFF }), /through Owner sign-in/);
});

test('the audit log says what happened in words, and keeps the recorded name it is searched by', () => {
  assert.match(PAGES.audit, /<b>Gym set up<\/b><br><span class="muted">gym\.provisioned<\/span>/);
  assert.match(PAGES.audit, /Yoyo staff/);
});

test("a gym's resend card tells the truth about links: 10 minutes, one a day (§43.1 Q1)", () => {
  const html = gymDetailPage({ gym: { id: 'g1', slug: 'x', status: 'pending', owner_user_id: 'u1' }, canOnboard: true, user: STAFF, csrfToken: 't' });
  assert.match(html, /A link lasts\s+10 minutes, and one can be sent a day/);
  assert.doesNotMatch(html, /48 hours/);
});

test('no raw timestamp in a gym\'s subscription line', () => {
  assert.doesNotMatch(PAGES.gym, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  assert.match(PAGES.gym, /Trial ends 20 Oct 2026/);
});

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

test('FIGURES ARE GROUPED IN THREES AND RIGHT-ALIGNED IN TABLES', () => {
  assert.match(PAGES.registry, /<th scope="col" role="columnheader" class="num">Active members<\/th>/);
  assert.match(PAGES.registry, /data-label="Active members" class="num">12 345<\/td>/);
  assert.match(PAGES.registry, /1 gym on the platform\./);
  assert.match(PAGES.gym, /data-label="Amount" class="num">ZAR 1 234\.56<\/td>/);
  assert.match(PAGES.gym, /<div class="val">1 234<\/div>/);
  assert.match(PAGES.gym, /of 1 500 on Prime/);
  assert.match(PAGES.finance, /ZAR 1 998\.00/);
  assert.match(PAGES.finance, /class="num">1 200<\/td>/);
  assert.match(PAGES.today, /<div class="val">1 400<\/div>/);
  assert.match(PAGES.today, /Gym owners<\/div><div class="val">1 234</);
  assert.match(PAGES.application, /<dt>Expected members<\/dt><dd>1 200<\/dd>/);
  assert.match(PAGES.plans, /Currently <b>ZAR 499\.00<\/b>/);
});

test('the pager groups its figures too', () => {
  const html = registryPage({
    gyms: [{ id: 'g1', slug: 'a', status: 'active' }],
    page: { page: 2, first: 26, last: 50, total: 1234, hasPrev: true, hasNext: true, label: 'Showing 26–50 of 1234' },
    filter: {},
    user: STAFF,
  });
  assert.match(html, /Showing 26–50 of 1 234/);
  assert.match(html, /1 234 gyms on the platform\./);
});

test('with a search, the registry counts what MATCHED, not the platform', () => {
  const html = registryPage({ gyms: [{ id: 'g1', slug: 'a', status: 'active' }], page: PAGE(1), filter: { query: 'a' }, user: STAFF });
  assert.match(html, /1 gym matches\./);
  assert.doesNotMatch(html, /on the platform\./);
});

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

test('TODAY PUTS WHAT NEEDS A PERSON FIRST, ABOVE THE TOTALS, AND THE TILES BALANCE', () => {
  const html = PAGES.today;
  const decide = html.indexOf('<section class="decide"');
  const totals = html.indexOf('<div class="kpi-wrap">');
  assert.ok(decide > 0 && totals > decide, 'decisions before totals');
  assert.match(html, /<h2 id="needs-you">Needs you<\/h2>/);
  assert.match(html, /3 applications waiting for a decision\./);
  assert.match(html, /<div class="kpis n4">/, 'four tiles: a 2 x 2 or 4 x 1 grid, never 3 + 1');
  assert.doesNotMatch(html, /class="lbl">To review</, 'To review is a decision, not a total');
  assert.match(html, /@container \(min-width: 760px\) \{ \.kpis\.n4/);
});

test('red items lead the list; the card takes the colour of the most urgent', () => {
  const html = PAGES.today;
  assert.ok(html.indexOf('has no price') < html.indexOf('waiting for a decision'), 'the unpriced plan (red) first');
  assert.match(html, /<div class="card tone-bad">\s*<a class="todo"/);
});

test('A GYM WHOSE BUILD STOPPED IS A DECISION ON TODAY — until a later build succeeds', () => {
  const failed = { action: 'gym.provision.failed', entity: 'application', entity_id: 'app-9', created_at: '2026-09-29T08:00:00Z', detail: { slug: 'bos' } };
  const open = dashboardPage({ recent: [failed] });
  assert.match(open, /1 approved gym not fully set up/);
  assert.match(open, /href="\/platform\/applications\/app-9"/);
  assert.match(open, /Try again →/);

  const fixed = dashboardPage({ recent: [{ action: 'gym.provisioned', entity: 'gym', entity_id: 'g9', created_at: '2026-09-29T09:00:00Z', detail: { slug: 'bos' } }, failed] });
  assert.doesNotMatch(fixed, /not fully set up/);
});

test('documents waiting are shown only when the figure is known', () => {
  assert.match(dashboardPage({ documentsWaiting: 4 }), /4 documents waiting to be checked/);
  assert.doesNotMatch(dashboardPage({}), /documents? waiting to be checked/);
});

// ---------------------------------------------------------------------------
// One lime action per page
// ---------------------------------------------------------------------------

test('ONE LIME FILL PER PAGE AT MOST — every other action is outlined', () => {
  for (const [name, html] of Object.entries(PAGES)) {
    assert.ok(limeFills(html) <= 1, `${name} has ${limeFills(html)} lime buttons`);
  }
  assert.match(PAGES.application, /value="approve" formnovalidate( disabled)?>Approve and set up the gym/, 'Approve is the one');
  assert.match(PAGES.application, /value="accept" formnovalidate class="ghost">Accept/);
  assert.match(PAGES.document, /class="btn ghost" href="\/platform\/documents\/d1\/file" target="_blank"/);
  assert.match(PAGES.applications, /<a href="[^"]*tab=review" aria-current="page">To review/, 'the current tab is tinted, not a lime button');
});

test("a gym's page leads with what it needs next", () => {
  const suspended = gymDetailPage({ gym: { id: 'g1', slug: 'x', status: 'suspended' }, canSuspend: true, canBill: true, plans: [{ key: 'basic', label: 'Basic' }], user: STAFF, csrfToken: 't' });
  assert.match(suspended, /<button type="submit">Reactivate<\/button>/);
  assert.equal(limeFills(suspended), 1);

  const pending = gymDetailPage({ gym: { id: 'g1', slug: 'x', status: 'pending', owner_user_id: 'u' }, canOnboard: true, user: STAFF, csrfToken: 't' });
  assert.match(pending, /<button type="submit">Send a new activation link<\/button>/);
});

test('no thick coloured stripe down the side of a card', () => {
  const html = [
    documentReviewPage({ doc: { id: 'd1', mime_type: 'application/pdf', status: 'pending' }, facts: { flags: [{ severity: 'high', detail: 'x' }] }, duplicates: [{ application_id: 'a2' }], user: STAFF }),
    applicationDetailPage({ application: { id: 'a1', status: 'approved' }, events: [{ event: 'provision_failed', created_at: '2026-09-29T08:00:00Z', detail: {} }], user: STAFF }),
  ].join('');
  assert.doesNotMatch(html, /border-left:4px/);
  assert.match(html, /class="card tone-bad"/);
});

// ---------------------------------------------------------------------------
// Phones
// ---------------------------------------------------------------------------

test('A PHONE READS A LIST AS CARDS, AND THE TABLE STAYS A TABLE FOR A SCREEN READER', () => {
  const html = PAGES.owners;
  assert.match(html, /@media \(max-width: 640px\) \{/);
  assert.match(html, /body\.panel table\.list td::before \{ content:attr\(data-label\)/);
  assert.match(html, /body\.panel table\.list thead \{ position:absolute;[^}]*clip-path:inset\(50%\)/, 'the header is hidden from sight only');
  assert.match(html, /<table class="list" role="table">/);
  assert.match(html, /<thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Owner<\/th>/);
  assert.match(html, /<td role="cell" data-label="Email">kuma@example\.com<\/td>/);
  assert.match(html, /<th scope="col" role="columnheader"><span class="sr-only">Actions<\/span><\/th>/, 'the actions column has a heading');
  assert.match(html, /<td role="cell" class="act">/, 'and takes the whole card width');
  assert.doesNotMatch(html, /body\.panel table \{ display:block; overflow-x:auto; white-space:nowrap; \}/, 'no more sideways-scrolling page tables');
  assert.match(html, /\.tscroll \{ overflow-x:auto;/, 'a tablet scrolls the list inside its own box');
});

test('the switch-off confirmation opens across the card and scrolls into sight', () => {
  const html = teamPage({ staff: [{ id: 's1', email: 'z@yoyo.co', is_active: true, set_up: true, roles: ['x'] }], roles: [['x', 'X', 'y']], user: STAFF, me: 'o', csrfToken: 't' });
  assert.match(html, /details\.confirm, details\.confirm\[open\] \{ display:block; \}/);
  assert.match(html, /details\.confirm form \{ margin:10px 0 0; max-width:min\(340px,100%\)/);
  assert.match(html, /document\.addEventListener\('toggle'[\s\S]*?scrollIntoView\(\{ block: 'nearest'/);
});

test('the sidebar logo is cropped above its unreadable tagline', () => {
  const html = layout({ title: 'T', body: '', user: STAFF });
  assert.match(html, /\.side \.brand img \{ display:block; width:87px; height:60px; object-fit:cover; object-position:50% 0; \}/);
});

// ---------------------------------------------------------------------------
// Search as you type
// ---------------------------------------------------------------------------

test('SEARCH AS YOU TYPE — and the form still works without the script', () => {
  const cases = [
    [PAGES.applications, '/platform/applications', 'applications-list applications-tabs'],
    [PAGES.registry, '/platform/registry', 'registry-list'],
    [PAGES.owners, '/platform/owners', 'owners-list'],
  ];
  for (const [html, action, regions] of cases) {
    assert.match(html, new RegExp(`<form class="card row" method="get" action="${action}" role="search" data-live="${regions}">`), action);
    assert.match(html, /<input type="search" name="q"/, 'a real search box, with a real label');
    assert.match(html, /<button type="submit" class="ghost">Search<\/button>/, 'submit still there without the script');
    const list = regions.split(' ')[0];
    assert.match(html, new RegExp(`<p id="${list}-status" class="sr-only" role="status" aria-live="polite"></p>`), 'the count is announced');
    assert.match(html, new RegExp(`<div id="${list}" data-summary="[^"]+">`));
  }
  assert.match(PAGES.applications, /data-summary="1 application\."/);
});

test('the script debounces, keeps the box, swaps only the list, and has no inline handlers', () => {
  const html = PAGES.registry;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.match(script, /setTimeout\(run, 300\)/, '300 ms after typing stops');
  assert.match(script, /fetch\(url, \{ credentials: 'same-origin'/);
  assert.match(script, /new DOMParser\(\)\.parseFromString/);
  assert.match(script, /here\.innerHTML = there\.innerHTML/, 'the list is swapped, never the form');
  assert.match(script, /status\.textContent = fresh\.getAttribute\('data-summary'\)/);
  assert.match(script, /if \(!got\.ok \|\| !fresh\) \{ location\.assign\(url\); return; \}/, 'signed out or refused: go there properly');
  assert.match(script, /ctrl\.abort\(\)/, 'an older search never overwrites a newer one');
  assert.match(script, /history\.replaceState/);
  assert.ok(!/ on[a-z]+=/i.test(html.split('<main')[1]), 'no inline event handlers on the page');
});

test('the shown-once links select themselves without an inline handler', async () => {
  const { activationHandoverPage, inviteHandoverPage } = await import('../platform/views.js');
  for (const html of [
    activationHandoverPage({ activation: { link: 'https://y/a', code: '123456' }, user: STAFF }),
    inviteHandoverPage({ invite: { link: 'https://y/j' }, user: STAFF }),
  ]) {
    assert.match(html, /readonly value="https:\/\/y\/[aj]"[^>]*data-select/);
    assert.doesNotMatch(html, /onclick=/);
  }
});
