import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIrishGridReference } from '../js/location-search-controller.js';

test('parses Irish Grid letter-square references in spaced and compact forms', () => {
  assert.deepEqual(parseIrishGridReference('J 3374 7396'), { E: 333740, N: 373960 });
  assert.deepEqual(parseIrishGridReference('J33747396'), { E: 333740, N: 373960 });
  assert.deepEqual(parseIrishGridReference('J 337 739'), { E: 333700, N: 373900 });
});

test('parses numeric Irish Grid coordinates and rejects malformed references', () => {
  assert.deepEqual(parseIrishGridReference('333740 373960'), { E: 333740, N: 373960 });
  assert.deepEqual(parseIrishGridReference('E 333740 N 373960'), { E: 333740, N: 373960 });
  assert.equal(parseIrishGridReference('not a grid reference'), null);
});
