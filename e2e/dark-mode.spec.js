import { expect, test } from '@playwright/test';

for (const ui of ['classic', 'v2']) {
  test(`${ui} UI theme can be selected and persists`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.goto(`/?ui=${ui}`);
    await expect(page.locator('#themeSel option').first()).toBeAttached({ timeout: 20_000 });
    await expect(page.locator('#rail [data-tool="legend"]')).toHaveClass(/active/);
    await page.getByRole('button', { name: 'Information', exact: true }).click();
    const themeHeading = page.getByRole('button', { name: 'Theme', exact: true });
    const aboutHeading = page.getByRole('button', { name: 'About', exact: true });
    await expect(themeHeading.locator('xpath=..')).toHaveClass(/lghead/);
    await expect(themeHeading).toHaveAttribute('aria-expanded', 'true');
    const headingColors = await Promise.all([
      themeHeading.locator('xpath=..').evaluate(element => getComputedStyle(element).backgroundColor),
      aboutHeading.locator('xpath=..').evaluate(element => getComputedStyle(element).backgroundColor)
    ]);
    expect(headingColors[0]).toBe(headingColors[1]);
    await themeHeading.click();
    await expect(themeHeading).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#themeGroup .theme-options')).toBeHidden();
    await themeHeading.click();
    await expect(themeHeading).toHaveAttribute('aria-expanded', 'true');
    const lightChoice = page.locator('[data-theme-choice="light"]');
    const darkChoice = page.locator('[data-theme-choice="dark"]');

    await expect(darkChoice).toHaveAttribute('aria-pressed', 'true');
    await lightChoice.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(lightChoice).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('mapviewer.theme.v1'))).toBe('light');
    await darkChoice.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('mapviewer.theme.v1'))).toBe('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#map')).toHaveCSS('filter', 'none');
  });
}

test('data catalogue uses the selected theme', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#themeSel option').first()).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('#rail [data-tool="legend"]')).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Information', exact: true }).click();
  await page.locator('[data-theme-choice="dark"]').click();
  await page.goto('/data-catalogue.html');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(27, 37, 43)');
  await expect(page.locator('#catalogueSearch')).toHaveCSS('background-color', 'rgb(34, 44, 51)');
});

test('classification dialog inputs stay legible in dark mode', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mapviewer.theme.v1', 'dark'));
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeAttached({ timeout: 20_000 });
  await page.getByRole('combobox', { name: 'Theme' }).selectOption({ label: 'Tellus Geochemistry' });
  await page.getByRole('button', { name: 'Advanced mode' }).click();

  const classify = page.getByRole('button', { name: 'Classify Tellus Waters' });
  await expect(classify).toBeEnabled();
  await classify.click();
  const dialog = page.getByRole('dialog', { name: 'Classify Tellus Waters layer' });
  const field = dialog.locator('#geojsonStyleField');
  await expect(field).toHaveCSS('background-color', 'rgb(30, 40, 47)');
  await expect(field).toHaveCSS('color', 'rgb(228, 234, 238)');
  await expect(dialog.locator('#geojsonClassCount')).toHaveCSS('background-color', 'rgb(30, 40, 47)');
  await expect(dialog.locator('#geojsonClassCount')).toHaveCSS('color', 'rgb(228, 234, 238)');
});
