import assert from 'node:assert/strict';
import test from 'node:test';
import { cogResamplingUrl } from '../js/cog-resampling.js';

test('COG resampling appends protocol parameters to base and styled source URLs', () => {
  assert.equal(
    cogResamplingUrl('cog://Ballygalley_15_03_2010_DTM.tif', 'bilinear'),
    'cog://Ballygalley_15_03_2010_DTM.tif#&resampling=bilinear'
  );
  assert.equal(
    cogResamplingUrl('cog://Ballygalley_15_03_2010_DTM.tif#color=palette,0,100,c', 'nearest'),
    'cog://Ballygalley_15_03_2010_DTM.tif#color=palette,0,100,c&resampling=nearest'
  );
  assert.equal(cogResamplingUrl('cog://Ballygalley_15_03_2010_DTM.tif', undefined),
    'cog://Ballygalley_15_03_2010_DTM.tif');
});

test('COG resampling rejects unsupported methods', () => {
  assert.throws(() => cogResamplingUrl('cog://raster.tif', 'cubic'), /nearest.*bilinear/);
});
