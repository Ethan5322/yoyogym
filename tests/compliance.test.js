// Unit tests for the plan-compliance engine (access decisions + adherence).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COMPLIANCE,
  evaluateAccess,
  expectedVisits,
  adherence,
  rulesFor,
} from '../server/lib/compliance.js';

const cfg = DEFAULT_COMPLIANCE;
const active = { status: 'active' };

test('blocked statuses are violations with access blocked', () => {
  for (const status of ['suspended', 'lapsed', 'new']) {
    const r = evaluateAccess({ member: { status }, tier: 'standard', config: cfg });
    assert.equal(r.is_violation, true);
    assert.equal(r.access_blocked, true);
  }
});

test('basic plan cannot enter at peak hours', () => {
  const peak = new Date(); peak.setHours(18, 0, 0, 0); // 18:00 is peak (17-20)
  const r = evaluateAccess({ member: active, tier: 'basic', config: cfg, now: peak });
  assert.equal(r.is_violation, true);
});

test('active standard member on-schedule is allowed', () => {
  const midday = new Date(); midday.setHours(10, 0, 0, 0);
  const r = evaluateAccess({ member: active, tier: 'standard', preferredTime: 'flexible', config: cfg, now: midday });
  assert.equal(r.banner, 'on_schedule');
  assert.equal(r.access_blocked, false);
});

test('overtime is flagged', () => {
  const r = evaluateAccess({ member: active, tier: 'premium', openInsideMinutes: cfg.session_minutes + 30, config: cfg });
  assert.equal(r.is_overtime, true);
});

test('expectedVisits scales weekly frequency to a window', () => {
  assert.equal(expectedVisits(cfg, '3_4', 30), Math.round(3.5 * 30 / 7));
});

test('adherence bands map score correctly', () => {
  assert.equal(adherence(cfg, 10, 10).band, 'excellent');
  assert.equal(adherence(cfg, 8, 10).band, 'good');
  assert.equal(adherence(cfg, 5, 10).band, 'needs');
  assert.equal(adherence(cfg, 1, 10).band, 'at_risk');
});

test('rulesFor falls back to permissive defaults for unknown tier', () => {
  assert.equal(rulesFor(cfg, 'basic').access, 'off_peak');
  assert.equal(rulesFor(cfg, 'nonexistent').access, 'anytime');
});
