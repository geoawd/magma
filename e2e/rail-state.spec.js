import { expect, test } from '@playwright/test';

test.describe('first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('rail starts collapsed and remembers the last tool', async ({ page }) => {
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.goto('/');
    await expect(page.locator('#rail')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/drawer-open/);

    await page.getByRole('button', { name: 'Legend and layers' }).click();
    await expect(page.locator('body')).toHaveClass(/drawer-open/);

    await page.goto('/');
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.locator('body')).toHaveClass(/drawer-open/);
    await expect(page.locator('#legendPage')).toHaveClass(/active/);

    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.locator('body')).not.toHaveClass(/drawer-open/);
    await page.goto('/');
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.locator('#rail')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/drawer-open/);
  });
});

test('?ui=classic restores the previous layout', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/?ui=classic');
  await expect(page.locator('html')).toHaveAttribute('data-ui', 'classic');
  await expect(page.locator('body')).toHaveClass(/drawer-open/);
});
