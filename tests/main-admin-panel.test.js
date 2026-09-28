// The main admin panel, corporate level, with every tenant gym under its
// control (CLAUDE.md §40, §40.1). One test per finding or answer, named after
// it, so a regression says which promise it broke.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';
import {
  layout,
  ownerDashboardPage,
  applicationDetailPage,
  registryPage,
  documentReviewPage,
  settingsPage,
} from '../platform/views.js';
import { readApplication, normalisePhone } from '../platform/application-form.js';
import { approveApplication } from '../platform/applications.js';
import { missingRequiredDocuments, REQUIRED_DOCUMENTS } from '../platform/documents.js';
import { decisionEmail, staffInviteEmail } from '../platform/email.js';
import { teamChangeProblem, checkInvite, inviteProblem, issueInvite, inviteLookupHash } from '../platform/team.js';
import { searchText } from '../platform/deps.js';

const STAFF = { id: 'staff-1', email: 'me@yoyogyms.com', kind: 'platform_staff' };
const OWNER = { id: 'owner-1', email: 'ann@bos.co', kind: 'gym_owner' };
const cookie = (who = STAFF) => sessionCookie(who).split(';')[0];
const csrf = (id = 'staff-1') => encodeURIComponent(issueCsrfToken(id));

const EVERYTHING = [
  'application.view', 'application.approve', 'application.reject', 'gym.view', 'gym.suspend',
  'subscription.manage', 'audit.view', 'platform.manage',
];

function req({ method = 'GET', url = '', who = STAFF, body = '' } = {}) {
  const r = {
    method, url,
    headers: { ...(who ? { cookie: cookie(who) } : {}), 'content-type': 'application/x-www-form-urlencoded' },
    _body: body,
  };
  r[Symbol.asyncIterator] = async function* () { if (r._body) yield Buffer.from(r._body); };
  return r;
}

function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, h) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v;
      return this;
    },
    end(b) { this.body = b || ''; return this; },
  };
}

async function call(opts, deps) {
  const r = res();
  await handlePlatform(req(opts), r, { audit: async () => {}, permissionsFor: async () => EVERYTHING, ...deps });
  return r;
}

const ACCEPTED = REQUIRED_DOCUMENTS.map((doc_type) => ({ doc_type, status: 'accepted' }));

// ---------------------------------------------------------------------------
// F-40.2 — owners never see the staff menu; staff see only what they may open
// ---------------------------------------------------------------------------

test('F-40.2 AN OWNER NEVER SEES THE STAFF MENU — only "My gym" and "Sign out"', () => {
  const html = ownerDashboardPage({ user: { email: 'ann@bos.co' }, application: { id: 'a1', proposed_gym_name: 'Bos', status: 'submitted' } });
  for (const href of ['/platform/applications', '/platform/registry', '/platform/owners', '/platform/finance', '/platform/home']) {
    assert.ok(!html.includes(`href="${href}"`), `${href} is a staff page`);
  }
  assert.match(html, /href="\/platform\/my-gym"/);
  assert.match(html, /href="\/platform\/logout">Sign out/);
});

test('F-40.2 a reviewer is shown Applications and not Plans, Finances, Team or Settings', () => {
  const html = layout({ title: 'x', body: '', user: { email: 'r@yoyo', kind: 'platform_staff', perms: ['application.view'] } });
  assert.match(html, /href="\/platform\/applications"/);
  for (const href of ['/platform/plans', '/platform/finance', '/platform/team', '/platform/settings', '/platform/audit']) {
    assert.ok(!html.includes(`href="${href}"`), `${href} would answer "forbidden"`);
  }
});

test('THE PANEL HAS A SIGN-OUT LINK — it had none', () => {
  const html = layout({ title: 'x', body: '', user: { email: 'r@yoyo', kind: 'platform_staff', perms: [] } });
  assert.match(html, /href="\/platform\/logout"/);
  assert.match(html, /Sign out/);
});

test('F-40.2 an owner session opening Today is sent to their own page, not shown platform figures', async () => {
  const r = await call({ url: '/platform/home', who: OWNER }, { permissionsFor: async () => [] });
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/my-gym');
});

test('a staff account with no access at all (switched off, or no role) sees nothing on Today', async () => {
  const r = await call({ url: '/platform/home' }, { permissionsFor: async () => [] });
  assert.equal(r.statusCode, 403);
  assert.match(r.body, /no access/i);
});

test('the menu marks where you are', () => {
  const html = layout({ title: 'x', body: '', active: 'registry', user: { email: 'a', kind: 'platform_staff', perms: EVERYTHING } });
  assert.match(html, /href="\/platform\/registry" class="on" aria-current="page"/);
});

// ---------------------------------------------------------------------------
// F-40.6 — status labels coloured by meaning
// ---------------------------------------------------------------------------

test('F-40.6 a suspended gym and an active one no longer look the same', () => {
  const html = registryPage({
    gyms: [
      { id: 'g1', slug: 'a', search_name: 'Alpha', status: 'active', subscription_status: 'active' },
      { id: 'g2', slug: 'b', search_name: 'Beta', status: 'suspended', subscription_status: 'past_due' },
    ],
  });
  assert.match(html, /tag tag--good">active/);
  assert.match(html, /tag tag--bad">suspended/);
  assert.match(html, /tag tag--warn">past due/, 'underscores read as words');
});

// ---------------------------------------------------------------------------
// Q2 / F-40.3 — phone and address; the reviewer sees who applied
// ---------------------------------------------------------------------------

test('Q2 a phone number keeps its country code; "00" is the prefix written out', () => {
  assert.equal(normalisePhone('+27 82 123 4567'), '+27821234567');
  assert.equal(normalisePhone('0027 (82) 123-4567'), '+27821234567');
  assert.equal(normalisePhone('082 123 4567'), null, 'no country code: refused, never guessed');
  assert.equal(normalisePhone('+1'), null);
});

test('Q2 an application without a phone, or without the gym address, is refused with a reason', () => {
  const base = { owner_name: 'Ann', email: 'a@b.co', password: 'longenough1', gym_name: 'Bos', plan: 'basic' };
  assert.match(readApplication({ ...base, address: '1 A St' }).error, /phone number/);
  assert.match(readApplication({ ...base, phone: '+27821234567' }).error, /street address/);
  const ok = readApplication({ ...base, phone: '+27821234567', address: ' 1 A St ' });
  assert.equal(ok.error, null);
  assert.equal(ok.input.address, '1 A St');
});

test('F-40.3 THE REVIEWER SEES WHO APPLIED: name, email, phone, address, plan, members, needs', () => {
  const html = applicationDetailPage({
    application: {
      id: 'a1', proposed_gym_name: 'Bos Gym', status: 'submitted', city: 'Cape Town', country: 'ZA',
      owner_phone: '+27821234567', gym_address: '12 Main Rd', requested_plan_key: 'medium',
      estimated_members: 120, owner_needs: 'SMS reminders', slug: 'bos-gym',
    },
    applicant: { full_name: 'Ann Bos', email: 'ann@bos.co' },
    documents: [],
    events: [],
  });
  for (const fact of ['Ann Bos', 'mailto:ann@bos.co', 'tel:+27821234567', '12 Main Rd', 'medium', '120', 'SMS reminders']) {
    assert.ok(html.includes(fact), `shows ${fact}`);
  }
});

// ---------------------------------------------------------------------------
// Q3 / F-40.4 — the three required documents, each ACCEPTED
// ---------------------------------------------------------------------------

test('Q3 uploaded is not enough: a required document counts once it is ACCEPTED', () => {
  assert.deepEqual(missingRequiredDocuments([]), REQUIRED_DOCUMENTS);
  assert.deepEqual(
    missingRequiredDocuments([
      { doc_type: 'id_document', status: 'accepted' },
      { doc_type: 'business_registration', status: 'pending' },
      { doc_type: 'proof_of_address', status: 'rejected' },
      { doc_type: 'insurance', status: 'accepted' },
    ]),
    ['business_registration', 'proof_of_address']
  );
  assert.deepEqual(missingRequiredDocuments(ACCEPTED), []);
});

function approvalDeps(documents) {
  const d = {
    provisioned: 0,
    getApplication: async () => ({ id: 'a1', status: 'submitted', slug: 'bos', applicant_user_id: 'u1' }),
    updateApplication: async () => {},
    appendEvent: async () => {},
    provisionGym: async () => { d.provisioned += 1; return { ok: true, gym: { id: 'g1' } }; },
    audit: async () => {},
  };
  if (documents !== undefined) d.listDocuments = async () => documents;
  return d;
}

const reviewer = { id: 's1', permissions: ['application.approve', 'application.reject'] };

test('Q3 APPROVAL IS REFUSED UNTIL ALL THREE ARE ACCEPTED — and nothing is provisioned', async () => {
  const d = approvalDeps([{ doc_type: 'id_document', status: 'accepted' }]);
  const r = await approveApplication('a1', reviewer, d, { dryRun: false });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingDocuments, ['business_registration', 'proof_of_address']);
  assert.match(r.error, /Business registration, Proof of address/);
  assert.equal(d.provisioned, 0);
});

test('Q3 fails CLOSED: a caller that cannot list the documents has shown none', async () => {
  const d = approvalDeps(undefined);
  const r = await approveApplication('a1', reviewer, d, { dryRun: false });
  assert.equal(r.ok, false);
  assert.equal(d.provisioned, 0);
});

test('Q3 with all three accepted, approval goes ahead', async () => {
  const d = approvalDeps(ACCEPTED);
  const r = await approveApplication('a1', reviewer, d, { dryRun: false });
  assert.equal(r.ok, true);
  assert.equal(d.provisioned, 1);
});

test('Q3 the Approve button is greyed out, and says which documents are missing', () => {
  const page = (documents) =>
    applicationDetailPage({ application: { id: 'a1', proposed_gym_name: 'Bos', status: 'submitted' }, documents, events: [] });
  assert.match(page([]), /value="approve" disabled/);
  assert.match(page([]), /unavailable until the required documents are accepted/);
  assert.ok(!/value="approve" disabled/.test(page(ACCEPTED.map((d, i) => ({ ...d, id: `d${i}` })))));
});

test('Q3 a refused approval says "Documents still needed", with the way back', async () => {
  const r = await call(
    { method: 'POST', url: '/platform/applications/a1/decide', body: `action=approve&csrf=${csrf()}` },
    { decide: async () => ({ ok: false, error: 'Nothing was approved: …', missingDocuments: ['id_document'] }) }
  );
  assert.equal(r.statusCode, 409);
  assert.match(r.body, /Documents still needed/);
  assert.match(r.body, /href="\/platform\/applications\/a1"/);
});

// ---------------------------------------------------------------------------
// F-40.5 — the owner is told
// ---------------------------------------------------------------------------

test('F-40.5 the decision email carries the reason, escaped, and the way to act on it', () => {
  const mail = decisionEmail({ gymName: 'Bos', decision: 'info_requested', reason: '<b>Your ID</b>', signInUrl: 'https://y/platform/login?as=owner' });
  assert.match(mail.html, /&lt;b&gt;Your ID/);
  assert.match(mail.html, /href="https:\/\/y\/platform\/login\?as=owner"/);
  assert.match(mail.text, /Sign in: https:\/\/y\/platform\/login\?as=owner/);
});

test('F-40.5 WHEN THE EMAIL FAILS, THE REVIEWER IS TOLD — with the address to write to', async () => {
  const r = await call(
    { method: 'POST', url: '/platform/applications/a1/decide', body: `action=reject&reason=No&csrf=${csrf()}` },
    { decide: async () => ({ ok: true, emailed: false, emailTo: 'ann@bos.co', emailReason: 'email_not_configured' }) }
  );
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /not emailed/);
  assert.match(r.body, /ann@bos\.co/);
});

test('F-40.5 the owner reads the request, and the reason for a refusal, on their own page', () => {
  const asked = ownerDashboardPage({
    user: { email: 'a' },
    application: { id: 'a1', proposed_gym_name: 'Bos', status: 'info_requested', review_notes: 'A clearer copy of your ID' },
  });
  assert.match(asked, /A clearer copy of your ID/);
  assert.match(asked, /Your ID \(required\)/, 'the upload names the required documents');

  const refused = ownerDashboardPage({
    user: { email: 'a' },
    application: { id: 'a1', proposed_gym_name: 'Bos', status: 'rejected', decision_reason: 'Not a gym' },
  });
  assert.match(refused, /Not a gym/);
  assert.match(refused, /href="\/platform\/apply"/);
});

test('F-40.5 AN ANSWER GOES BACK TO THE QUEUE: an upload after "request information" resumes the review', async () => {
  const resumed = [];
  const r = await call(
    {
      method: 'POST',
      url: '/platform/my-gym/documents/confirm',
      who: OWNER,
      body: `csrf=${csrf('owner-1')}&application_id=a1&doc_type=id_document&storage_ref=applications/a1/id-1.pdf&filename=id.pdf&mime_type=application/pdf&size_bytes=10`,
    },
    {
      findOwnApplication: async () => ({ id: 'a1', applicant_user_id: 'owner-1', status: 'info_requested' }),
      recordDocument: async () => ({ id: 'd1' }),
      resumeReview: async (id, userId) => resumed.push({ id, userId }),
    }
  );
  assert.equal(r.statusCode, 302);
  assert.deepEqual(resumed, [{ id: 'a1', userId: 'owner-1' }]);
});

// ---------------------------------------------------------------------------
// F-40.8 — documents on a phone
// ---------------------------------------------------------------------------

test('F-40.8 A DOCUMENT ALWAYS HAS "OPEN" AND "DOWNLOAD", outside the embedded viewer', () => {
  const html = documentReviewPage({ doc: { id: 'd1', application_id: 'a1', mime_type: 'application/pdf', filename: 'id.pdf', status: 'pending' } });
  const viewer = html.indexOf('<object');
  assert.ok(html.indexOf('Open in a new tab') < viewer && html.indexOf('Open in a new tab') > 0);
  assert.ok(html.indexOf('href="/platform/documents/d1/file?download=1"') < viewer);
});

test('F-40.8 ?download=1 asks storage for a file to save, under its own name', async () => {
  let asked = null;
  const r = await call(
    { url: '/platform/documents/d1/file?download=1' },
    {
      getDocument: async () => ({ id: 'd1', storage_ref: 'a1/x.pdf', filename: 'id.pdf' }),
      signedDocumentUrl: async (ref, seconds, options) => { asked = { ref, seconds, options }; return 'https://storage/signed'; },
    }
  );
  assert.equal(r.statusCode, 302);
  assert.deepEqual(asked, { ref: 'a1/x.pdf', seconds: 300, options: { download: 'id.pdf' } });
});

// ---------------------------------------------------------------------------
// F-40.9 — a new activation link
// ---------------------------------------------------------------------------

function activationDeps(status, emailed = true) {
  const calls = { retired: [], issued: [] };
  return {
    calls,
    getGymDetail: async () => ({ gym: { id: 'g1', slug: 'bos', search_name: 'Bos', status, owner_user_id: 'owner-1' } }),
    retireActivations: async (u, g) => calls.retired.push([u, g]),
    issueActivation: async (a) => { calls.issued.push(a); return { emailed, link: 'https://y/activate?token=t', code: '123456', to: 'ann@bos.co' }; },
  };
}

test('F-40.9 A GYM WAITING FOR ITS OWNER CAN BE SENT A NEW LINK — and the old one is retired', async () => {
  const d = activationDeps('pending');
  const r = await call({ method: 'POST', url: '/platform/registry/g1/resend-activation', body: `csrf=${csrf()}` }, d);
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/registry/g1?sent=activation');
  assert.deepEqual(d.calls.retired, [['owner-1', 'g1']]);
  assert.deepEqual(d.calls.issued, [{ userId: 'owner-1', gymId: 'g1' }]);
});

test('F-40.9 with no email, the link and code are handed to the reviewer once', async () => {
  const r = await call({ method: 'POST', url: '/platform/registry/g1/resend-activation', body: `csrf=${csrf()}` }, activationDeps('pending', false));
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /123456/);
  assert.match(r.body, /Back to the gym/);
});

test('F-40.9 an open gym has nothing to activate', async () => {
  const d = activationDeps('active');
  const r = await call({ method: 'POST', url: '/platform/registry/g1/resend-activation', body: `csrf=${csrf()}` }, d);
  assert.equal(r.statusCode, 409);
  assert.equal(d.calls.issued.length, 0);
});

test('F-40.9 sending one needs the onboarding permission', async () => {
  const d = activationDeps('pending');
  const r = await call(
    { method: 'POST', url: '/platform/registry/g1/resend-activation', body: `csrf=${csrf()}` },
    { ...d, permissionsFor: async () => ['gym.view'] }
  );
  assert.equal(r.statusCode, 403);
  assert.equal(d.calls.issued.length, 0);
});

// ---------------------------------------------------------------------------
// Q4 / F-40.10 — the Team page
// ---------------------------------------------------------------------------

const owner = (id, extra = {}) => ({ id, email: `${id}@y`, roles: ['platform_owner'], is_active: true, ...extra });

test('Q4 NOBODY CHANGES THEIR OWN ROLE OR SWITCHES THEMSELVES OFF', () => {
  assert.match(teamChangeProblem({ actorId: 'a', target: owner('a'), change: 'deactivate', activeOwners: 3 }), /yourself/);
  assert.match(teamChangeProblem({ actorId: 'a', target: owner('a'), change: 'role', newRole: 'reviewer', activeOwners: 3 }), /own role/);
});

test('Q4 THE LAST PLATFORM OWNER CAN NEVER BE DEMOTED OR SWITCHED OFF', () => {
  assert.match(teamChangeProblem({ actorId: 'a', target: owner('b'), change: 'deactivate', activeOwners: 1 }), /last platform owner/);
  assert.match(teamChangeProblem({ actorId: 'a', target: owner('b'), change: 'role', newRole: 'billing', activeOwners: 1 }), /last platform owner/);
  assert.equal(teamChangeProblem({ actorId: 'a', target: owner('b'), change: 'deactivate', activeOwners: 2 }), null);
  assert.equal(teamChangeProblem({ actorId: 'a', target: owner('b', { roles: ['reviewer'] }), change: 'deactivate', activeOwners: 1 }), null);
});

test('Q4 an invitation stores only a hash, works once, and expires', () => {
  const now = new Date('2026-09-28T10:00:00Z');
  const { token, row } = issueInvite({ userId: 'u1', invitedBy: 'a', now });
  assert.ok(!JSON.stringify(row).includes(token), 'the raw token is never stored');
  assert.equal(row.token_hash, inviteLookupHash(token));
  assert.equal(checkInvite(row, now).ok, true);
  assert.equal(checkInvite({ ...row, used_at: now.toISOString() }, now).ok, false);
  assert.match(checkInvite(row, new Date('2026-10-02T10:00:00Z')).reason, /expired/);
  assert.equal(checkInvite(null).ok, false);
});

test('Q4 an invitation needs a name, a real email and one of the six roles', () => {
  assert.match(inviteProblem({ email: 'x@y.co', fullName: '', role: 'reviewer' }), /name/);
  assert.match(inviteProblem({ email: 'nope', fullName: 'X', role: 'reviewer' }), /email/);
  assert.match(inviteProblem({ email: 'x@y.co', fullName: 'X', role: 'god' }), /role/);
  assert.equal(inviteProblem({ email: 'x@y.co', fullName: 'X', role: 'billing' }), null);
});

test('Q4 the Team page is for the platform owner only', async () => {
  const r = await call({ url: '/platform/team' }, { permissionsFor: async () => ['application.view'], listStaff: async () => [] });
  assert.equal(r.statusCode, 403);
});

test('Q4 inviting sends the invitation; with no email the link is shown once', async () => {
  const invited = [];
  const deps = (emailed) => ({
    listStaff: async () => [],
    inviteStaff: async (a) => { invited.push(a); return { ok: true, emailed, link: 'https://y/platform/join?token=abc', to: a.email }; },
  });
  const body = `csrf=${csrf()}&full_name=Zola&email=zola@yoyo.com&role=reviewer`;

  const sent = await call({ method: 'POST', url: '/platform/team/invite', body }, deps(true));
  assert.equal(sent.headers.location, '/platform/team?done=invited');
  assert.equal(invited[0].role, 'reviewer');
  assert.equal(invited[0].invitedBy, 'staff-1');

  const shown = await call({ method: 'POST', url: '/platform/team/invite', body }, deps(false));
  assert.match(shown.body, /join\?token=abc/);
});

test('Q4 the server refuses a change to your own account, whatever the page offered', async () => {
  let changed = false;
  const r = await call(
    { method: 'POST', url: '/platform/team/staff-1/deactivate', body: `csrf=${csrf()}` },
    {
      listStaff: async () => [],
      staffMember: async () => owner('staff-1'),
      countActiveOwners: async () => 5,
      setStaffActive: async () => { changed = true; },
    }
  );
  assert.equal(r.statusCode, 400);
  assert.equal(changed, false);
});

test('Q4 an invitation link that is unknown or used cannot set up an account', async () => {
  const r = await call({ url: '/platform/join?token=nope', who: null }, { findInvite: async () => null });
  assert.equal(r.statusCode, 400);
  assert.match(r.body, /cannot be used/);
});

test('Q4 A VALID INVITATION ASKS FOR A PASSWORD AND AN AUTHENTICATOR — like the first owner\'s setup', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const r = await call(
    { url: '/platform/join?token=abc', who: null },
    {
      findInvite: async () => ({
        invite: { id: 'i1', expires_at: future, used_at: null },
        user: { id: 'u9', email: 'zola@yoyo.com', kind: 'platform_staff', password_hash: null, is_active: true },
      }),
    }
  );
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /action="\/platform\/join"/);
  assert.match(r.body, /name="totp"/);
  assert.match(r.body, /zola@yoyo\.com/);
});

test('Q4 the invitation email says what the link does', () => {
  const mail = staffInviteEmail({ name: '<Zola>', roleLabel: 'Reviewer', link: 'https://y/platform/join?token=t' });
  assert.match(mail.html, /&lt;Zola&gt;/);
  assert.match(mail.html, /authenticator/);
  assert.match(mail.text, /join\?token=t/);
});

// ---------------------------------------------------------------------------
// Settings — every switch, never a value
// ---------------------------------------------------------------------------

test('SETTINGS NAME EVERY SWITCH AND NEVER SHOW A VALUE', async () => {
  const before = { ...process.env };
  process.env.PAYSTACK_SECRET_KEY = 'sk_live_TOPSECRET_123';
  process.env.PLATFORM_CRON_SECRET = 'cron-TOPSECRET-456';
  try {
    const r = await call({ url: '/platform/settings' }, {});
    assert.equal(r.statusCode, 200);
    assert.ok(!r.body.includes('TOPSECRET'), 'no secret value reaches the page');
    for (const name of ['PLATFORM_PROVISION_LIVE', 'PLATFORM_BILLING_LIVE', 'PAYSTACK_SECRET_KEY', 'BREVO_API_KEY', 'PLATFORM_CRON_SECRET']) {
      assert.ok(r.body.includes(name), `names ${name}`);
    }
  } finally {
    process.env = before;
  }
});

test('settings are for the platform owner only', async () => {
  const r = await call({ url: '/platform/settings' }, { permissionsFor: async () => ['gym.view'] });
  assert.equal(r.statusCode, 403);
});

test('the settings page renders a switch state, not a value', () => {
  const html = settingsPage({ switches: [{ label: 'Email', what: 'w', name: 'BREVO_API_KEY', on: true, onText: 'set' }] });
  assert.match(html, /tag--good">set/);
});

// ---------------------------------------------------------------------------
// F-40.7 — every gym's activity, counts only
// ---------------------------------------------------------------------------

test('F-40.7 THE GYM LIST SHOWS WHAT EACH GYM IS DOING — counts only', () => {
  const stats = new Map([
    ['g1', { reachable: true, activeMembers: 3, checkinsThisMonth: 41, lastActivityAt: null }],
    ['g2', { reachable: false }],
  ]);
  const html = registryPage({
    gyms: [
      { id: 'g1', slug: 'kom', search_name: 'KOM', status: 'active' },
      { id: 'g2', slug: 'b', search_name: 'Beta', status: 'active' },
    ],
    stats,
  });
  assert.match(html, /<td>3<\/td>/);
  assert.match(html, /<td>41<\/td>/);
  assert.match(html, /unreachable/, 'a gym that cannot be reached says so');
});

test('the gym list asks for its counts in ONE call for the page', async () => {
  let asked = null;
  await call(
    { url: '/platform/registry' },
    {
      listGyms: async () => Object.assign([{ id: 'g1', slug: 'kom', status: 'active' }], { total: 1 }),
      gymStatsForMany: async (gyms, actor) => { asked = { n: gyms.length, actor }; return new Map(); },
    }
  );
  assert.deepEqual(asked, { n: 1, actor: 'staff-1' });
});

// ---------------------------------------------------------------------------
// Search text cannot change the shape of a filter
// ---------------------------------------------------------------------------

test('A SEARCH CANNOT ADD A CONDITION: commas and brackets are dropped', () => {
  assert.equal(searchText('a,status.eq.suspended'), 'a status.eq.suspended');
  assert.equal(searchText('x)or(1=1'), 'x or 1 1');
  assert.equal(searchText("O'Brien@gym.co"), "O'Brien@gym.co", 'names and emails survive');
  assert.equal(searchText('x'.repeat(200)).length, 80);
});
