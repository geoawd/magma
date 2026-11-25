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
  await expect(menu.getByRole('button')).toHaveCount(2);

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

test('printing stays light in dark mode and includes the active layer key', async ({ page }) => {
  await page.locator('html').evaluate(element => { element.dataset.theme = 'dark'; });
  const activeLegend = await page.locator('#legend .lgbody > div[data-sl]').evaluateAll(layers => {
    const layer = layers.find(candidate => {
      const section = candidate.closest('.lgroup');
      return !candidate.hidden && !candidate.classList.contains('offscale') &&
        !section?.hidden && !section?.classList.contains('group-hidden') &&
        candidate.querySelector('.ent');
    });
    if (!layer) return null;
    const checkbox = layer.querySelector(':scope > .grprow .lname input[type="checkbox"]');
    const label = layer.querySelector('.lname span');
    if (!checkbox || !label) return null;
    if (!checkbox.checked) checkbox.click();
    const entry = [...layer.querySelectorAll('.ent')].find(candidate => {
      const categoryCheckbox = candidate.querySelector('input[type="checkbox"]');
      return !candidate.classList.contains('nv') && (!categoryCheckbox || categoryCheckbox.checked);
    });
    const spans = entry?.querySelectorAll('.ent-toggle > span');
    return {
      name: label.textContent.trim(),
      category: spans?.[spans.length - 1]?.textContent.trim()
    };
  });
  expect(activeLegend?.name).toBeTruthy();
  expect(activeLegend?.category).toBeTruthy();

  await page.getByRole('button', { name: 'More map tools' }).click();
  await page.getByRole('button', { name: 'Print map' }).click();
  await expect.poll(() => page.evaluate(() => window.__printCalled)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#printView .pv-key')).toContainText(activeLegend.name);
  await expect(page.locator('#printView .pv-key')).toContainText(activeLegend.category);
  await expect(page.locator('#printView .pv-key .pv-ent .sw')).not.toHaveCount(0);
  const printColors = await page.evaluate(() => ({
    background: getComputedStyle(document.documentElement).backgroundColor,
    text: getComputedStyle(document.querySelector('#printView')).color,
    colorScheme: getComputedStyle(document.documentElement).colorScheme
  }));
  expect(printColors).toEqual({ background: 'rgb(255, 255, 255)', text: 'rgb(0, 0, 0)', colorScheme: 'light' });
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

test('page policy restricts scripts while allowing secure map data and workers', async ({ page }) => {
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("'wasm-unsafe-eval'");
  expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(policy).toContain("worker-src 'self' blob:");
  expect(policy).toContain("connect-src 'self' blob: data: https: cog:");
  expect(policy).toContain("img-src 'self' data: blob: https:");
  expect(policy).not.toContain('unpkg.com');
  expect(policy).not.toContain('cdn.jsdelivr.net');
  expect(policy).not.toContain('cdnjs.cloudflare.com');
  expect(policy).not.toContain('child-src');
  expect(policy).toContain("form-action 'self'");
  expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
});
