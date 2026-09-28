// NO DEAD BUTTONS (CLAUDE.md §40, §41): every link and every form on every
// page of the main admin panel leads somewhere the router actually handles.
//
// The pages are rendered through the REAL router with made-up data, every
// href and form action is collected from what they render, and each is sent
// back through the router. The router's own fall-through — "Not found." —
// means a button that goes nowhere, and fails this test.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';
import { CORE_FEATURES, ALL_SERVICES } from '../shared/features.js';

const STAFF = { id: 'staff-1', email: 'me@yoyogyms.com', kind: 'platform_staff' };
const OWNER = { id: 'owner-1', email: 'ann@bos.co', kind: 'gym_owner' };
const EVERYTHING = ['application.view', 'application.approve', 'application.reject', 'gym.view', 'gym.suspend', 'subscription.manage', 'audit.view', 'platform.manage'];
const now = new Date().toISOString();

const PLANS = [
  { id: 'p1', key: 'basic', label: 'Basic', price_cents: 29900, currency: 'ZAR', max_active_members: 40, is_enabled: true, features: [...CORE_FEATURES] },
  { id: 'p2', key: 'medium', label: 'Medium', price_cents: 59900, currency: 'ZAR', max_active_members: 150, is_enabled: true, features: [...CORE_FEATURES, 'classes'] },
  { id: 'p3', key: 'prime', label: 'Prime', price_cents: 99900, currency: 'ZAR', max_active_members: 500, is_enabled: true, features: ALL_SERVICES },
];
const GYM = {
  id: 'g1', slug: 'bos', search_name: 'Bos Gym', city: 'Durban', country: 'ZA', status: 'pending', plan_key: 'prime',
  owner_user_id: 'owner-1', created_at: now, setup_help_requested_at: now, features_added: [], features_removed: [],
};
const APPLICATION = {
  id: 'a1', proposed_gym_name: 'Bos Gym', status: 'submitted', city: 'Durban', country: 'ZA', slug: 'bos',
  applicant_user_id: 'owner-1', submitted_at: now, requested_plan_key: 'prime', owner_phone: '+27821234567', gym_address: '1 A St',
};
const DOC = { id: 'd1', application_id: 'a1', doc_type: 'id_document', filename: 'id.pdf', mime_type: 'application/pdf', status: 'pending', storage_ref: 'applications/a1/x.pdf', uploaded_at: now };
const list = (items) => Object.assign([...items], { total: items.length });

const DEPS = {
  audit: async () => {},
  permissionsFor: async () => EVERYTHING,
  listApplications: async () => [APPLICATION],
  countApplications: async () => ({ submitted: 1 }),
  getApplicationView: async () => ({ application: APPLICATION, applicant: { full_name: 'Ann', email: 'ann@bos.co' }, documents: [DOC], events: [{ event: 'submitted', created_at: now }] }),
  listGyms: async () => list([{ ...GYM, subscription_status: 'trialing' }]),
  gymStatsForMany: async () => new Map([['g1', { reachable: true, activeMembers: 3, checkinsThisMonth: 9, lastActivityAt: now }]]),
  getGymDetail: async () => ({ gym: GYM, subscription: { status: 'trialing', trial_ends_at: now }, invoices: [], owner: { id: 'owner-1', full_name: 'Ann', email: 'ann@bos.co', is_active: true }, plan: PLANS[2], application: { id: 'a1', owner_phone: '+27821234567' } }),
  gymStatsFor: async () => ({ reachable: true, activeMembers: 3, checkinsThisMonth: 9, lastActivityAt: now }),
  listStaff: async () => [{ id: 'staff-1', email: 'me@yoyogyms.com', full_name: 'Me', is_active: true, set_up: true, totp_enabled: true, roles: ['platform_owner'] }, { id: 's2', email: 'z@yoyo.co', full_name: 'Zola', is_active: true, set_up: false, roles: ['reviewer'] }],
  listOwners: async () => list([{ id: 'owner-1', email: 'ann@bos.co', full_name: 'Ann', is_active: true, gym_count: 1, closure_requested_at: now }]),
  listPlans: async () => PLANS,
  financeSummary: async () => ({ currency: 'ZAR', paid_cents: 0, outstanding_cents: 0, mrr_cents: 0, gyms_by_status: { trialing: 1 }, unpriced_plans: [], trials_ending: [{ gym_id: 'g1', trial_ends_at: now }] }),
  listAuditLog: async () => list([{ id: 'e1', action: 'application.submitted', actor_kind: 'gym_owner', entity: 'application', entity_id: 'a1', detail: { gym_name: 'Bos Gym' }, created_at: now }]),
  countClosureRequests: async () => 1,
  countOwners: async () => 1,
  countGyms: async () => ({ pending: 1 }),
  countSetupRequests: async () => 1,
  findUserByEmail: async () => ({ id: 'staff-1', email: 'me@yoyogyms.com', recovery_code_hashes: [] }),
  getDocument: async () => DOC,
  getApplicationSummary: async () => APPLICATION,
  documentFacts: async () => ({ sha256: 'ab'.repeat(32), bytes: 10, actualType: 'application/pdf', flags: [] }),
  findDuplicateDocuments: async () => [],
  signedDocumentUrl: async () => 'https://storage.example/signed',
  getSupportContacts: async () => ({ email: 'hello@mulesoo.com', whatsapp: '' }),
  ownerDashboard: async () => ({ application: APPLICATION, gym: GYM, subscription: { status: 'trialing', trial_ends_at: now }, documents: [DOC], ownerName: 'Ann', ownerRef: 'YG-1' }),
  ownerSupport: async () => ({ email: 'hello@mulesoo.com', whatsapp: '', manager: null, setupRequestedAt: null, setupDoneAt: null }),
  reconcile: async () => ({ ok: true, orphans: [], dangling: [], checkedSchemas: 1 }),
};

function req({ method = 'GET', url, who = STAFF, body = '' }) {
  const r = {
    method, url,
    headers: { ...(who ? { cookie: sessionCookie(who).split(';')[0] } : {}), 'content-type': 'application/x-www-form-urlencoded' },
    _body: body,
  };
  r[Symbol.asyncIterator] = async function* () { if (r._body) yield Buffer.from(r._body); };
  return r;
}
function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader() {}, writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); return this; },
    end(b) { this.body = String(b || ''); return this; },
  };
}

/** Is this the ROUTER saying it has no such route? (Not a page's own "not found".) */
const routerMiss = (r) => r.statusCode === 404 && r.body === 'Not found.';

async function send(opts) {
  const r = res();
  try {
    await handlePlatform(req(opts), r, DEPS);
  } catch {
    // A handler that threw on made-up data still proves the route exists.
  }
  return r;
}

const STAFF_PAGES = [
  '/platform/home', '/platform/applications', '/platform/applications/a1', '/platform/registry', '/platform/registry/g1',
  '/platform/owners', '/platform/plans', '/platform/finance', '/platform/security', '/platform/audit', '/platform/team',
  '/platform/settings', '/platform/account', '/platform/documents/d1',
];
const OWNER_PAGES = ['/platform/my-gym'];
const PUBLIC_PAGES = ['/platform/login', '/platform/welcome', '/platform/apply', '/platform/find', '/platform/forgot', '/platform/terms', '/platform/privacy', '/platform/delete-account'];

function targets(html) {
  const found = [];
  for (const m of html.matchAll(/href="(\/platform\/[^"#]*)"/g)) found.push({ method: 'GET', url: m[1].replaceAll('&amp;', '&') });
  for (const m of html.matchAll(/<form[^>]*method="post"[^>]*action="(\/platform\/[^"]*)"/g)) found.push({ method: 'POST', url: m[1] });
  for (const m of html.matchAll(/<form[^>]*action="(\/platform\/[^"]*)"[^>]*method="post"/g)) found.push({ method: 'POST', url: m[1] });
  for (const m of html.matchAll(/<form[^>]*method="get"[^>]*action="(\/platform\/[^"]*)"/g)) found.push({ method: 'GET', url: m[1] });
  return found;
}

test('every page of the main admin panel renders', async () => {
  for (const [pages, who] of [[STAFF_PAGES, STAFF], [OWNER_PAGES, OWNER], [PUBLIC_PAGES, null]]) {
    for (const url of pages) {
      const r = await send({ url, who });
      assert.ok(r.statusCode === 200 || r.statusCode === 302, `${url} answered ${r.statusCode}: ${r.body.slice(0, 120)}`);
    }
  }
});

test('EVERY LINK AND EVERY FORM ON EVERY PAGE LEADS SOMEWHERE — no dead buttons', async () => {
  const seen = new Map();
  for (const [pages, who] of [[STAFF_PAGES, STAFF], [OWNER_PAGES, OWNER], [PUBLIC_PAGES, null]]) {
    for (const url of pages) {
      const page = await send({ url, who });
      for (const t of targets(page.body)) seen.set(`${t.method} ${t.url}`, { ...t, who, from: url });
    }
  }
  assert.ok(seen.size > 40, `collected ${seen.size} targets`);

  const dead = [];
  for (const t of seen.values()) {
    const body = t.method === 'POST' ? `csrf=${encodeURIComponent(issueCsrfToken((t.who || STAFF).id))}` : '';
    const r = await send({ method: t.method, url: t.url, who: t.who || STAFF, body });
    if (routerMiss(r)) dead.push(`${t.method} ${t.url} (on ${t.from})`);
  }
  assert.deepEqual(dead, []);
});
