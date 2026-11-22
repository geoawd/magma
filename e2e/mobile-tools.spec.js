import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { window.__printCalled = false; window.print = () => { window.__printCalled = true; }; });
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#themeSel option').first()).toBeAttached({ timeout: 20_000 });
});

test('mobile More map tools provides globe and print actions', async ({ page }) => {
  const moreTools = page.getByRole('button', { name: 'More map tools' });
  const menu = page.getByRole('group', { name: 'More map tools' });
  await expect(moreTools).toBeVisible();
  await moreTools.click();
  await expect(menu).toBeVisible();

  await page.getByRole('button', { name: 'Toggle globe view' }).click();
  await expect(page.locator('#globeBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(menu).toBeHidden();

  await moreTools.click();
  await page.getByRole('button', { name: 'Print map' }).click();
  await expect.poll(() => page.evaluate(() => window.__printCalled)).toBe(true);
});

test('desktop keeps globe and print tools on the rail instead of More map tools', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('button', { name: 'More map tools' })).toBeHidden();
  await expect(page.locator('#globeBtn')).toBeVisible();
  await expect(page.locator('#printBtn')).toBeVisible();
});

test('tablet drawer hides location search and restores it when closed', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const locationSearch = page.locator('#geo');
  await expect(locationSearch).toBeVisible();

  await page.getByRole('button', { name: 'Legend and layers' }).click();
  await expect(locationSearch).toBeHidden();

  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(locationSearch).toBeVisible();
});

test('coordinates sit just above the scale bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const mapInfo = page.locator('#mapinfo');
  const scaleBar = page.locator('.maplibregl-ctrl-scale');
  await expect(scaleBar).toBeVisible();
  const gap = await page.evaluate(() => {
    const info = document.querySelector('#mapinfo').getBoundingClientRect();
    const scale = document.querySelector('.maplibregl-ctrl-scale').getBoundingClientRect();
    return scale.top - info.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(6);
  expect(gap).toBeLessThanOrEqual(16);
  await expect(mapInfo).toBeVisible();
});

test('drawing controls load on demand and are available from the mobile tools menu', async ({ page }) => {
  await expect(page.locator('#themeSel option').first()).toBeAttached({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Legend and layers' }).click();
  await expect(page.getByRole('button', { name: 'Advanced mode' })).toBeVisible();
  await page.getByRole('button', { name: 'Advanced mode' }).click();
  const drawingControl = page.locator('.advanced-drawing-tools');
  await expect(drawingControl).toBeAttached({ timeout: 20_000 });
  await page.getByRole('button', { name: 'More map tools' }).click();
  await page.getByRole('button', { name: 'Drawing tools' }).click();
  await expect(drawingControl).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mobile-drawing-tools-open/);
});

test('page policy restricts scripts while allowing secure map data and workers', async ({ page }) => {
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("'wasm-unsafe-eval'");
  expect(policy).toContain("worker-src 'self' blob: https://unpkg.com");
  expect(policy).toContain("connect-src 'self' blob: data: https: cog:");
  expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
});
