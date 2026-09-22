// Application documents.
//
// A gym owner uploads their business registration and ID so a human can review
// them. The files never pass through the serverless function: the server issues
// a signed upload URL and the browser sends the bytes straight to Supabase
// Storage. That avoids a multipart parser, avoids Vercel's ~4.5 MB request body
// limit, and means a scanned PDF never sits in a function's memory.
//
// It also moves the risk. The client now names things, so the server must
// decide the path and verify ownership — which is what most of this file tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';
import { storagePathFor, MAX_DOCUMENT_BYTES, ALLOWED_DOCUMENT_TYPES } from '../platform/documents.js';

const OWNER = { id: 'owner-1', email: 'ann@bos.co', kind: 'gym_owner' };
const session = () => sessionCookie(OWNER).split(';')[0];
const csrf = () => encodeURIComponent(issueCsrfToken('owner-1'));

function req({ method = 'GET', url = '/platform/my-gym', cookie = '', body = '' } = {}) {
  const r = {
    method, url,
    headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/x-www-form-urlencoded' },
    _body: body,
  };
  r[Symbol.asyncIterator] = async function* () { if (r._body) yield Buffer.from(r._body); };
  return r;
}

function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v;
      return this;
    },
    end(b) { this.body = b || ''; this.ended = true; return this; },
  };
}

const APPLICATION = {
  id: 'app-1',
  applicant_user_id: 'owner-1',
  proposed_gym_name: 'BOS GYM',
  status: 'submitted',
  city: 'Cape Town',
};

function deps(over = {}) {
  const calls = { signed: [], recorded: [], audits: [] };
  return {
    calls,
    audit: async (a) => { calls.audits.push(a); },
    permissionsFor: async () => [],
    ownerDashboard: async () => ({ application: APPLICATION, gym: null, subscription: null, documents: [] }),
    // The ONLY ownership check that matters: it is keyed on the session's user.
    findOwnApplication: async (userId, applicationId) =>
      userId === APPLICATION.applicant_user_id && applicationId === APPLICATION.id ? APPLICATION : null,
    createSignedUpload: async (path) => { calls.signed.push(path); return { path, token: 'signed-token' }; },
    recordDocument: async (row) => { calls.recorded.push(row); return { ...row, id: 'doc-1' }; },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The owner's page
// ---------------------------------------------------------------------------

test('the owner page requires a session', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/my-gym' }), r, deps());

  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/login');
});

test('an owner sees their own application and can upload to it', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/my-gym', cookie: session() }), r, deps());

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /BOS GYM/);
  assert.match(r.body, /Documents/i);
});

// ---------------------------------------------------------------------------
// Asking for somewhere to upload
// ---------------------------------------------------------------------------

const ask = (body) =>
  req({ method: 'POST', url: '/platform/my-gym/documents/request', cookie: session(), body });

test('an owner gets a signed upload target for their own application', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    ask(`application_id=app-1&doc_type=business_registration&filename=reg.pdf&mime_type=application/pdf&size_bytes=120000&csrf=${csrf()}`),
    r,
    d
  );

  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.token, 'signed-token');
  assert.match(body.path, /^applications\/app-1\//, 'the SERVER decides the path');
});

test('AN OWNER CANNOT UPLOAD INTO ANOTHER GYM OWNER\'S APPLICATION', async () => {
  // The whole platform is one shared database. This is the request an attacker
  // makes first, and the answer must not depend on the UI never offering it.
  const d = deps();
  const r = res();

  await handlePlatform(
    ask(`application_id=someone-elses-app&doc_type=id_document&filename=x.pdf&mime_type=application/pdf&size_bytes=1000&csrf=${csrf()}`),
    r,
    d
  );

  assert.equal(r.statusCode, 404, 'not 403 — do not confirm that the application exists');
  assert.equal(d.calls.signed.length, 0, 'no upload target is ever issued');
});

test('the filename never decides the path', async () => {
  // A filename is attacker-controlled text. If it reached the storage path,
  // "../../other-gym/id.pdf" would be a cross-tenant write.
  const d = deps();
  const r = res();

  await handlePlatform(
    ask(`application_id=app-1&doc_type=id_document&filename=${encodeURIComponent('../../../etc/passwd')}&mime_type=application/pdf&size_bytes=1000&csrf=${csrf()}`),
    r,
    d
  );

  assert.equal(r.statusCode, 200);
  assert.ok(!d.calls.signed[0].includes('..'), 'no traversal reaches storage');
  assert.match(d.calls.signed[0], /^applications\/app-1\//);
});

test('an executable is refused, whatever it claims to be', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    ask(`application_id=app-1&doc_type=id_document&filename=payload.exe&mime_type=application/x-msdownload&size_bytes=1000&csrf=${csrf()}`),
    r,
    d
  );

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.signed.length, 0);
});

test('a file larger than the limit is refused before a target is issued', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    ask(`application_id=app-1&doc_type=id_document&filename=big.pdf&mime_type=application/pdf&size_bytes=${MAX_DOCUMENT_BYTES + 1}&csrf=${csrf()}`),
    r,
    d
  );

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.signed.length, 0);
});

test('an unknown document type is refused rather than filed under a guess', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    ask(`application_id=app-1&doc_type=whatever&filename=x.pdf&mime_type=application/pdf&size_bytes=1000&csrf=${csrf()}`),
    r,
    d
  );

  assert.equal(r.statusCode, 400);
});

test('an upload request without a CSRF token is refused', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/my-gym/documents/request',
      cookie: session(),
      body: 'application_id=app-1&doc_type=id_document&filename=x.pdf&mime_type=application/pdf&size_bytes=1000',
    }),
    r,
    d
  );

  assert.equal(r.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Recording what was uploaded
// ---------------------------------------------------------------------------

const confirm = (body) =>
  req({ method: 'POST', url: '/platform/my-gym/documents/confirm', cookie: session(), body });

test('confirming records the document against the application', async () => {
  const d = deps();
  const r = res();
  const path = storagePathFor('app-1', 'id_document', 'pdf');

  await handlePlatform(
    confirm(`application_id=app-1&doc_type=id_document&storage_ref=${encodeURIComponent(path)}&filename=id.pdf&mime_type=application/pdf&size_bytes=5000&csrf=${csrf()}`),
    r,
    d
  );

  assert.equal(r.statusCode, 302, 'back to the page, so a refresh does not re-record');
  assert.equal(d.calls.recorded[0].application_id, 'app-1');
  assert.equal(d.calls.recorded[0].status, 'pending', 'a human still has to look at it');
});

test('A CONFIRMED PATH OUTSIDE THE APPLICATION IS REFUSED', async () => {
  // The client sends the path back, so the client can lie about it. Without
  // this check an owner could attach another gym's document to their own
  // application — or claim a path they were never given.
  const d = deps();
  const r = res();

  await handlePlatform(
    confirm(`application_id=app-1&doc_type=id_document&storage_ref=applications/someone-elses-app/id.pdf&filename=id.pdf&mime_type=application/pdf&size_bytes=5000&csrf=${csrf()}`),
    r,
    d
  );

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.recorded.length, 0);
});

test('confirming against an application you do not own is refused', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    confirm(`application_id=someone-elses-app&doc_type=id_document&storage_ref=applications/someone-elses-app/x.pdf&filename=x.pdf&mime_type=application/pdf&size_bytes=1&csrf=${csrf()}`),
    r,
    d
  );

  assert.equal(r.statusCode, 404);
  assert.equal(d.calls.recorded.length, 0);
});

// ---------------------------------------------------------------------------
// The rules themselves
// ---------------------------------------------------------------------------

test('the allowed types are documents and images, never anything executable', () => {
  for (const mime of ALLOWED_DOCUMENT_TYPES) {
    assert.ok(
      /^(application\/pdf|image\/(jpeg|png|webp|heic))$/.test(mime),
      `${mime} is not a document or an image`
    );
  }
});

test('a storage path is derived only from values the server controls', () => {
  const a = storagePathFor('app-1', 'id_document', 'pdf');
  const b = storagePathFor('app-1', 'id_document', 'pdf');

  assert.notEqual(a, b, 'a second upload never overwrites the first');
  assert.match(a, /^applications\/app-1\/id_document\/[a-f0-9]+\.pdf$/);
});
