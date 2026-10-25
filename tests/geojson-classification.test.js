import assert from 'node:assert/strict';
import test from 'node:test';
import {
  equalIntervalBreaks,
  geojsonFieldStats,
  matchColorExpression,
  parseManualBreaks,
  quantileBreaks,
  stepColorExpression,
  tellusPercentileClassification
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

test('Tellus Percentile returns the fixed percentile boundaries and class labels', () => {
  const { breaks, labels } = tellusPercentileClassification(
    Array.from({ length: 100 }, (_, index) => index + 1)
  );

  assert.equal(breaks.length, 16);
  assert.ok(breaks.every((value, index) => index === 0 || value > breaks[index - 1]));
  assert.deepEqual(labels, [
    '1.99 (1st)',
    '2.98 (2nd)',
    '5.95 (5th)',
    '10.90 (10th)',
    '15.85 (15th)',
    '20.80 (20th)',
    '25.75 (25th)',
    '40.60 (40th)',
    '50.50 (50th)',
    '60.40 (60th)',
    '75.25 (75th)',
    '85.15 (85th)',
    '90.10 (90th)',
    '95.05 (95th)',
    '98.02 (98th)',
    '99.01 (99th)',
    '100.00 (100th)'
  ]);
});

test('Tellus Percentile handles tied and constant values without invalid breaks', () => {
  const tied = tellusPercentileClassification([1, 1, 1, 2, 2, 3, 3, 3]);
  assert.ok(tied.breaks.every((value, index) => index === 0 || value > tied.breaks[index - 1]));
  assert.equal(tied.labels.length, tied.breaks.length + 1);
  assert.deepEqual(tellusPercentileClassification([4, 4, 4]), {
    breaks: [],
    labels: ['All values']
  });
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
