// Yoyo Gyms is worldwide (D-125).
//
// "Local" is a property of the GYM, not of the software. A gym in Addis Ababa
// asks Ethiopians for their national ID and everyone else for a passport, in
// exactly the way a gym in Cape Town asks South Africans for an SA ID.
//
// The first two tests are the important ones: the existing South African gym
// must behave precisely as it did before.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { homeCountryFor, nationalIdRuleFor, HOME_COUNTRY, currencyForCountry, dialForCountry } from '../shared/countries.js';

// ---------------------------------------------------------------------------
// What must NOT change
// ---------------------------------------------------------------------------

test('a gym that has not said where it is still behaves as South African', () => {
  // The existing deployment has no country in its profile. It must not change.
  assert.equal(homeCountryFor(undefined), 'ZA');
  assert.equal(homeCountryFor(null), 'ZA');
  assert.equal(homeCountryFor(''), 'ZA');
  assert.equal(HOME_COUNTRY, 'ZA');
});

test('a South African gym still asks for a 13-digit SA ID, strictly', () => {
  const rule = nationalIdRuleFor('ZA');

  assert.equal(rule.strict, true, 'the one document this codebase can actually validate');
  assert.match(rule.label, /South African ID/);
  assert.match(rule.hint, /13/);
});

// ---------------------------------------------------------------------------
// The rest of the world
// ---------------------------------------------------------------------------

test('an Ethiopian gym asks for an Ethiopian national ID', () => {
  const rule = nationalIdRuleFor('ET');

  assert.equal(rule.country, 'ET');
  assert.match(rule.label, /Ethiopia/);
});

test('a non-South-African gym does NOT apply the SA format check', () => {
  // Rejecting a real Kenyan ID because it is not 13 digits would make the gym
  // unusable in Kenya. A loose check that accepts a real document beats a
  // strict one that refuses it.
  assert.equal(nationalIdRuleFor('KE').strict, false);
  assert.equal(nationalIdRuleFor('GB').strict, false);
  assert.equal(nationalIdRuleFor('BR').strict, false);
});

test('a country the 50-country list has never heard of is still honoured', () => {
  // The list is a convenience for phone codes and currencies. It is not a
  // statement about which countries may have gyms.
  assert.equal(homeCountryFor('FJ'), 'FJ');
  assert.equal(nationalIdRuleFor('FJ').country, 'FJ');
});

test('a lowercase or padded country code works', () => {
  assert.equal(homeCountryFor(' et '), 'ET');
  assert.equal(homeCountryFor('ke'), 'KE');
});

test('rubbish falls back rather than producing a broken country', () => {
  assert.equal(homeCountryFor('ZAF'), 'ZA', 'three letters is not alpha-2');
  assert.equal(homeCountryFor('1'), 'ZA');
  assert.equal(homeCountryFor({}), 'ZA');
});

// ---------------------------------------------------------------------------
// Phone and currency already adapt — this asserts it, so it cannot regress
// ---------------------------------------------------------------------------

test('phone dial codes and currencies follow the country, not the software', () => {
  assert.equal(dialForCountry('ET'), '251');
  assert.equal(dialForCountry('KE'), '254');
  assert.equal(dialForCountry('ZA'), '27');

  assert.equal(currencyForCountry('ET'), 'ETB');
  assert.equal(currencyForCountry('NG'), 'NGN');
  assert.equal(currencyForCountry('ZA'), 'ZAR');
});

// ---------------------------------------------------------------------------
// The registration flow itself
// ---------------------------------------------------------------------------

const { FLOW, setHomeCountry, getHomeCountry } = await import('../src/chatbot/flow.js');

const step = (id) => FLOW.find((s) => s.id === id);

test('the flow defaults to South Africa, so the existing gym is unchanged', () => {
  assert.equal(getHomeCountry(), 'ZA');
  assert.match(step('id_number').prompt({}), /South African ID/);
  // The strict SA check is still applied: 13 digits AND a valid checksum.
  assert.equal(step('id_number').validate('0000000000000'), null, 'a checksum-valid SA ID passes');
  assert.ok(step('id_number').validate('0000000000001'), 'a bad checksum is refused');
  assert.ok(step('id_number').validate('123'), 'and so is a short number');
});

test('setting the gym to Ethiopia changes the question that is asked', () => {
  setHomeCountry('ET');
  try {
    assert.equal(getHomeCountry(), 'ET');
    assert.match(step('id_number').prompt({}), /Ethiopia/);
    assert.ok(!/South African/.test(step('id_number').prompt({})));
  } finally {
    setHomeCountry('ZA');
  }
});

test('an Ethiopian national at an Ethiopian gym is asked for an ID, not a passport', () => {
  setHomeCountry('ET');
  try {
    assert.equal(step('id_number').when({ nationality: 'ET' }), true);
    assert.equal(step('passport_number').when({ nationality: 'ET' }), false);
    // And a South African visiting that gym gives a passport.
    assert.equal(step('id_number').when({ nationality: 'ZA' }), false);
    assert.equal(step('passport_number').when({ nationality: 'ZA' }), true);
  } finally {
    setHomeCountry('ZA');
  }
});

test('a non-South-African gym accepts an ID that is not 13 digits', () => {
  // The bug this prevents: a real Ethiopian ID refused for not looking South
  // African, making the gym unusable in its own country.
  setHomeCountry('ET');
  try {
    assert.equal(step('id_number').validate('ETH-99881234'), null, 'accepted as given');
    assert.ok(step('id_number').validate('1'), 'but still not blank-ish');
  } finally {
    setHomeCountry('ZA');
  }
});

test('back on ZA, the strict South African check returns', () => {
  assert.equal(getHomeCountry(), 'ZA');
  assert.ok(step('id_number').validate('ETH-99881234'), 'a non-SA ID is refused at an SA gym');
});
