import { expect, test } from '@playwright/test';

test('users can save, restore, and remove named map workspaces', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible();
  await page.getByRole('button', { name: 'Information', exact: true }).click();

  await page.locator('#workspaceName').fill('Field sites');
  await page.getByRole('button', { name: 'Save current workspace' }).click();
  await expect(page.locator('#workspaceStatus')).toContainText('Saved workspace "Field sites"');

  const savedZoom = await page.evaluate(() => JSON.parse(
    localStorage.getItem('mapviewer.workspaces.v1')
  )[0].snapshot.view.zoom);
  await page.locator('.maplibregl-ctrl-zoom-in').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('mapviewer.session.v1')
  )?.view.zoom)).toBeGreaterThan(savedZoom);

  await page.locator('#workspaceSelect').selectOption({ label: 'Field sites' });
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('#workspaceStatus')).toHaveText('Loaded workspace "Field sites".');
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('mapviewer.session.v1')
  )?.view.zoom)).toBe(savedZoom);

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('#workspaceStatus')).toHaveText('Removed workspace "Field sites".');
  await expect(page.locator('#workspaceSelect option')).toHaveCount(1);
});
