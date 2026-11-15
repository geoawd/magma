import assert from 'node:assert/strict';
import test from 'node:test';
import { createOverlayDownloadController } from '../js/overlay-download-controller.js';

function setup(overrides = {}) {
  const calls = [];
  const links = [];
  const timers = [];
  const builtDefinitions = [];
  const URLApi = class extends URL {};
  URLApi.createObjectURL = blob => {
    calls.push(['objectUrl', blob.parts, blob.options]);
    return 'blob:download';
  };
  URLApi.revokeObjectURL = value => calls.push(['revoke', value]);
  const controller = createOverlayDownloadController({
    document: {
      createElement: tag => {
        const link = { tag, click() { calls.push(['click', this.download]); } };
        links.push(link);
        return link;
      }
    },
    window: { prompt: (...args) => calls.push(['prompt', ...args]) },
    navigator: { clipboard: { writeText: async value => calls.push(['copy', value]) } },
    URL: URLApi,
    Blob: class {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    },
    crypto: { randomUUID: () => 'uuid-id' },
    setTimeout: (callback, delay) => timers.push([callback, delay]),
    console: {
      warn: (...args) => calls.push(['warn', ...args]),
      error: (...args) => calls.push(['error', ...args])
    },
    getBaseUrl: () => 'https://map.example.test/viewer/',
    toast: message => calls.push(['toast', message]),
    prepareCogQgisStyle: async () => true,
    cogQgisColorStops: () => ({ colorStops: [{ value: 0, color: '#000000' }] }),
    buildQgisLayerDefinition: options => {
      builtDefinitions.push(options);
      return '<raster-definition />';
    },
    geojsonLegendCategories: () => [{ field: 'Cu', text: '0 - 5', color: '#112233' }],
    geojsonFieldStats: () => [{ name: 'Cu', min: 0, max: 5 }],
    buildGeojsonQgisLayerDefinition: options => {
      builtDefinitions.push(options);
      return '<vector-definition />';
    },
    ...overrides
  });
  return { controller, calls, links, timers, builtDefinitions };
}

test('COG export preserves raster style, source metadata, download status, and clipboard actions', async () => {
  const { controller, calls, links, timers, builtDefinitions } = setup();
  const copyButton = {};
  const qgisButton = {};
  const statusElement = { textContent: '' };
  const overlay = {
    id: 'cog raster',
    name: 'COG Raster',
    qgisCrs: 'EPSG:29902',
    cogState: {
      url: 'https://data.example.test/dtm.tif',
      opacity: 0.6,
      rangeMin: -2,
      rangeMax: 10,
      bandCount: 1
    }
  };
  controller.bindCogDownloads({ overlay, copyButton, qgisButton, statusElement });

  await qgisButton.onclick();

  assert.equal(qgisButton.disabled, false);
  assert.equal(builtDefinitions[0].id, 'cog_raster_uuid_id');
  assert.equal(builtDefinitions[0].url, overlay.cogState.url);
  assert.equal(builtDefinitions[0].opacity, 0.6);
  assert.equal(builtDefinitions[0].minimum, -2);
  assert.equal(builtDefinitions[0].maximum, 10);
  assert.equal(builtDefinitions[0].crsAuthId, 'EPSG:29902');
  assert.deepEqual(builtDefinitions[0].colorStops, [{ value: 0, color: '#000000' }]);
  assert.equal(links[0].download, 'COG Raster.qlr');
  assert.equal(statusElement.textContent, 'QGIS layer definition downloaded with the current color style and breaks.');
  assert.deepEqual(calls.find(([name]) => name === 'objectUrl'), [
    'objectUrl', ['<raster-definition />'], { type: 'application/xml;charset=utf-8' }
  ]);
  assert.equal(timers[0][1], 60_000);

  await copyButton.onclick();
  assert.ok(calls.some(([name, value]) => name === 'copy' && value === overlay.cogState.url));
  assert.equal(statusElement.textContent, 'Source URL copied to clipboard.');
});

test('download control markup provides accessible actions and the selectors used for binding', () => {
  const { controller } = setup();
  const cogMarkup = controller.cogDownloadControlsMarkup();
  const geojsonMarkup = controller.geojsonDownloadControlsMarkup();

  assert.match(cogMarkup, /aria-label="Download and source"/);
  assert.match(cogMarkup, /class="cog-qgis-download"/);
  assert.match(cogMarkup, /class="cog-source-copy"/);
  assert.match(cogMarkup, /class="cog-download-status" role="status" aria-live="polite"/);
  assert.match(cogMarkup, /class="cog-arcpro-placeholder"[^>]*disabled/);
  assert.match(geojsonMarkup, /class="geojson-qgis-download"/);
  assert.match(geojsonMarkup, /class="geojson-source-copy"/);
  assert.match(geojsonMarkup, /class="cog-download-status geojson-download-status" role="status" aria-live="polite"/);
});

test('COG style preparation failure falls back to grayscale and reports the limitation', async () => {
  const { controller, calls, builtDefinitions } = setup({
    prepareCogQgisStyle: async () => { throw new Error('style unavailable'); }
  });
  const qgisButton = {};
  const statusElement = { textContent: '' };
  controller.bindCogDownloads({
    overlay: {
      id: 'multiband',
      cogState: { url: 'https://data.example.test/multiband.tif', bandCount: 3 }
    },
    copyButton: {},
    qgisButton,
    statusElement
  });

  await qgisButton.onclick();

  assert.equal(builtDefinitions[0].renderer, 'gray');
  assert.match(statusElement.textContent, /color style unavailable: style unavailable/);
  assert.ok(calls.some(([name]) => name === 'warn'));
});

test('GeoJSON export includes configured classes and field statistics; clipboard fallback prompts', async () => {
  const { controller, calls, links, builtDefinitions } = setup({
    navigator: { clipboard: { writeText: async () => { throw new Error('clipboard unavailable'); } } }
  });
  const copyButton = {};
  const qgisButton = {};
  const statusElement = { textContent: '' };
  const overlay = {
    id: 'waters',
    name: 'Waters',
    url: 'data/waters.geojson',
    projection: 'EPSG:4326',
    style: { color: '#112233' },
    geometryType: 'Point'
  };
  const loader = {
    geometryTypes: ['Point'],
    data: { features: [{ properties: { Cu: 2 } }] }
  };
  controller.bindGeojsonDownloads({ overlay, loader, copyButton, qgisButton, statusElement });

  qgisButton.onclick();

  assert.equal(qgisButton.disabled, false);
  assert.equal(builtDefinitions[0].url, 'https://map.example.test/viewer/data/waters.geojson');
  assert.equal(builtDefinitions[0].opacity, 1);
  assert.equal(builtDefinitions[0].crsAuthId, 'EPSG:4326');
  assert.deepEqual(builtDefinitions[0].geometryTypes, ['Point']);
  assert.deepEqual(builtDefinitions[0].categories, [{ field: 'Cu', text: '0 - 5', color: '#112233' }]);
  assert.equal(builtDefinitions[0].minimum, 0);
  assert.equal(builtDefinitions[0].maximum, 5);
  assert.equal(links[0].download, 'Waters.qlr');
  assert.equal(statusElement.textContent, 'QGIS vector layer definition downloaded with the configured GeoJSON style.');

  await copyButton.onclick();
  assert.ok(calls.some(([name, message, url]) =>
    name === 'prompt' && message === 'Copy this source URL' && url === builtDefinitions[0].url));
  assert.equal(statusElement.textContent, 'Clipboard unavailable; copy the URL from the prompt.');
});
