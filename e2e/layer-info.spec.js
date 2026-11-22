import { expect, test } from '@playwright/test';

async function openWithBoreholesMetadata(page, metadata) {
  await page.route('**/config/overlays.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({
      response,
      body: `${source}\nwindow.CONFIG_OVERLAYS.find(overlay => overlay.id === 'Boreholes').info = { metadata: ${JSON.stringify(metadata)} };`
    });
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#themeSel option').first()).toBeAttached({ timeout: 20_000 });
}

function boreholesInfoPanel(page) {
  const layerName = page.getByText('Boreholes', { exact: true }).first();
  const row = layerName.locator('xpath=ancestor::div[contains(@class, "grprow")]/..');
  return { row, panel: row.locator('.infopanel') };
}

test('descriptive layer metadata is displayed with safe clickable URLs and is not fetched', async ({ page }) => {
  let metadataRequests = 0;
  page.on('request', request => {
    if (request.url().startsWith('https://example.org/boreholes')) metadataRequests++;
  });
  await openWithBoreholesMetadata(page,
    'Borehole overview.\n<script>alert(1)</script>\nDetails: https://example.org/boreholes.');

  const { row, panel } = boreholesInfoPanel(page);
  await row.getByRole('button', { name: 'Layer information' }).click();

  await expect(panel).toContainText('Borehole overview.');
  await expect(panel).toContainText('<script>alert(1)</script>');
  await expect(panel.locator('script')).toHaveCount(0);
  await expect(panel.locator('a[href="https://example.org/boreholes"]'))
    .toHaveText('https://example.org/boreholes');
  expect(metadataRequests).toBe(0);
});

test('HTTPS metadata URLs continue to fetch and render the configured record fields', async ({ page }) => {
  await page.route('https://metadata.example/**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      properties: {
        title: 'Fetched borehole metadata',
        description: 'Metadata description'
      }
    })
  }));
  await openWithBoreholesMetadata(page, 'https://metadata.example/record');

  const { row, panel } = boreholesInfoPanel(page);
  await row.getByRole('button', { name: 'Layer information' }).click();

  await expect(panel.locator('.ititle')).toHaveText('Fetched borehole metadata');
  await expect(panel).toContainText('Metadata description');
  await expect(panel.locator('.ifoot a[href="https://metadata.example/record"]'))
    .toHaveText('View full metadata record');
});
