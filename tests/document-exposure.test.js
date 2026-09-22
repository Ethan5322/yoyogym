// D-123 — what /api/document is allowed to return.
//
// This endpoint has no session and its credential never expires. It used to
// `select('*')`, which meant a permanent, reusable code returned the member's
// national ID number and their biometric face templates to anyone holding it.
//
// The column list is the control, so the column list is what gets tested. A
// regression here would be silent and permanent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.JWT_SECRET ||= 'test-only-gym-secret';
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only-service-key';

const { PDF_MEMBER_COLUMNS, FORBIDDEN_MEMBER_COLUMNS } = await import(
  '../server/handlers/public/document.js'
);

test('no identity or biometric column is returned', () => {
  for (const forbidden of FORBIDDEN_MEMBER_COLUMNS) {
    assert.ok(
      !PDF_MEMBER_COLUMNS.includes(forbidden),
      `${forbidden} must never be returned by an unauthenticated endpoint`
    );
  }
});

test('the SA ID number and the face templates are named explicitly as forbidden', () => {
  // Named rather than implied, so the intent survives someone rewriting this.
  for (const name of ['id_number', 'face_descriptor', 'arcface_embedding', 'arcface_templates']) {
    assert.ok(FORBIDDEN_MEMBER_COLUMNS.includes(name), `${name} should be on the forbidden list`);
  }
});

test('every column the membership PDF reads is still returned', () => {
  // Measured from the generators, not assumed: narrowing the list must not
  // quietly break the member's card.
  const sources = [
    'src/lib/pdf/generateMembershipPdf.js',
    'src/lib/idcard.js',
  ].map((f) => readFileSync(f, 'utf8')).join('\n');

  const used = new Set([...sources.matchAll(/member\.([a-z_]+)/g)].map((m) => m[1]));

  for (const field of used) {
    assert.ok(
      PDF_MEMBER_COLUMNS.includes(field),
      `the PDF reads member.${field} but the endpoint no longer returns it`
    );
  }
});

test('the MEMBERS query no longer selects everything', () => {
  const src = readFileSync('server/handlers/public/document.js', 'utf8');

  // Scoped to the members table on purpose. `parq_responses` still selects
  // everything, and that is correct: every column of it is the member's own
  // PAR-Q answers, which are exactly what the membership PDF prints. The
  // members row was the problem, because it also held an ID number and
  // biometric templates.
  const at = src.indexOf(".from('members')");
  assert.ok(at > -1, 'the members query should still be there');

  const query = src.slice(at, at + 120);
  assert.ok(!query.includes("select('*')"), "select('*') on members is what caused D-123");
  assert.ok(query.includes('PDF_MEMBER_COLUMNS'), 'the explicit list is what is used');
});

test('the endpoint is rate limited', () => {
  // register.js was the only public handler with any. Without it, probing this
  // endpoint is completely silent.
  const src = readFileSync('server/handlers/public/document.js', 'utf8');

  assert.ok(/rateLimit\(/.test(src), 'no rate limit means no detection');
  assert.ok(/key: 'document'/.test(src), 'and its own bucket, not register.js"s');
});
