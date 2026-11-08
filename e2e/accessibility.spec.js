import { expect, test } from '@playwright/test';

test('skip link is first in tab order and focuses the main map region', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');

  const skipLink = page.getByRole('link', { name: 'Skip to map' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('results expose a live count and a labeled dataset button group', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');

  await expect(page.locator('#count')).toHaveAttribute('role', 'status');
  await expect(page.locator('#count')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#tabs')).toHaveAttribute('role', 'group');
  await expect(page.locator('#tabs')).toHaveAttribute('aria-label', 'Result datasets');
});

test('location search suggestions are announced and keyboard operable', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.route('https://nominatim.openstreetmap.org/search**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { display_name: 'Belfast, Northern Ireland', lon: '-5.93', lat: '54.60' },
      { display_name: 'Belfast Harbour, Northern Ireland', lon: '-5.90', lat: '54.62' }
    ])
  }));
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'Search for a place or Irish grid reference' });
  await search.fill('Belfast');
  await search.press('Enter');

  const firstResult = page.getByRole('button', { name: 'Belfast, Northern Ireland' });
  await expect(firstResult).toBeVisible();
  await expect(page.locator('#geoStatus')).toHaveText('2 locations found. Choose a result.');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(firstResult).toBeFocused();
  await firstResult.press('Space');
  await expect(page.locator('#geoList')).toBeHidden();
  await expect(search).toBeFocused();
  await expect(page.locator('#geoStatus')).toHaveText('Location selected: Belfast, Northern Ireland.');
});
