// Showing a page of a long list, and saying how long the list is.
//
// The registry had a hard cap of 200 and no way past it. At ten thousand gyms
// it showed 200 and silently hid 9,800 — which is worse than a missing
// feature, because a list that ENDS looks finished. Somebody would conclude a
// gym did not exist because it was on page four.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pageRequest, pageState, pageLink, PAGE_SIZE } from '../platform/paging.js';

// ---------------------------------------------------------------------------
// What to fetch
// ---------------------------------------------------------------------------

test('page one starts at the beginning', () => {
  assert.deepEqual(pageRequest('1'), { page: 1, size: PAGE_SIZE, from: 0, to: PAGE_SIZE - 1 });
});

test('page three skips two pages', () => {
  const r = pageRequest('3', { size: 50 });
  assert.equal(r.from, 100);
  assert.equal(r.to, 149);
});

test('NONSENSE BECOMES PAGE ONE, not a negative offset', () => {
  // A negative offset is a database error, and a confusing one.
  for (const bad of ['-1', '0', 'abc', '', null, undefined, '1.5e9999']) {
    assert.equal(pageRequest(bad).page, 1, `${bad} should fall back to page one`);
    assert.ok(pageRequest(bad).from >= 0);
  }
});

// ---------------------------------------------------------------------------
// What to say
// ---------------------------------------------------------------------------

test('it says how many there are in total', () => {
  const s = pageState({ page: 1, size: 50, total: 1234, returned: 50 });

  assert.equal(s.label, 'Showing 1–50 of 1234');
  assert.equal(s.hasNext, true);
  assert.equal(s.hasPrev, false);
});

test('the last page knows it is last', () => {
  const s = pageState({ page: 25, size: 50, total: 1234, returned: 34 });

  assert.equal(s.label, 'Showing 1201–1234 of 1234');
  assert.equal(s.hasNext, false);
  assert.equal(s.hasPrev, true);
});

test('an empty list says None rather than "0-0 of 0"', () => {
  assert.equal(pageState({ page: 1, total: 0, returned: 0 }).label, 'None');
});

test('A MISSING TOTAL IS NOT ZERO', () => {
  // The count query can fail on its own. Saying "of 0" while showing fifty
  // rows is a contradiction the reader has to resolve.
  const s = pageState({ page: 1, size: 50, total: null, returned: 50 });

  assert.equal(s.total, null);
  assert.equal(s.label, 'Showing 1–50');
  assert.ok(!s.label.includes('of 0'));
  assert.equal(s.hasNext, true, 'a full page implies there may be more');
});

test('without a total, a short page means the end', () => {
  assert.equal(pageState({ page: 1, size: 50, total: null, returned: 12 }).hasNext, false);
});

// ---------------------------------------------------------------------------
// Turning a page must not lose the search
// ---------------------------------------------------------------------------

test('THE FILTERS SURVIVE A PAGE TURN', () => {
  // Losing a search when you turn a page is the most irritating thing a
  // paginated list can do.
  const link = pageLink('/platform/registry', { q: 'BOS', status: 'active' }, 3);

  assert.match(link, /q=BOS/);
  assert.match(link, /status=active/);
  assert.match(link, /page=3/);
});

test('page one carries no page parameter, so the URL stays clean', () => {
  assert.equal(pageLink('/platform/registry', { q: 'BOS' }, 1), '/platform/registry?q=BOS');
});

test('empty filters are left out entirely', () => {
  assert.equal(pageLink('/platform/owners', { q: '', status: null }, 1), '/platform/owners');
});

// ---------------------------------------------------------------------------
// The routes, end to end
//
// The helper being correct is not the same as the lists USING it. These drive
// the real router and read the real HTML, because the bug that was actually
// shipped was a list that never asked for a second page.
// ---------------------------------------------------------------------------

import { test as routeTest } from 'node:test';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

const { handlePlatform } = await import('../platform/router.js');
const { sessionCookie } = await import('../platform/http.js');

const STAFF = { id: 'staff-1', email: 'owner@yoyogyms.com', kind: 'platform_staff' };

function req(url) {
  const r = {
    method: 'GET',
    url,
    headers: { cookie: sessionCookie(STAFF).split(';')[0] },
  };
  r[Symbol.asyncIterator] = async function* () {};
  return r;
}

function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, h || {}); return this; },
    end(b) { this.body = b || ''; return this; },
  };
}

/** A list of `n` rows, carrying a total the way the real deps do. */
function rows(n, make, total) {
  const out = Array.from({ length: n }, (_, i) => make(i));
  out.total = total;
  return out;
}

function pagedDeps(seen) {
  return {
    audit: async () => {},
    permissionsFor: async () => ['gym.view', 'gym.suspend', 'platform.manage', 'audit.view'],
    listGyms: async (f) => { seen.gyms = f; return rows(50, (i) => ({ id: `g${i}`, slug: `gym-${i}`, search_name: `GYM ${i}`, city: 'Cape Town', status: 'active', plan_key: 'basic' }), 4321); },
    listOwners: async (f) => { seen.owners = f; return rows(50, (i) => ({ id: `o${i}`, email: `o${i}@x.co`, full_name: `Owner ${i}`, is_active: true, gym_count: 1 }), 210); },
    listAuditLog: async (f) => { seen.audit = f; return rows(50, (i) => ({ id: `a${i}`, action: 'gym.suspend', actor_kind: 'platform_staff', entity: 'gym', entity_id: 'g1', created_at: '2026-09-20T10:00:00Z' }), 9000); },
  };
}

async function get(url, deps) {
  const r = res();
  await handlePlatform(req(url), r, deps);
  return r;
}

routeTest('THE REGISTRY ASKS FOR A PAGE, NOT A HARD CAP', async () => {
  // The shipped bug: `limit: 200` and no offset. Gym 201 existed and could
  // not be reached from any URL.
  const seen = {};
  await get('/platform/registry?page=3', pagedDeps(seen));

  assert.equal(seen.gyms.from, 100);
  assert.equal(seen.gyms.to, 149);
  assert.equal(seen.gyms.limit, undefined, 'a cap would defeat the range');
});

routeTest('the registry states the REAL total, not the page size', async () => {
  // "50 gyms on the platform" while 4,321 exist is a confident, wrong answer —
  // and somebody would plan capacity around it.
  const r = await get('/platform/registry', pagedDeps({}));

  assert.match(r.body, /4321 gyms on the platform/);
  assert.ok(!/50 gyms on the platform/.test(r.body));
});

routeTest('A SEARCH SURVIVES TURNING THE PAGE', async () => {
  // Losing the filter on page two makes pagination worse than the cap it
  // replaced: the reader ends up somewhere they did not ask to be.
  const r = await get('/platform/registry?q=bos&status=active', pagedDeps({}));

  assert.match(r.body, /href="\/platform\/registry\?q=bos&amp;status=active&amp;page=2"/);
});

routeTest('page one has no Previous LINK, only the words', async () => {
  const r = await get('/platform/registry', pagedDeps({}));
  assert.ok(!/href="[^"]*page=0/.test(r.body), 'page 0 is not a page');
  assert.match(r.body, /← Previous/, 'the words stay, so the control does not jump about');
});

routeTest('the last page offers no Next', async () => {
  const seen = {};
  const deps = pagedDeps(seen);
  deps.listGyms = async () => rows(10, (i) => ({ id: `g${i}`, slug: `g${i}`, search_name: `G${i}`, status: 'active' }), 10);

  const r = await get('/platform/registry', deps);
  assert.ok(!/href="[^"]*page=2"/.test(r.body));
  assert.match(r.body, /Showing 1–10 of 10/, 'and it says the list is complete');
});

routeTest('owners and the audit log page the same way', async () => {
  const seen = {};
  const deps = pagedDeps(seen);

  await get('/platform/owners?page=2&q=ann', deps);
  assert.equal(seen.owners.from, 50);
  assert.equal(seen.owners.query, 'ann');

  await get('/platform/audit?page=4&action=suspend', deps);
  assert.equal(seen.audit.from, 150);
  assert.equal(seen.audit.action, 'suspend');
});

routeTest('the audit filter is carried into the link under its URL name', async () => {
  // The route reads `entity_id` and the filter object calls it `entityId`.
  // Linking the internal name would silently drop the filter on page two.
  const r = await get('/platform/audit?entity_id=gym-1', pagedDeps({}));

  assert.match(r.body, /entity_id=gym-1/);
  assert.ok(!/entityId=/.test(r.body));
});

routeTest('a nonsense page number does not become a negative offset', async () => {
  // `.range(-50, -1)` is a database error, and the reader only typed a URL.
  const seen = {};
  await get('/platform/registry?page=-5', pagedDeps(seen));

  assert.equal(seen.gyms.from, 0);
  assert.equal(seen.gyms.to, 49);
});
