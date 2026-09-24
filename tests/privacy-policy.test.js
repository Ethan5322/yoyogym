// The privacy policy — required by both stores and by POPIA.
//
// It must describe what the system DOES. Two ways that goes wrong, both
// guarded here: the policy promising something the code does not do (it
// nearly said "deleted 90 days later", which no code does — D-071), and the
// code sending data somewhere the policy does not mention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { privacyPage } from '../platform/views.js';
import { handlePlatform } from '../platform/router.js';

test('IT IS A DRAFT UNTIL SOMEONE APPROVES IT', () => {
  // A privacy policy is a legal promise. Like billing and provisioning, it
  // is off until switched on.
  assert.match(privacyPage({}), /DRAFT/);
  assert.ok(!/DRAFT/.test(privacyPage({ approved: true, contact: 'privacy@example.com' })));
});

test('a draft is not indexed by search engines', () => {
  assert.match(privacyPage({}), /noindex/i);
});

test('the contact address is escaped, and its absence is said plainly', () => {
  assert.match(privacyPage({ contact: '"><script>x</script>' }), /&quot;&gt;&lt;script&gt;/);
  assert.match(privacyPage({}), /contact address will be added/);
});

test('IT IS SERVED AT /platform/privacy AND READS THE SWITCHES', async () => {
  const run = async () => {
    const r = { statusCode: 0, body: '', headers: {}, setHeader() {}, getHeader() {}, writeHead(c) { this.statusCode = c; return this; }, end(b) { this.body = b; } };
    await handlePlatform({ method: 'GET', url: '/platform/privacy', headers: {} }, r, {});
    return r;
  };
  delete process.env.PLATFORM_PRIVACY_APPROVED;
  assert.match((await run()).body, /DRAFT/);

  process.env.PLATFORM_PRIVACY_APPROVED = 'true';
  process.env.PLATFORM_PRIVACY_CONTACT = 'privacy@example.com';
  try {
    const r = await run();
    assert.equal(r.statusCode, 200);
    assert.ok(!/DRAFT/.test(r.body));
    assert.match(r.body, /privacy@example\.com/);
  } finally {
    delete process.env.PLATFORM_PRIVACY_APPROVED;
    delete process.env.PLATFORM_PRIVACY_CONTACT;
  }
});

// ---------------------------------------------------------------------------
// It says what the code does
// ---------------------------------------------------------------------------

test('EVERY OUTSIDE SERVICE THE CODE CALLS IS NAMED IN THE POLICY', () => {
  // Found while writing it: new-member alerts, including whether the PAR-Q
  // needs a doctor's clearance, go to the owner through CallMeBot.
  const page = privacyPage({ approved: true }).toLowerCase();
  const code = ['server/lib', 'server/lib/notify', 'platform']
    .flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${d}/${f}`, 'utf8')))
    .join('\n')
    .toLowerCase();

  for (const [service, marker] of [
    ['supabase', '@supabase/supabase-js'],
    ['brevo', 'api.brevo.com'],
    ['paystack', 'api.paystack.co'],
    ['callmebot', 'api.callmebot.com'],
  ]) {
    if (code.includes(marker)) assert.ok(page.includes(service), `the code calls ${service}; the policy must say so`);
  }
});

test('the categories match the member record', () => {
  // Checked against gym.members in db/schema.sql.
  const schema = readFileSync('db/schema.sql', 'utf8');
  const page = privacyPage({ approved: true });
  const pairs = [
    ['id_number', /ID or passport number/],
    ['date_of_birth', /date of birth/],
    ['emergency_name', /emergency contact/],
    ['guardian_consent', /guardian/],
    ['injuries_notes', /injuries/],
    ['medical_aid_provider', /medical aid/],
    ['face_descriptor', /Face data/],
    ['photo_url', /photo/],
  ];
  for (const [column, words] of pairs) {
    assert.ok(schema.includes(column), `${column} is still a member column`);
    assert.match(page, words, `${column} is described`);
  }
});

test('FACE DATA IS DESCRIBED AS OPTIONAL — BECAUSE IT IS', () => {
  assert.match(privacyPage({}), /only if you agree to it/);
});

test('NO AUTOMATIC DELETION IS PROMISED, BECAUSE NONE EXISTS (D-071)', () => {
  // billing.js: after 90 days suspended a gym is REPORTED, never deleted.
  assert.match(readFileSync('platform/billing.js', 'utf8'), /Never deleted \(D-071\)/);
  assert.ok(!/deleted 90 days later/.test(privacyPage({})));
});

test('the card number is never claimed to be stored — only the token and last four', () => {
  const page = privacyPage({});
  assert.match(page, /never see or\s+store the card number/);
});

// ---------------------------------------------------------------------------
// Reachable
// ---------------------------------------------------------------------------

test('REACHABLE FROM INSIDE THE APP, AND FROM THE SIGN-IN AND DELETION PAGES', () => {
  const html = readFileSync('apps/mobile/www/index.html', 'utf8');
  const app = readFileSync('apps/mobile/www/app.js', 'utf8');
  assert.match(html, /data-go="privacy"/);
  assert.match(html, /data-go="delete-account"/);
  assert.match(app, /where === 'privacy'\) return go\('\/platform\/privacy'\)/);
  assert.match(app, /where === 'delete-account'\) return go\('\/platform\/delete-account'\)/);

  const views = readFileSync('platform/views.js', 'utf8');
  const login = views.slice(views.indexOf('export function loginPage'), views.indexOf('export function forgotPage'));
  assert.match(login, /href="\/platform\/privacy"/);
});
