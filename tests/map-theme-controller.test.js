import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveThemeMembership } from '../js/map-theme-controller.js';

test('theme membership combines direct layers, datasets, groups, and overlay groups', () => {
  const membership = resolveThemeMembership({
    theme: {
      name: 'Theme',
      layers: ['direct-layer'],
      datasets: ['dataset'],
      groups: ['Hydrogeology', 'Named group'],
      overlays: ['direct-overlay']
    },
    groupMembers: [{
      layers: ['group-layer'],
      overlays: ['group-overlay']
    }],
    overlayConfigs: [
      { id: 'direct-overlay', group: 'Raster group' },
      { id: 'overlay-one', group: 'Hydrogeology' },
      { id: 'overlay-two', group: 'Hydrogeology' },
      { id: 'group-overlay', group: 'Other' }
    ],
    datasetLayers: { dataset: ['dataset-layer'] }
  });

  assert.equal(membership.activeThemeAll, false);
  assert.deepEqual(membership.themeBaseLayers, ['direct-layer', 'dataset-layer', 'group-layer']);
  assert.deepEqual(membership.themeBaseOverlays, [
    'direct-overlay', 'overlay-one', 'overlay-two', 'group-overlay'
  ]);
  assert.deepEqual(membership.overlayGroups, [{ ids: ['overlay-one', 'overlay-two'] }]);
});

test('an unrestricted theme includes every configured overlay and vector layer', () => {
  const membership = resolveThemeMembership({
    theme: { name: 'All data' },
    groupMembers: [],
    overlayConfigs: [{ id: 'overlay', group: 'Group' }],
    datasetLayers: {}
  });

  assert.equal(membership.activeThemeAll, true);
  assert.deepEqual(membership.themeBaseLayers, []);
  assert.deepEqual(membership.themeBaseOverlays, []);
});
