import assert from 'node:assert/strict';
import test from 'node:test';
import { terrainErrorToast } from '../js/terrain-error-toast.js';

test('a generic request failure with a readable TIFF suggests retrying for two seconds', () => {
  assert.deepEqual(terrainErrorToast('Request failed', null), {
    message: '3D / hillshade: Request failed. Please try again.',
    duration: 2000
  });
});

test('specific DTM diagnoses are preserved and shown briefly', () => {
  assert.deepEqual(terrainErrorToast('Request failed', 'The server answered 404 for the terrain file.'), {
    message: '3D / hillshade: The server answered 404 for the terrain file.',
    duration: 5000
  });
});

test('unreadable COG details retain the format guidance and show briefly', () => {
  assert.deepEqual(terrainErrorToast('Decode error', null), {
    message: '3D / hillshade: the file is reachable but could not be read (Decode error). It must be a single-band elevation COG, tiled, with overviews.',
    duration: 5000
  });
});
