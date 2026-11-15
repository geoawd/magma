import { expect, test } from '@playwright/test';

test('Terrain contours stay listed while the COG protocol loads', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/js/maplibre-cog-protocol.js', route => route.abort());
  await page.goto('/');

  const contours = page.locator('#legend [data-order-key="overlay:dtm-contour-lines"]');
  await expect(contours).toBeAttached({ timeout: 20_000 });
  await expect(contours.locator('input[type="checkbox"]')).toBeChecked();
});
