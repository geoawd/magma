import { expect, test } from '@playwright/test';

test('hostile map attributes stay inert and unsafe links are not clickable', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.route('https://map.bgs.ac.uk/arcgis/rest/services/GeoIndex_GSNI/GSNI_Hydrogeology/MapServer/0/query**',
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        features: [{
          attributes: {
            REPORT_TITLE: '<img src=x onerror=alert(1)>',
            REPORT_LINK: 'javascript:alert(1)',
            '<script>alert(1)</script>': 'untrusted field'
          }
        }]
      })
    }));
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Theme' }).selectOption({ label: 'Hydrogeology' });
  await page.getByRole('checkbox', { name: 'Hydrogeology Reports', exact: true }).check();
  await page.locator('#map canvas').click({ position: { x: 400, y: 250 } });

  const popup = page.locator('.idpop');
  await expect(popup).toContainText('<img src=x onerror=alert(1)>');
  await expect(popup).toContainText('<script>alert(1)</script>');
  await expect(popup.locator('img, script')).toHaveCount(0);
  await expect(popup.locator('a[href^="javascript:"]')).toHaveCount(0);

  const section = popup.locator('.idhead').first();
  await expect(section).toHaveJSProperty('tagName', 'BUTTON');
  await section.press('Space');
  await expect(section).toHaveAttribute('aria-expanded', 'false');
});
