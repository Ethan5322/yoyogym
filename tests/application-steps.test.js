// The gym-owner application, step by step (CLAUDE.md §42, §42.1).
//
// The user's report: an application was "submitted" before any document was
// uploaded, and there was no upload button to be found. Now: details save a
// DRAFT and sign the owner in; one upload box per required document, PDF or
// photo, on any device; a review page; and Submit — refused, on the server,
// until the three documents are in. One test per promise.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';
process.env.JWT_SECRET ||= 'test-only-gym-secret';

import { fakeDb } from './fake-db.js';
import { readApplication } from '../platform/application-form.js';
import { ownerDeps } from '../platform/deps.js';
import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';
import {
  applyDocumentsPage,
  applyReviewPage,
  applicationDetailPage,
  documentReviewPage,
  APPLICATION_TABS,
} from '../platform/views.js';
import { finishApplicationEmail } from '../platform/email.js';

const OWNER = { id: 'owner-1', email: 'ann@bos.co', kind: 'gym_owner' };
const OTHER = { id: 'owner-2', email: 'bob@iron.co', kind: 'gym_owner' };
const STAFF = { id: 'staff-1', email: 'me@yoyogyms.com', kind: 'platform_staff' };
const EVERYTHING = ['application.view', 'application.approve', 'application.reject', 'gym.view', 'audit.view', 'platform.manage'];

function req({ method = 'GET', url = '', who = OWNER, body = '' } = {}) {
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
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, h) { this.statusCode = code; for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v; return this; },
    end(b) { this.body = b || ''; return this; },
  };
}
async function call(opts, deps) {
  const r = res();
  await handlePlatform(req(opts), r, { audit: async () => {}, permissionsFor: async () => EVERYTHING, listPlans: async () => [], ...deps });
  return r;
}
const csrf = (id = OWNER.id) => encodeURIComponent(issueCsrfToken(id));

const DRAFT = {
  id: 'app-1', applicant_user_id: OWNER.id, status: 'draft', proposed_gym_name: 'BOS GYM', slug: 'bos-gym',
  owner_phone: '+27821234567', gym_address: '1 Main Rd', city: 'Durban', country: 'ZA',
  requested_plan_key: 'medium', estimated_members: 120, owner_needs: 'SMS reminders', created_at: '2026-09-29T08:00:00Z',
};
const doc = (doc_type, extra = {}) => ({ id: `doc-${doc_type}`, application_id: 'app-1', doc_type, status: 'pending', filename: `${doc_type}.pdf`, size_bytes: 2048, uploaded_at: '2026-09-29T08:10:00Z', storage_ref: `app-1/${doc_type}/x.pdf`, ...extra });
const ALL_THREE = [doc('id_document'), doc('business_registration'), doc('proof_of_address')];

// ---------------------------------------------------------------------------
// The rule, on the server
// ---------------------------------------------------------------------------

test('correcting a draft does not ask for the email, password or agreement again', () => {
  const { error } = readApplication(
    { owner_name: 'Ann', phone: '+27821234567', gym_name: 'BOS GYM', address: '1 Main Rd', plan: 'basic' },
    { editing: true }
  );
  assert.equal(error, null);
  // …but a new application still needs all three.
  assert.match(readApplication({ owner_name: 'Ann', phone: '+27821234567', gym_name: 'BOS GYM', address: '1 Main Rd', plan: 'basic' }).error, /email/);
});

test('SUBMIT IS REFUSED WITHOUT THE THREE DOCUMENTS, and says which are missing', async () => {
  const db = fakeDb({ gym_applications: [{ ...DRAFT }], application_documents: [doc('id_document')], platform_users: [{ id: OWNER.id, email: OWNER.email }] });
  const result = await ownerDeps(db).submitApplication(OWNER.id);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['business_registration', 'proof_of_address']);
  assert.match(result.error, /Business registration, Proof of address/);
  assert.equal(db.tables.gym_applications[0].status, 'draft', 'nothing was sent');
});

test('a REJECTED document does not count as uploaded', async () => {
  const docs = [doc('id_document', { status: 'rejected' }), doc('business_registration'), doc('proof_of_address')];
  const db = fakeDb({ gym_applications: [{ ...DRAFT }], application_documents: docs, platform_users: [{ id: OWNER.id, email: OWNER.email }] });
  const result = await ownerDeps(db).submitApplication(OWNER.id);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['id_document']);
});

test('with the three documents in, Submit sends it to the review queue — once', async () => {
  const db = fakeDb({ gym_applications: [{ ...DRAFT }], application_documents: ALL_THREE, platform_users: [{ id: OWNER.id, email: OWNER.email }], application_events: [], platform_audit_log: [] });
  const deps = ownerDeps(db);

  const result = await deps.submitApplication(OWNER.id);
  assert.equal(result.ok, true);
  const app = db.tables.gym_applications[0];
  assert.equal(app.status, 'submitted');
  assert.ok(app.submitted_at, 'the time it was sent');
  assert.deepEqual(db.tables.application_events.map((e) => e.event), ['submitted']);

  const again = await deps.submitApplication(OWNER.id);
  assert.equal(again.ok, false, 'a sent application cannot be sent again');
});

test("an owner never sees, edits or submits someone else's draft", async () => {
  const db = fakeDb({ gym_applications: [{ ...DRAFT }], application_documents: ALL_THREE, platform_users: [] });
  const deps = ownerDeps(db);
  assert.equal(await deps.findOwnDraft(OTHER.id), null);
  const edit = await deps.updateDraftApplication(OTHER.id, { gym_name: 'STOLEN GYM', owner_name: 'Bob' });
  assert.equal(edit.ok, false);
  assert.equal(db.tables.gym_applications[0].proposed_gym_name, 'BOS GYM');
  assert.equal((await deps.submitApplication(OTHER.id)).ok, false);
});

test('the owner corrects their own draft', async () => {
  const db = fakeDb({ gym_applications: [{ ...DRAFT }], gyms: [], platform_users: [{ id: OWNER.id, full_name: 'Ann' }] });
  const result = await ownerDeps(db).updateDraftApplication(OWNER.id, {
    owner_name: 'Ann Bos', gym_name: 'BOS GYM DURBAN', address: '2 Beach Rd', city: 'Durban', country: 'ZA',
    phone: '+27829999999', plan_key: 'prime', estimated_members: 200, needs: null,
  });
  assert.equal(result.ok, true);
  const app = db.tables.gym_applications[0];
  assert.equal(app.proposed_gym_name, 'BOS GYM DURBAN');
  assert.equal(app.slug, 'bos-gym-durban', 'the search name follows the gym name');
  assert.equal(app.gym_address, '2 Beach Rd');
  assert.equal(app.status, 'draft', 'still a draft until Submit');
  assert.equal(db.tables.platform_users[0].full_name, 'Ann Bos');
});

// ---------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------

test('step 2 has ONE upload box per required document, taking a PDF or a photo', () => {
  const page = applyDocumentsPage({ application: DRAFT, documents: [], csrfToken: 't' });
  for (const label of ['ID document', 'Business registration', 'Proof of address']) assert.match(page, new RegExp(label));
  assert.equal((page.match(/<span class="req">Required<\/span>/g) || []).length, 3);
  // Any device: on a phone "image/*" offers the camera and the photo library.
  assert.equal((page.match(/accept="application\/pdf,image\/\*"/g) || []).length, 7, 'three required + four optional');
  assert.match(page, /<b>0 of 3<\/b> required documents uploaded/);
  assert.match(page, /<button class="cta" type="button" disabled>/, 'no way on until all three are in');
});

test('a photo is turned into a JPEG on the device, so any computer can open it (F-42.3)', () => {
  const page = applyDocumentsPage({ application: DRAFT, documents: [], csrfToken: 't' });
  assert.match(page, /canvas\.toBlob\([\s\S]*'image\/jpeg'/);
  assert.match(page, /isHeic/, 'an iPhone HEIC is handled');
  assert.match(page, /\/platform\/my-gym\/documents\/request/);
  assert.match(page, /respond', 'json'/, 'the page stays put and shows the new file');
});

test('with all three uploaded, the owner can go on to check and submit', () => {
  const page = applyDocumentsPage({ application: DRAFT, documents: ALL_THREE, csrfToken: 't' });
  assert.match(page, /<b>3 of 3<\/b>/);
  assert.match(page, /<a class="cta" href="\/platform\/apply\/review">/);
  assert.match(page, /href="\/platform\/apply\/documents\/doc-id_document"/, 'each file can be opened to check it');
  assert.match(page, /Replace the file/);
});

test('step 3 shows everything written and every document before it is sent', () => {
  const page = applyReviewPage({
    application: DRAFT, documents: ALL_THREE, email: 'ann@bos.co', ownerName: 'Ann',
    plans: [{ key: 'medium', label: 'Medium' }], csrfToken: 't',
  });
  for (const fact of ['Ann', 'ann@bos.co', '+27821234567', 'BOS GYM', '1 Main Rd', 'Durban', 'Medium', '120', 'SMS reminders']) {
    assert.ok(page.includes(fact), fact);
  }
  assert.match(page, /href="\/platform\/apply">Edit</);
  assert.match(page, /name="confirm" value="yes" required/);
  assert.match(page, /<button type="submit">Submit application<\/button>/);
});

test('step 3 keeps Submit unavailable while a document is missing', () => {
  const page = applyReviewPage({ application: DRAFT, documents: [doc('id_document')], csrfToken: 't' });
  assert.match(page, /<button type="submit" disabled>Submit application<\/button>/);
  assert.match(page, /Business registration, Proof of address/);
});

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

const draftDeps = (documents = []) => ({
  findOwnDraft: async (id) => (id === OWNER.id ? { application: DRAFT, documents, email: OWNER.email, ownerName: 'Ann' } : null),
});

test('the documents page needs the signed-in owner, and only a draft', async () => {
  const signedOut = await call({ url: '/platform/apply/documents', who: null }, draftDeps());
  assert.equal(signedOut.statusCode, 302);
  // Signed out: the OWNER door, not the staff one (design critique 2026-09-29).
  assert.equal(signedOut.headers.location, '/owner/login?next=account');

  const noDraft = await call({ url: '/platform/apply/documents', who: OTHER }, draftDeps());
  assert.equal(noDraft.headers.location, '/platform/my-gym', 'nothing to fill in: their page says where it stands');

  const mine = await call({ url: '/platform/apply/documents' }, draftDeps());
  assert.equal(mine.statusCode, 200);
  assert.match(mine.body, /Upload your documents/);
});

test('Submit needs the tick, and then asks the server — which has the last word', async () => {
  let asked = 0;
  const deps = { ...draftDeps(ALL_THREE), submitApplication: async () => { asked += 1; return { ok: true, gymName: 'BOS GYM', emailed: true }; } };

  const unticked = await call({ method: 'POST', url: '/platform/apply/submit', body: `csrf=${csrf()}` }, deps);
  assert.equal(unticked.statusCode, 400);
  assert.match(unticked.body, /tick the box/);
  assert.equal(asked, 0);

  const sent = await call({ method: 'POST', url: '/platform/apply/submit', body: `csrf=${csrf()}&confirm=yes` }, deps);
  assert.equal(sent.statusCode, 200);
  assert.match(sent.body, /Application sent/);
  assert.equal(asked, 1);
});

test('a refused Submit comes back to the review page with the reason', async () => {
  const deps = { ...draftDeps([doc('id_document')]), submitApplication: async () => ({ ok: false, error: 'Please upload Proof of address before sending your application.' }) };
  const r = await call({ method: 'POST', url: '/platform/apply/submit', body: `csrf=${csrf()}&confirm=yes` }, deps);
  assert.equal(r.statusCode, 400);
  assert.match(r.body, /Please upload Proof of address/);
});

test('the application form comes back filled in for a signed-in owner with a draft', async () => {
  const r = await call({ url: '/platform/apply' }, draftDeps());
  assert.match(r.body, /name="editing" value="1"/);
  assert.match(r.body, /value="BOS GYM"/);
  assert.match(r.body, /Signed in as <b>ann@bos\.co<\/b>/);
  assert.doesNotMatch(r.body, /name="password"/, 'never the password again');
  assert.match(r.body, /Save and continue/);
});

test('a correction is saved to the draft and goes to the review page', async () => {
  let saved = null;
  const deps = { ...draftDeps(), updateDraftApplication: async (id, input) => { saved = { id, input }; return { ok: true }; } };
  const r = await call({
    method: 'POST', url: '/platform/apply',
    body: `editing=1&csrf=${csrf()}&owner_name=Ann&phone=%2B27821234567&gym_name=BOS+GYM&address=2+Beach+Rd&city=Durban&country=za&plan=medium`,
  }, deps);
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/apply/review');
  assert.equal(saved.id, OWNER.id, 'keyed on the session');
  assert.equal(saved.input.address, '2 Beach Rd');
});

test("the owner opens their OWN upload; someone else's document does not resolve", async () => {
  const deps = {
    getDocument: async (id) => (id === 'doc-mine' ? { id, application_id: 'app-1', storage_ref: 'app-1/id/x.pdf' } : { id, application_id: 'app-2', storage_ref: 'app-2/id/y.pdf' }),
    findOwnApplication: async (userId, appId) => (userId === OWNER.id && appId === 'app-1' ? { id: 'app-1' } : null),
    signedDocumentUrl: async (ref) => `https://storage.example/${ref}?token=short`,
  };
  const mine = await call({ url: '/platform/apply/documents/doc-mine' }, deps);
  assert.equal(mine.statusCode, 302);
  assert.match(mine.headers.location, /app-1\/id\/x\.pdf/);

  const theirs = await call({ url: '/platform/apply/documents/doc-theirs' }, deps);
  assert.equal(theirs.statusCode, 404);
  assert.doesNotMatch(String(theirs.headers.location || ''), /app-2/);
});

// ---------------------------------------------------------------------------
// The reviewer's side
// ---------------------------------------------------------------------------

test('a draft waits on the owner, not in the review queue', () => {
  const review = APPLICATION_TABS.find(([key]) => key === 'review');
  const owner = APPLICATION_TABS.find(([key]) => key === 'owner');
  assert.ok(!review[2].includes('draft'));
  assert.ok(owner[2].includes('draft'));
});

test('nothing can be decided on a draft — the page says so instead of offering buttons', () => {
  const page = applicationDetailPage({ application: { ...DRAFT }, documents: [], csrfToken: 't' });
  assert.match(page, /Not sent yet/);
  assert.doesNotMatch(page, /Approve and provision/);
});

test("a photo the reviewer's browser cannot draw says so, instead of an empty frame", () => {
  const page = documentReviewPage({ doc: { id: 'd1', mime_type: 'image/heic', filename: 'id.heic', doc_type: 'id_document' } });
  assert.match(page, /onerror=/);
  assert.match(page, /cannot show this photo/);
  assert.match(page, /\?download=1/);
});

test('Q1 EVERY DOWNLOAD OF A DOCUMENT IS RECORDED, as well as every open', async () => {
  const logged = [];
  const deps = {
    audit: async (e) => logged.push(e),
    getDocument: async (id) => ({ id, application_id: 'app-1', doc_type: 'id_document', storage_ref: 'app-1/id/x.pdf', filename: 'id.pdf' }),
    signedDocumentUrl: async () => 'https://storage.example/signed',
  };
  const r1 = res();
  await handlePlatform(req({ url: '/platform/documents/d1/file?download=1', who: STAFF }), r1, { permissionsFor: async () => EVERYTHING, ...deps });
  const r2 = res();
  await handlePlatform(req({ url: '/platform/documents/d1/file', who: STAFF }), r2, { permissionsFor: async () => EVERYTHING, ...deps });
  assert.deepEqual(logged.map((e) => e.action), ['platform.document.downloaded', 'platform.document.opened']);
  assert.equal(logged[0].actor_user_id, STAFF.id);
});

test('Q2 the email asking an early applicant to finish says exactly what to do', () => {
  const mail = finishApplicationEmail({ gymName: 'SASO GYM', signInUrl: 'https://yoyogym.vercel.app/platform/login?as=owner' });
  assert.match(mail.subject, /finish your application for SASO GYM/i);
  assert.match(mail.html, /href="https:\/\/yoyogym\.vercel\.app\/platform\/login\?as=owner"/);
  for (const d of ['your ID', 'your business registration', "proof of the gym's address"]) assert.ok(mail.html.includes(d), d);
  assert.match(mail.text, /Submit application/);
});
