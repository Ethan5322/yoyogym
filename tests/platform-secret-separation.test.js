// The platform must not borrow the gym's signing key.
//
// Why this is a test and not a comment: the gym app's verifier
// (server/lib/auth.js) calls jwt.verify(token, JWT_SECRET) with no audience
// option, so `aud: 'platform'` is ignored. If the two share a key, a platform
// session token is accepted by the gym API. That was reproduced, not guessed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const freshAuth = async () => import(`../platform/auth.js?bust=${Math.random()}`);

async function withEnv(env, fn) {
  const saved = { PLATFORM_JWT_SECRET: process.env.PLATFORM_JWT_SECRET, JWT_SECRET: process.env.JWT_SECRET };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('signing refuses when PLATFORM_JWT_SECRET is not set', async () => {
  const { signPlatformToken } = await freshAuth();
  await withEnv({ PLATFORM_JWT_SECRET: undefined, JWT_SECRET: 'the-gym-secret' }, () => {
    assert.throws(
      () => signPlatformToken({ id: 'u1', email: 'a@b.c' }),
      /PLATFORM_JWT_SECRET/,
      'it must not quietly fall back to the gym key'
    );
  });
});

test('signing refuses when the two secrets are the same string', async () => {
  const { signPlatformToken } = await freshAuth();
  await withEnv({ PLATFORM_JWT_SECRET: 'same', JWT_SECRET: 'same' }, () => {
    assert.throws(() => signPlatformToken({ id: 'u1', email: 'a@b.c' }), /must not equal JWT_SECRET/);
  });
});

test('with its own secret, a platform token round-trips', async () => {
  const { signPlatformToken, verifyPlatformToken } = await freshAuth();
  await withEnv({ PLATFORM_JWT_SECRET: 'a-distinct-platform-secret', JWT_SECRET: 'the-gym-secret' }, () => {
    const token = signPlatformToken({ id: 'u1', email: 'a@b.c', kind: 'platform_staff' });
    assert.equal(verifyPlatformToken(token).sub, 'u1');
  });
});

test('a platform token is NOT verifiable with the gym secret', async () => {
  const { signPlatformToken } = await freshAuth();
  const jwt = (await import('jsonwebtoken')).default;

  await withEnv({ PLATFORM_JWT_SECRET: 'a-distinct-platform-secret', JWT_SECRET: 'the-gym-secret' }, () => {
    const token = signPlatformToken({ id: 'u1', email: 'a@b.c' });
    // This is exactly what server/lib/auth.js verifyToken() does.
    assert.throws(() => jwt.verify(token, 'the-gym-secret'), 'the boundary holds at the signature');
  });
});
