import { expect, test } from '@playwright/test';

test('app starts when PMTiles archives return 404', async ({ page }) => {
  const missingArchives = [];
  await page.addInitScript(() => {
    let config;
    Object.defineProperty(window, 'CONFIG', {
      configurable: true,
      get: () => config,
      set: value => {
        Object.keys(value.layerDefaults || {}).forEach(id => { value.layerDefaults[id] = true; });
        config = value;
      }
    });
  });
  await page.route(/\/data\/(linear|superficial|bedrock)\.pmtiles(?:\?|$)/, route => {
    missingArchives.push(route.request().url());
    return route.fulfill({ status: 404, body: 'Not Found' });
  });

  await page.goto('/');

  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible();
  await expect(page.locator('#themeSel option').first()).toBeAttached();
  await expect.poll(() => missingArchives.length).toBeGreaterThan(0);
});
