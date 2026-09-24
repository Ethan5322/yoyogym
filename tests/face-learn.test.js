// The door scanner keeps a member's face gallery current — safely.
//
// Learning used to happen only on face sign-in from a member's own phone, so
// a member recognised at the reception scanner (the usual case) kept their
// enrolment photos forever and slowly became harder to recognise.
//
// The scanner matches in the browser, so the server must NOT learn whatever
// it is told: a reception login could otherwise plant one person's face on
// another's record. These tests are mostly about that refusal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.JWT_SECRET ||= 'test-only-gym-secret';

const { signToken } = await import('../server/lib/auth.js');
const { runWithGym } = await import('../server/lib/tenancy.js');
const { default: faceLearn } = await import('../server/handlers/admin/face-learn.js');

// 128-D face readings. Two different people, far apart in face space.
const face = (base, jitter = 0) => Array.from({ length: 128 }, (_, i) => base + ((i % 7) - 3) * 0.004 + jitter);
const ANNA = face(0.1);
const BEN = face(0.5);

/** A gym database holding members and their face galleries. */
function gymDb(members) {
  const writes = [];
  const from = (table) => {
    const q = {
      _update: null,
      select() { return q; },
      not() { return q; },
      eq(_col, id) { q._id = id; return q; },
      update(patch) { q._update = patch; return q; },
      then(resolve) {
        if (q._update) {
          writes.push({ table, id: q._id, patch: q._update });
          return resolve({ error: null });
        }
        return resolve({ data: members.map((m) => ({ ...m })), error: null });
      },
    };
    return q;
  };
  return { from, writes };
}

function member(id, reading) {
  return { id, face_descriptor: reading, face_templates: [{ v: reading, src: 'enrol' }] };
}

async function learn(db, body, role = 'reception') {
  const token = signToken({ id: 's1', username: 'desk', role });
  const res = {
    statusCode: 200, body: '', headers: {},
    // As server/lib/http.js uses it: status().setHeader() chained, then end(body).
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = JSON.stringify(p); return this; },
    end(b) { if (b) this.body = String(b); return this; },
  };
  const req = { method: 'POST', url: '/api/admin/face-learn', headers: { authorization: `Bearer ${token}` }, body, socket: {} };
  await runWithGym({ gym: { slug: 'bos-gym' }, client: db, features: ['face'] }, () => faceLearn(req, res));
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

// ---------------------------------------------------------------------------

test('A NEW APPEARANCE OF THE RIGHT MEMBER IS LEARNED FROM THE DOOR SCANNER', async () => {
  const db = gymDb([member('anna', ANNA), member('ben', BEN)]);
  // Anna, noticeably different today (0.34 away: new enough to be worth
  // keeping, above the 0.22 "nothing new" line) and still clearly Anna
  // (inside the 0.42 learn-above line).
  const today = face(0.1, 0.03);
  const r = await learn(db, { type: 'member', id: 'anna', descriptor: today });

  assert.equal(r.body.learned, true);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].id, 'anna');
  const gallery = db.writes[0].patch.face_templates;
  assert.ok(gallery.some((t) => t.src !== 'adaptive'), 'the enrolment anchor is kept');
  assert.ok(gallery.some((t) => t.src === 'adaptive'), 'and today\'s look is added');
});

test('THE SCANNER CANNOT PLANT ONE PERSON\'S FACE ON ANOTHER\'S RECORD', async () => {
  // Ben's face, claimed to be Anna. The server identifies it as Ben, so it
  // does not match the claim, and nothing is written.
  const db = gymDb([member('anna', ANNA), member('ben', BEN)]);
  const r = await learn(db, { type: 'member', id: 'anna', descriptor: BEN });
  assert.equal(r.body.learned, false);
  assert.equal(db.writes.length, 0);
});

test('a face nobody matches is not learned onto anyone', async () => {
  const db = gymDb([member('anna', ANNA), member('ben', BEN)]);
  const r = await learn(db, { type: 'member', id: 'anna', descriptor: face(0.9) });
  assert.equal(r.body.learned, false);
  assert.equal(db.writes.length, 0);
});

test('the same look again adds nothing — the gallery holds appearances, not visits', async () => {
  const db = gymDb([member('anna', ANNA), member('ben', BEN)]);
  const r = await learn(db, { type: 'member', id: 'anna', descriptor: ANNA });
  assert.equal(r.body.learned, false);
  assert.equal(db.writes.length, 0);
});

test('only front-desk roles may teach the scanner', async () => {
  const db = gymDb([member('anna', ANNA)]);
  const r = await learn(db, { type: 'member', id: 'anna', descriptor: face(0.1, 0.012) }, 'trainer');
  assert.notEqual(r.status, 200);
  assert.equal(db.writes.length, 0);
});

test('a malformed reading is refused', async () => {
  const db = gymDb([member('anna', ANNA)]);
  const r = await learn(db, { type: 'member', id: 'anna', descriptor: [1, 2, 3] });
  assert.equal(r.status, 400);
});

test('the door scanner sends it after a confident match, without waiting on it', () => {
  const scan = readFileSync('src/pages/admin/FaceScan.jsx', 'utf8');
  assert.match(scan, /apiFetch\('\/admin\/face-learn'/);
  assert.match(scan, /\}\)\.catch\(\(\) => \{\}\)/, 'fire-and-forget: a check-in never waits on it');
});

test('it is a PRIME face feature, like the rest of face recognition', async () => {
  const { ROUTE_FEATURES, FEATURES } = await import('../shared/features.js');
  assert.equal(ROUTE_FEATURES['face-learn'], FEATURES.FACE);
});
