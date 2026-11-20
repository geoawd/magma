import assert from 'node:assert/strict';
import test from 'node:test';
import { registerCogProjections } from '../js/cog-projections.js';

test('configured COG projections register with the protocol once', () => {
  const registered = [];
  const protocol = {
    registerProjection: (...args) => registered.push(args)
  };
  const projections = [{ code: 27700, definition: '+proj=tmerc' }];

  registerCogProjections(protocol, projections);
  registerCogProjections(protocol, projections);

  assert.deepEqual(registered, [[27700, '+proj=tmerc']]);
});

test('configured COG projections require protocol registration support', () => {
  assert.throws(
    () => registerCogProjections({}, [{ code: 27700, definition: '+proj=tmerc' }]),
    /cannot register configured projections/
  );
});
