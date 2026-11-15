import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGeojsonPaint } from '../js/geojson-style-controller.js';

test('applies configured GeoJSON colors to fill, line, and point map layers', () => {
  const updates = [];
  const map = { setPaintProperty: (...args) => updates.push(args) };
  const overlay = {
    id: 'samples',
    style: { color: '#123456', fill: ['get', 'CLASS'] }
  };

  applyGeojsonPaint(map, overlay);

  assert.deepEqual(updates, [
    ['samples-fill', 'fill-color', ['get', 'CLASS']],
    ['samples', 'line-color', '#123456'],
    ['samples-points', 'circle-stroke-color', '#123456'],
    ['samples-points', 'circle-color', ['get', 'CLASS']]
  ]);
});

test('falls back to the default color when the configured style is empty', () => {
  const updates = [];
  applyGeojsonPaint({ setPaintProperty: (...args) => updates.push(args) }, { id: 'samples' });
  assert.deepEqual(updates.map(update => update[2]), Array(4).fill('#d9480f'));
});
