import assert from 'node:assert/strict';
import test from 'node:test';
import {
  equalIntervalBreaks,
  geojsonFieldStats,
  matchColorExpression,
  parseManualBreaks,
  quantileBreaks,
  stepColorExpression
} from '../js/geojson-classification.js';

test('GeoJSON fields identify numeric strings and unique categorical values', () => {
  const [classField, copperField] = geojsonFieldStats([
    { properties: { CLASS: 'A', CU: 1.25 } },
    { properties: { CLASS: 'B', CU: '2.5' } },
    { properties: { CLASS: 'A', CU: null } }
  ]);

  assert.deepEqual(classField.uniqueValues, ['A', 'B']);
  assert.equal(classField.numeric, false);
  assert.equal(copperField.numeric, true);
  assert.deepEqual(copperField.values, [1.25, 2.5]);
});

test('quantile and equal-interval methods return ascending numeric breaks', () => {
  assert.deepEqual(equalIntervalBreaks([0, 10], 5), [2, 4, 6, 8]);
  assert.deepEqual(quantileBreaks([0, 1, 2, 3, 4], 5), [0.8, 1.6, 2.4, 3.2]);
  assert.deepEqual(quantileBreaks([4, 4, 4], 5), []);
});

test('manual numeric breaks require finite increasing values within the data range', () => {
  assert.deepEqual(parseManualBreaks('0.5, 1; 1.5', 0, 2), [0.5, 1, 1.5]);
  assert.throws(() => parseManualBreaks('1, 1', 0, 2), /strictly increasing/);
  assert.throws(() => parseManualBreaks('3', 0, 2), /inside the field’s data range/);
});

test('numeric range and explicit class expressions preserve their field values', () => {
  assert.deepEqual(stepColorExpression('CU', [1.5], ['#000000', '#ffffff']), [
    'step', ['to-number', ['get', 'CU'], 0], '#000000', 1.5, '#ffffff'
  ]);
  assert.deepEqual(matchColorExpression('CLASS', ['A', 'B'], ['#000000', '#ffffff']), [
    'match', ['get', 'CLASS'], 'A', '#000000', 'B', '#ffffff', '#808080'
  ]);
});
