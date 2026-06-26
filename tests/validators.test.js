// Unit tests for the registration field validators (POPIA-sensitive input gates).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateName,
  validateDOB,
  validateSAID,
  validatePassport,
  validatePhone,
  validateEmail,
  validatePostal,
} from '../src/chatbot/validators.js';

const ok = (v) => assert.equal(v, null);
const bad = (v) => assert.ok(typeof v === 'string' && v.length > 0);

const yearsAgoISO = (n) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

test('validateName requires first + last', () => {
  ok(validateName('John Doe'));
  bad(validateName('John'));
  bad(validateName(''));
});

test('validateDOB enforces 16+ and sane range', () => {
  ok(validateDOB(yearsAgoISO(30)));
  bad(validateDOB(yearsAgoISO(10))); // under 16
  bad(validateDOB(''));
});

test('validateSAID checks 13 digits + Luhn', () => {
  ok(validateSAID('8001015009087')); // valid Luhn
  bad(validateSAID('8001015009088')); // bad checksum
  bad(validateSAID('123')); // wrong length
});

test('validatePassport accepts 6-12 alphanumerics', () => {
  ok(validatePassport('A1234567'));
  bad(validatePassport('12')); // too short
});

test('validatePhone requires country code', () => {
  ok(validatePhone('+27 82 123 4567'));
  bad(validatePhone('082 123 4567'));
});

test('validateEmail basic shape', () => {
  ok(validateEmail('a@b.co'));
  bad(validateEmail('not-an-email'));
});

test('validatePostal is 4 digits', () => {
  ok(validatePostal('8001'));
  bad(validatePostal('80'));
});
