import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COG_DEFAULT_QUANTILE_STOPS,
  COG_RAMP_COLORS,
  cogQgisColorStops,
  cogQuantileBounds
} from '../js/cog-style.js';

test('COG quantile style creates the configured number of smooth ramp stops', () => {
  const colors = COG_RAMP_COLORS['CET rainbow4'];
  assert.equal(colors.length, COG_DEFAULT_QUANTILE_STOPS);

  const style = cogQgisColorStops({
    colors,
    mode: 'quantile',
    quantileBounds: cogQuantileBounds(Array.from({ length: 512 }, (_, index) => index), 256),
    minimum: 0,
    maximum: 511,
    stopCount: 256
  });

  assert.equal(style.discrete, false);
  assert.equal(style.colorStops.length, 256);
  assert.equal(style.colorStops[0].color, colors[0]);
  assert.equal(style.colorStops.at(-1).color, colors.at(-1));
});

test('configured COG classes create discrete stops with configured labels', () => {
  const style = cogQgisColorStops({
    colors: COG_RAMP_COLORS['CET rainbow4'],
    mode: 'classes',
    classes: [
      { max: 1, label: 'Low' },
      { max: 2, label: 'High' }
    ],
    minimum: 0,
    maximum: 3
  });

  assert.equal(style.discrete, true);
  assert.deepEqual(style.colorStops.map(stop => stop.label), ['Low', 'High', '> 2']);
  assert.equal(style.colorStops.length, 3);
});
