import assert from 'node:assert/strict';
import test from 'node:test';
import { createCogRampControlsController } from '../js/cog-ramp-controls.js';

test('COG ramp controls detect multiband rasters and guard concurrent initialization', async () => {
  let resolveMetadata;
  let metadataCalls = 0;
  const status = { textContent: '' };
  const controls = { querySelector: () => status };
  const panel = { querySelector: () => controls };
  const state = {
    url: 'https://data.example.test/multiband.tif',
    controlsInitialized: false,
    controlsInitializing: false,
    valueReadoutAvailable: true,
    ramp: 'viridis'
  };
  const overlay = { id: 'rgb', cogState: state };
  const synced = [];
  const controller = createCogRampControlsController({
    map: {},
    document: {},
    window: {
      MaplibreCOGProtocol: {
        getCogMetadata() {
          metadataCalls++;
          return new Promise(resolve => { resolveMetadata = resolve; });
        }
      }
    },
    Option: class {},
    quantileClassCount: 7,
    hillshadeMaxVerticalScale: 1000,
    hillshadeSliderMax: 100,
    hillshadeTargetRange: 100,
    displayRange: () => ({ min: 0, max: 1 }),
    legendValueLabel: String,
    legendClassLabel: value => value,
    percentileRange: () => null,
    hillshadeSliderValue: () => 1,
    hillshadeScaleFromSlider: () => 1,
    isOverlayVisible: () => true,
    updateColorLayers() {},
    syncLayerMode: item => synced.push(item),
    createHillshade() {},
    effectiveHillshadeStrength: () => 0,
    refreshHillshade() {},
    refreshContours: async () => {},
    getCursorPosition: () => null,
    scheduleCursorValues() {},
    toast() {}
  });

  controller.initialize(overlay, panel, {});
  controller.initialize(overlay, panel, {});
  assert.equal(state.controlsInitializing, true);
  assert.equal(metadataCalls, 1);
  resolveMetadata({ bitsPerSample: [8, 8, 8] });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(state.controlsInitialized, true);
  assert.equal(state.controlsInitializing, false);
  assert.equal(state.valueReadoutAvailable, false);
  assert.equal(state.ramp, '');
  assert.match(status.textContent, /Multiband COGs are displayed as RGB/);
  assert.deepEqual(synced, [overlay]);
});
