import { expect, test } from '@playwright/test';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#themeSel option').first()).toBeAttached({ timeout: 20_000 });
});

async function openUserLayerForm(page, url, group) {
  await page.getByRole('button', { name: 'Add data to the current theme' }).click();
  await page.getByRole('button', { name: 'Add your own layer' }).click();
  await page.locator('#userLayerUrl').fill(url);
  await page.locator('#userLayerGroup').fill(group);
}

test('adds each MapServer sublayer separately in the selected group', async ({ page }) => {
  await page.route('https://services.example.test/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/MapServer')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          layers: [
            { id: 0, name: 'Dykes', parentLayerId: -1, subLayerIds: null },
            { id: 1, name: 'Bedrock group', parentLayerId: -1, subLayerIds: [2, 3] },
            { id: 2, name: 'Faults', parentLayerId: 1, subLayerIds: null, defaultVisibility: false },
            { id: 3, name: 'Bedrock geology', parentLayerId: 1, subLayerIds: null }
          ]
        })
      });
    }
    if (url.pathname.endsWith('/legend')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ layers: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });
  await openUserLayerForm(
    page, 'https://services.example.test/arcgis/rest/services/Test/MapServer', 'Bedrock'
  );
  await page.getByRole('button', { name: 'Add layer' }).click();
  const rows = page.locator('#legend [data-order-key^="overlay:user-layer-"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Dykes' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Faults' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Bedrock geology' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mapviewer.user-layers.v1')));
  expect(saved.map(({ name, group, layers, visible }) => ({ name, group, layers, visible }))).toEqual([
    { name: 'Dykes', group: 'Bedrock', layers: '0', visible: true },
    { name: 'Faults', group: 'Bedrock', layers: '2', visible: false },
    { name: 'Bedrock geology', group: 'Bedrock', layers: '3', visible: true }
  ]);
});

test('adds a cached MapServer without sublayers as one layer', async ({ page }) => {
  await page.route('https://services.example.test/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/MapServer')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ mapName: 'Cached geology', tileInfo: { rows: 256, cols: 256 }, layers: [] })
      });
    }
    if (url.pathname.endsWith('/legend')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ layers: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });
  await openUserLayerForm(
    page, 'https://services.example.test/arcgis/rest/services/Cached/MapServer', 'Cached layers'
  );
  await page.getByRole('button', { name: 'Add layer' }).click();
  await expect(page.locator('#legend [data-order-key^="overlay:user-layer-"]').filter({ hasText: 'Cached geology' }))
    .toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mapviewer.user-layers.v1')));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    name: 'Cached geology',
    group: 'Cached layers',
    tiles: 'https://services.example.test/arcgis/rest/services/Cached/MapServer/tile/{z}/{y}/{x}'
  });
});
