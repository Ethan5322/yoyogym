// Reviewing a document.
//
// Uploading was only half of it. A reviewer has to be able to OPEN the file and
// say yes or no to it, and until now the detail page linked to
// /platform/documents/:id, which did not exist. Upload was write-only.
//
// These files are the most sensitive thing on the platform: an ID document, a
// business registration, a lease. So the opening is the part that gets the
// tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';

const STAFF = { id: 'staff-1', email: 'review@yoyogyms.com', kind: 'platform_staff' };
const session = () => sessionCookie(STAFF).split(';')[0];
const csrf = () => encodeURIComponent(issueCsrfToken('staff-1'));

function req({ method = 'GET', url = '', cookie = '', body = '' } = {}) {
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

const DOC = {
  id: 'doc-1',
  application_id: 'app-1',
  doc_type: 'id_document',
  storage_ref: 'applications/app-1/id_document/abc.pdf',
  filename: 'ann-id.pdf',
  status: 'pending',
};

function deps({ permissions = ['application.view'] } = {}) {
  const calls = { signed: [], reviewed: [], audits: [] };
  return {
    calls,
    permissionsFor: async () => permissions,
    audit: async (a) => { calls.audits.push(a); },
    getDocument: async (id) => (id === 'doc-1' ? DOC : null),
    signedDocumentUrl: async (ref, seconds) => {
      calls.signed.push({ ref, seconds });
      return `https://storage.example/signed?path=${encodeURIComponent(ref)}`;
    },
    reviewDocument: async (id, patch) => { calls.reviewed.push({ id, ...patch }); },
  };
}

// ---------------------------------------------------------------------------
// Opening a document
// ---------------------------------------------------------------------------

test('a document cannot be opened without a session', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/documents/doc-1' }), r, deps());

  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/login');
});

test('A SIGNED-IN USER WITHOUT application.view CANNOT OPEN SOMEONE\'S ID DOCUMENT', async () => {
  // Gym owners hold platform sessions. This is a scan of a stranger's ID.
  const d = deps({ permissions: [] });
  const r = res();

  await handlePlatform(req({ url: '/platform/documents/doc-1', cookie: session() }), r, d);

  assert.equal(r.statusCode, 403);
  assert.equal(d.calls.signed.length, 0, 'no URL is ever minted');
});

test('a reviewer is redirected to a short-lived signed URL', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(req({ url: '/platform/documents/doc-1', cookie: session() }), r, d);

  assert.equal(r.statusCode, 302);
  assert.match(r.headers.location, /^https:\/\/storage\.example\/signed/);
  assert.ok(d.calls.signed[0].seconds <= 300, 'minutes, not days');
});

test('opening a document is written to the audit log', async () => {
  // Who looked at whose ID, and when. This is the only record of it.
  const d = deps();
  const r = res();

  await handlePlatform(req({ url: '/platform/documents/doc-1', cookie: session() }), r, d);

  const entry = d.calls.audits.find((a) => a.action === 'platform.document.viewed');
  assert.ok(entry, 'a document view must leave a trace');
  assert.equal(entry.actor_user_id, 'staff-1');
  assert.equal(entry.entity_id, 'doc-1');
});

test('the signed URL is never rendered into a page', async () => {
  // A redirect leaves it in one place. Putting it in HTML would leave it in
  // the page source, the browser cache and any screenshot of the screen.
  const d = deps();
  const r = res();

  await handlePlatform(req({ url: '/platform/documents/doc-1', cookie: session() }), r, d);

  assert.equal(r.body, '', 'nothing is rendered at all');
});

test('an unknown document is 404, and mints nothing', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(req({ url: '/platform/documents/nope', cookie: session() }), r, d);

  assert.equal(r.statusCode, 404);
  assert.equal(d.calls.signed.length, 0);
});

test('a storage failure does not hand the reviewer a broken redirect', async () => {
  const d = { ...deps(), signedDocumentUrl: async () => null };
  const r = res();

  await handlePlatform(req({ url: '/platform/documents/doc-1', cookie: session() }), r, d);

  assert.equal(r.statusCode, 502);
});

// ---------------------------------------------------------------------------
// Deciding on a document
// ---------------------------------------------------------------------------

const decide = (body) =>
  req({ method: 'POST', url: '/platform/documents/doc-1/decide', cookie: session(), body });

test('accepting a document records who accepted it', async () => {
  const d = deps({ permissions: ['application.view', 'application.approve'] });
  const r = res();

  await handlePlatform(decide(`action=accept&csrf=${csrf()}`), r, d);

  assert.equal(d.calls.reviewed[0].status, 'accepted');
  assert.equal(d.calls.reviewed[0].reviewed_by, 'staff-1');
  assert.ok(d.calls.reviewed[0].reviewed_at);
  assert.equal(r.statusCode, 302);
});

test('rejecting a document REQUIRES a reason', async () => {
  // "Rejected" with no reason tells the owner nothing and they resubmit the
  // same file.
  const d = deps({ permissions: ['application.view', 'application.approve'] });
  const r = res();

  await handlePlatform(decide(`action=reject&csrf=${csrf()}`), r, d);

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.reviewed.length, 0);
});

test('rejecting with a reason records it', async () => {
  const d = deps({ permissions: ['application.view', 'application.approve'] });
  const r = res();

  await handlePlatform(decide(`action=reject&reason=Too+blurry+to+read&csrf=${csrf()}`), r, d);

  assert.equal(d.calls.reviewed[0].status, 'rejected');
  assert.equal(d.calls.reviewed[0].reject_reason, 'Too blurry to read');
});

test('someone who may only LOOK cannot decide', async () => {
  const d = deps({ permissions: ['application.view'] });
  const r = res();

  await handlePlatform(decide(`action=accept&csrf=${csrf()}`), r, d);

  assert.equal(r.statusCode, 403);
  assert.equal(d.calls.reviewed.length, 0);
});

test('a decision without a CSRF token is refused', async () => {
  const d = deps({ permissions: ['application.view', 'application.approve'] });
  const r = res();

  await handlePlatform(decide('action=accept'), r, d);

  assert.equal(r.statusCode, 403);
  assert.equal(d.calls.reviewed.length, 0);
});

test('an unrecognised action is refused rather than guessed', async () => {
  const d = deps({ permissions: ['application.view', 'application.approve'] });
  const r = res();

  await handlePlatform(decide(`action=shred&csrf=${csrf()}`), r, d);

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.reviewed.length, 0);
});
