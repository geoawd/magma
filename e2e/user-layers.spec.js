import { expect, test } from '@playwright/test';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);

async function openUserLayerForm(page, type, url, title) {
  await page.getByRole('button', { name: 'Add data to the current theme' }).click();
  await page.getByRole('button', { name: 'Add your own layer' }).click();
  await page.locator('#userLayerType').selectOption(type);
  await page.locator('#userLayerUrl').fill(url);
  await page.locator('#userLayerName').fill(title);
}

test('rejects XYZ URLs without tile placeholders', async ({ page }) => {
  await openUserLayerForm(page, 'xyz', 'https://tiles.example.test/tiles.png', 'Invalid XYZ');
  await page.getByRole('button', { name: 'Add layer' }).click();
  await expect(page.locator('#userLayerError')).toContainText('must contain {z}, {x}, and {y}');
  await expect(page.locator('#userLayerDialog')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mapviewer.user-layers.v1') || '[]'))).toEqual([]);
});

test('adds and saves a verified XYZ layer', async ({ page }) => {
  await page.route('https://tiles.example.test/**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: pixel
  }));
  await openUserLayerForm(page, 'xyz', 'https://tiles.example.test/{z}/{x}/{y}.png', 'User XYZ');
  await page.getByRole('button', { name: 'Add layer' }).click();

  const row = page.locator('#legend [data-order-key^="overlay:user-layer-"]').filter({ hasText: 'User XYZ' });
  await expect(row).toBeVisible();
  await expect(row.locator('.grprow input[type="checkbox"]')).toBeChecked();
  await expect(page.locator('#userLayerDialog')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mapviewer.user-layers.v1'))[0].tiles))
    .toBe('https://tiles.example.test/{z}/{x}/{y}.png');
});

test('validates WMS capabilities and the selected layer name', async ({ page }) => {
  await page.route('https://wms.example.test/**', route => route.fulfill({
    status: 200,
    contentType: 'application/xml',
    headers: { 'access-control-allow-origin': '*' },
    body: '<WMS_Capabilities version="1.3.0"><Capability><Layer><Title>Root</Title><Layer><Name>geology</Name></Layer></Layer></Capability></WMS_Capabilities>'
  }));
  await openUserLayerForm(page, 'wms', 'https://wms.example.test/service', 'User WMS');
  await page.locator('#userLayerWmsNames').fill('missing-layer');
  await page.getByRole('button', { name: 'Add layer' }).click();
  await expect(page.locator('#userLayerError')).toContainText('listed by the service capabilities');
  await page.locator('#userLayerWmsNames').fill('geology');
  await page.getByRole('button', { name: 'Add layer' }).click();
  await expect(page.locator('#legend [data-order-key^="overlay:user-layer-"]').filter({ hasText: 'User WMS' })).toBeVisible();
});

test('validates Esri REST metadata before adding a cached MapServer', async ({ page }) => {
  await page.route('https://services.example.test/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/MapServer')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ tileInfo: { rows: 256, cols: 256 }, layers: [] })
      });
    }
    if (url.pathname.endsWith('/legend')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ layers: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });
  await openUserLayerForm(
    page, 'esri-rest', 'https://services.example.test/arcgis/rest/services/Test/MapServer', 'User Esri'
  );
  await page.getByRole('button', { name: 'Add layer' }).click();
  const row = page.locator('#legend [data-order-key^="overlay:user-layer-"]').filter({ hasText: 'User Esri' });
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mapviewer.user-layers.v1'))[0].tiles))
    .toBe('https://services.example.test/arcgis/rest/services/Test/MapServer/tile/{z}/{y}/{x}');
});
