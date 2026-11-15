import assert from 'node:assert/strict';
import test from 'node:test';
import { createArcgisQueryController } from '../js/arcgis-query-controller.js';

const envelope = { xmin: -6, ymin: 54, xmax: -5, ymax: 55 };

test('ArcGIS query controller cancels a stale request when a new query starts', async () => {
  const signals = [];
  const requests = [];
  const controller = createArcgisQueryController({
    getOverlays: () => [{
      id: 'reports',
      name: 'Reports',
      url: 'https://example.org/MapServer/',
      layers: '0'
    }],
    fetchImpl: (_url, { signal }) => new Promise(resolve => {
      signals.push(signal);
      requests.push(resolve);
      signal.addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        resolve(Promise.reject(error));
      }, { once: true });
    })
  });

  const first = controller.query(envelope);
  const second = controller.query(envelope);
  assert.equal(signals[0].aborted, true);
  requests[1]({
    ok: true,
    json: async () => ({ features: [{ attributes: { id: 2 } }] })
  });

  assert.deepEqual(await first, []);
  assert.deepEqual(await second, [{
    sourceLayer: 'Reports',
    layer: { id: 'reports' },
    properties: { id: 2 }
  }]);
});

test('ArcGIS query controller reports service errors but ignores cancellation errors', async () => {
  const messages = [];
  const controller = createArcgisQueryController({
    getOverlays: () => [{
      id: 'reports',
      name: 'Reports',
      url: 'https://example.org/MapServer/',
      layers: '0'
    }],
    fetchImpl: async () => ({ ok: false, status: 503 }),
    notify: message => messages.push(message)
  });

  assert.deepEqual(await controller.query(envelope), []);
  assert.deepEqual(messages, ['Could not query ArcGIS layer: Reports: HTTP 503']);
});
