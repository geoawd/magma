import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerrainControlsController } from '../js/terrain-controls.js';

test('terrain controls preserve configured styling and apply transparency to hillshade and contours', () => {
  const paint = [];
  const controller = createTerrainControlsController({
    map: {
      getLayer: () => true,
      setPaintProperty: (...args) => paint.push(args)
    },
    document: {},
    terrain: {
      hillshadeStrength: 0.8,
      hillshadeStyle: { method: 'basic', direction: 100 },
      contours: { opacity: 0.65, colors: { minor: '#123456', major: '#abcdef' } }
    },
    contourLineId: 'contour-line',
    contourLabelId: 'contour-label'
  });

  assert.equal(controller.hillshadePaint()['hillshade-method'], 'basic');
  assert.equal(controller.hillshadePaint()['hillshade-exaggeration'], 0.8);
  assert.deepEqual(controller.contourLineColor(), ['match', ['get', 'level'], 1, '#abcdef', '#123456']);
  assert.match(controller.hillshadeControlsMarkup(), /value="100"/);
  assert.match(controller.contourControlsMarkup(), /value="#123456"/);

  controller.setHillshadeTransparency(25);
  controller.setContourTransparency(20);
  assert.equal(controller.state.contourOpacity, 0.8);
  assert.deepEqual(paint, [
    ['hillshade', 'hillshade-exaggeration', 0.6000000000000001],
    ['contour-line', 'line-opacity', 0.8],
    ['contour-label', 'text-opacity', 0.8]
  ]);
});

test('hillshade and contour controls update style state and visible map layers', () => {
  const paint = [];
  const controller = createTerrainControlsController({
    map: {
      getLayer: () => true,
      setPaintProperty: (...args) => paint.push(args)
    },
    document: {},
    terrain: {},
    contourLineId: 'contour-line',
    contourLabelId: 'contour-label'
  });
  const controls = new Map([
    ['.hs-method', { value: 'combined' }],
    ['.hs-anchor', { value: 'viewport' }],
    ['.hs-direction', { value: '120' }],
    ['.hs-direction-value', { value: '' }],
    ['.hs-altitude', { value: '60' }],
    ['.hs-altitude-value', { value: '' }],
    ['.hs-shadow', { value: '#111111' }],
    ['.hs-highlight', { value: '#222222' }],
    ['.hs-accent', { value: '#333333' }],
    ['.ct-minor', { value: '#444444' }],
    ['.ct-major', { value: '#555555' }]
  ]);
  const panel = { querySelector: selector => controls.get(selector) };

  controller.bindHillshadeControls(panel);
  controls.get('.hs-method').value = 'combined';
  controls.get('.hs-anchor').value = 'viewport';
  controls.get('.hs-method').onchange();
  controls.get('.hs-anchor').onchange();
  controls.get('.hs-direction').oninput();
  controls.get('.hs-altitude').oninput();
  controls.get('.hs-shadow').oninput();
  controller.bindContourControls(panel);
  controls.get('.ct-minor').oninput();
  controls.get('.ct-major').oninput();

  assert.equal(controller.state.hillshadeStyle.method, 'combined');
  assert.equal(controller.state.hillshadeStyle.direction, 120);
  assert.equal(controls.get('.hs-direction-value').value, '120°');
  assert.deepEqual(controller.state.contourColors, { minor: '#444444', major: '#555555' });
  assert.ok(paint.some(([layer, property]) => layer === 'contour-line' && property === 'line-color'));
});
