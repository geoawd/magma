import { expect, test } from '@playwright/test';

test('information panel links to the catalogue between About and Copyright', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#themeSel option').first()).toBeAttached({ timeout: 20_000 });
  await page.locator('#rail button[data-tool="about"]').click();

  const headings = await page.locator('#aboutPage .lgroup .lghead span').allTextContents();
  expect(headings.indexOf('About')).toBeLessThan(headings.indexOf('Data Catalogue'));
  expect(headings.indexOf('Data Catalogue')).toBeLessThan(headings.indexOf('Copyright'));
  await expect(page.locator('#dataCatalogueLink')).toHaveAttribute('href', 'data-catalogue.html');
});

test('data catalogue offers styled GeoJSON and COG GIS exports and terrain metadata', async ({ page }) => {
  await page.route('https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        properties: {
          title: 'Tellus Geophysics metadata',
          description: 'Metadata record description.',
          updated: '2026-05-01',
          keywords: ['Magnetics', 'Geophysics'],
          contacts: [{ organization: 'GSNI', emails: [{ value: 'info@example.org' }] }],
          'gn-elastic-index-record': {
            resolutionScaleDenominator: [50000],
            otherProperties: { licenseObject: ['Open Government Licence'] }
          }
        },
        time: { interval: ['2020-01-01', '..'] }
      })
    }));
  await page.goto('/data-catalogue.html');
  await page.evaluate(() => {
    window.MaplibreCOGProtocol = {
      getCogMetadata: async () => ({
        bitsPerSample: [32],
        bbox: [0, 0, 1, 1],
        images: [{ zoom: 0 }]
      }),
      locationValues: (_url, point) => [point.longitude + point.latitude]
    };
  });
  await expect(page.getByRole('heading', { name: 'Data catalogue' })).toBeVisible();
  await expect(page.locator('#catalogueStatus')).toContainText('datasets across');

  const groupNames = await page.locator('.dataset-group summary > span:first-child').allTextContents();
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  expect(groupNames).toEqual(groupNames.slice().sort(collator.compare));

  const terrainGroup = page.locator('.dataset-group').filter({ hasText: 'Terrain COGs' });
  await expect(terrainGroup).toBeVisible();
  await expect(terrainGroup.locator('.dataset-title', { hasText: 'Open 10m DEM' })).toBeVisible();
  await expect(terrainGroup.locator('.dataset-title', { hasText: /_DTM/ }).first()).toBeVisible();
  await expect(terrainGroup.locator('.dataset-title', { hasText: /_DSM/ }).first()).toBeVisible();

  const waters = page.locator('.dataset-card').filter({ hasText: 'regionalwatersicp.geojson' });
  await expect(waters).toHaveCount(1);
  const metadata = waters.locator('.dataset-metadata');
  await expect(metadata).not.toHaveAttribute('open');
  await metadata.locator('summary').click();
  await expect(metadata).toHaveAttribute('open', '');
  await expect(metadata).toContainText('No external metadata record is configured');

  const magnetics = page.locator('.dataset-card').filter({ hasText: 'Magnetics Residual' }).first();
  const magneticsMetadata = magnetics.locator('.dataset-metadata');
  await magneticsMetadata.locator('summary').click();
  await expect(magneticsMetadata.locator('.metadata-record-title')).toHaveText('Tellus Geophysics metadata');
  await expect(magneticsMetadata).toContainText('Metadata record description.');
  await expect(magneticsMetadata).toContainText('1:50,000');
  await expect(magneticsMetadata).toContainText('Open Government Licence');
  await expect(magneticsMetadata.getByRole('link', { name: 'View full metadata record' })).toBeVisible();

  const geojsonDownloadPromise = page.waitForEvent('download');
  await waters.getByRole('button', { name: 'QGIS .qlr' }).click();
  const geojsonDownload = await geojsonDownloadPromise;
  const geojsonStream = await geojsonDownload.createReadStream();
  const geojsonChunks = [];
  for await (const chunk of geojsonStream) geojsonChunks.push(chunk);
  const geojsonQlr = Buffer.concat(geojsonChunks).toString('utf8');
  expect(geojsonQlr).toContain('<provider>ogr</provider>');
  expect(geojsonQlr).toContain('<authid>EPSG:4326</authid>');
  expect(geojsonQlr).toContain('31,134,219,255');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__catalogueCopiedUrl = value; } }
    });
  });
  await waters.getByRole('button', { name: 'Copy URL' }).click();
  await expect.poll(() => page.evaluate(() => window.__catalogueCopiedUrl))
    .toBe(new URL('data/regionalwatersicp.geojson', page.url()).href);

  const cog = page.locator('.dataset-card').filter({ hasText: 'Aluminium Al % DL = 0.01' });
  await expect(cog).toBeVisible();
  await expect(cog.locator('.dataset-meta')).toContainText('configured classes, CET rainbow4');
  const cogDownloadPromise = page.waitForEvent('download');
  await cog.getByRole('button', { name: 'QGIS .qlr' }).click();
  const cogDownload = await cogDownloadPromise;
  const cogStream = await cogDownload.createReadStream();
  const cogChunks = [];
  for await (const chunk of cogStream) cogChunks.push(chunk);
  const cogQlr = Buffer.concat(cogChunks).toString('utf8');
  expect(cogQlr).toContain('<provider>gdal</provider>');
  expect(cogQlr).toContain('type="singlebandpseudocolor"');
  expect(cogQlr).toContain('colorRampType="DISCRETE"');
  expect(cogQlr).toContain('label="0.06 (1st)"');

  const magneticsCard = page.locator('.dataset-card').filter({ hasText: 'Magnetics Residual' });
  await expect(magneticsCard.locator('.dataset-meta')).toContainText('Quantile (256 stops, smooth), CET rainbow4');
  const magneticsDownloadPromise = page.waitForEvent('download');
  await magneticsCard.getByRole('button', { name: 'QGIS .qlr' }).click();
  const magneticsDownload = await magneticsDownloadPromise;
  const magneticsStream = await magneticsDownload.createReadStream();
  const magneticsChunks = [];
  for await (const chunk of magneticsStream) magneticsChunks.push(chunk);
  const magneticsQlr = Buffer.concat(magneticsChunks).toString('utf8');
  expect(magneticsQlr).toContain('type="singlebandpseudocolor"');
  expect(magneticsQlr).toContain('colorRampType="INTERPOLATED"');
  expect((magneticsQlr.match(/<item /g) || []).length).toBe(256);
});
