import { expect, test } from '@playwright/test';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#themeSel option').first()).toBeAttached({ timeout: 20_000 });
});

test('queries visible ArcGIS overlays on map click and shows returned attributes', async ({ page }) => {
  await page.route('https://map.bgs.ac.uk/arcgis/rest/services/GeoIndex_GSNI/GSNI_Hydrogeology/MapServer/0/query**',
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        features: [{ attributes: { REPORT_TITLE: 'Test hydrogeology report', OBJECTID: 1 } }]
      })
    }));
  await page.getByRole('combobox', { name: 'Theme' }).selectOption({ label: 'Hydrogeology' });
  const layer = page.getByRole('checkbox', { name: 'Hydrogeology Reports', exact: true });
  await layer.check();

  const queryRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname.endsWith('/MapServer/0/query'));
  await page.locator('#map canvas').click({ position: { x: 400, y: 250 } });
  const request = await queryRequest;
  const url = new URL(request.url());
  expect(url.searchParams.get('outFields')).toBe('*');
  expect(url.searchParams.get('returnGeometry')).toBe('false');
  await expect(page.locator('.idpop')).toContainText('Test hydrogeology report');
});

test('mobile query popup fills the width above navigation with prominent record arrows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://map.bgs.ac.uk/arcgis/rest/services/GeoIndex_GSNI/GSNI_Hydrogeology/MapServer/0/query**',
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        features: [
          { attributes: { REPORT_TITLE: 'First report', OBJECTID: 1 } },
          { attributes: { REPORT_TITLE: 'Second report', OBJECTID: 2 } }
        ]
      })
    }));
  await page.getByRole('combobox', { name: 'Theme' }).selectOption({ label: 'Hydrogeology' });
  await page.getByRole('checkbox', { name: 'Hydrogeology Reports', exact: true }).check();
  await page.locator('#map canvas').click({ position: { x: 180, y: 180 } });
  const popup = page.locator('.idpop');
  await expect(popup).toContainText('First report');

  const position = await popup.evaluate(element => {
    const popupRect = element.getBoundingClientRect();
    const railRect = document.querySelector('#rail').getBoundingClientRect();
    return {
      left: popupRect.left,
      width: popupRect.width,
      windowWidth: window.innerWidth,
      bottom: popupRect.bottom,
      railTop: railRect.top
    };
  });
  expect(position.left).toBeCloseTo(0, 0);
  expect(position.width).toBeCloseTo(position.windowWidth, 0);
  expect(position.railTop - position.bottom).toBeGreaterThanOrEqual(0);
  expect(position.railTop - position.bottom).toBeLessThanOrEqual(2);

  const sections = popup.locator('.idsec');
  const resultSectionIndex = await sections.evaluateAll(elements =>
    elements.findIndex(element => element.textContent.includes('First report'))
  );
  expect(resultSectionIndex).toBeGreaterThanOrEqual(0);
  const resultSection = sections.nth(resultSectionIndex);
  if (await resultSection.locator('.idbody').isHidden()) await resultSection.locator('.idhead').click();
  const arrows = resultSection.locator('.pophead .nav');
  await expect(arrows).toHaveCount(2);
  const arrowSize = await arrows.first().evaluate(button => {
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height, fontSize: getComputedStyle(button).fontSize };
  });
  expect(arrowSize.width).toBeGreaterThanOrEqual(44);
  expect(arrowSize.height).toBeGreaterThanOrEqual(40);
  await arrows.last().click();
  await expect(resultSection.locator('.pg')).toHaveText('2 of 2');
  await expect(resultSection).toContainText('Second report');
});

test('box selection queries visible ArcGIS overlays and lists attributes in results', async ({ page }) => {
  await page.route('https://map.bgs.ac.uk/arcgis/rest/services/GeoIndex_GSNI/GSNI_Hydrogeology/MapServer/0/query**',
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        features: [{
          attributes: { REPORT_TITLE: 'Box-selected hydrogeology report', OBJECTID: 2 },
          geometry: { rings: [[[-6.5, 54.5], [-6.4, 54.5], [-6.4, 54.6], [-6.5, 54.6], [-6.5, 54.5]]] }
        }]
      })
    }));
  await page.getByRole('combobox', { name: 'Theme' }).selectOption({ label: 'Hydrogeology' });
  await page.getByRole('checkbox', { name: 'Hydrogeology Reports', exact: true }).check();
  const canvas = page.locator('#map canvas');
  const rect = await canvas.boundingBox();
  const queryRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname.endsWith('/MapServer/0/query'));

  await page.getByRole('button', { name: 'Select by box' }).click();
  await page.mouse.move(rect.x + 250, rect.y + 180);
  await page.mouse.down();
  await page.mouse.move(rect.x + 450, rect.y + 320, { steps: 4 });
  await page.mouse.up();

  const request = await queryRequest;
  const queryUrl = new URL(request.url());
  expect(queryUrl.searchParams.get('geometryType')).toBe('esriGeometryPolygon');
  expect(queryUrl.searchParams.get('returnGeometry')).toBe('true');
  const reportsTab = page.locator('#tabs .tab').filter({ hasText: 'Hydrogeology Reports' });
  await expect(reportsTab).toBeVisible();
  await reportsTab.click();
  await expect(page.locator('#tablewrap')).toContainText('Box-selected hydrogeology report');
  const zoomButton = page.locator('#tablewrap .vector-row-zoom');
  await expect(zoomButton).toBeEnabled();
  await zoomButton.click();
  await expect(page.locator('#map .ring')).toBeVisible();
});

async function openUserLayerForm(page, url, group) {
  await page.getByRole('button', { name: 'Add data to the current theme' }).click();
  await page.getByRole('button', { name: 'Add your own layer' }).click();
  await page.locator('#userLayerUrl').fill(url);
  await page.locator('#userLayerGroup').fill(group);
}

test('custom ArcGIS services reject insecure HTTP outside localhost', async ({ page }) => {
  await openUserLayerForm(page, 'http://services.example.test/arcgis/rest/services/Test/MapServer', 'Test');
  await page.getByRole('button', { name: 'Add layer' }).click();
  await expect(page.locator('#userLayerError')).toContainText('must use HTTPS');
});

test('adds each MapServer sublayer separately in the selected group', async ({ page }) => {
  await page.route('https://services.example.test/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/MapServer')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          layers: [
            { id: 0, name: 'Dykes', parentLayerId: -1, subLayerIds: null },
            { id: 1, name: 'Bedrock group', parentLayerId: -1, subLayerIds: [2, 3] },
            { id: 2, name: 'Faults', parentLayerId: 1, subLayerIds: null, defaultVisibility: false },
            { id: 3, name: 'Bedrock geology', parentLayerId: 1, subLayerIds: null }
          ]
        })
      });
    }
    if (url.pathname.endsWith('/legend')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ layers: [] }) });
    }
    if (/\/MapServer\/\d+\/query$/.test(url.pathname)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          features: [{ attributes: { TEST_RESULT: `Query result for layer ${url.pathname.match(/\/MapServer\/(\d+)\/query$/)[1]}` } }]
        })
      });
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });
  await openUserLayerForm(
    page, 'https://services.example.test/arcgis/rest/services/Test/MapServer', 'Bedrock'
  );
  await page.getByRole('button', { name: 'Add layer' }).click();
  const rows = page.locator('#legend [data-order-key^="overlay:user-layer-"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Dykes' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Faults' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Bedrock geology' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mapviewer.user-layers.v1')));
  expect(saved.map(({ name, group, layers, visible, queryable }) =>
    ({ name, group, layers, visible, queryable }))).toEqual([
    { name: 'Dykes', group: 'Bedrock', layers: '0', visible: true, queryable: true },
    { name: 'Faults', group: 'Bedrock', layers: '2', visible: false, queryable: true },
    { name: 'Bedrock geology', group: 'Bedrock', layers: '3', visible: true, queryable: true }
  ]);

  const queryRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname.endsWith('/MapServer/0/query'));
  await page.locator('#map canvas').click({ position: { x: 400, y: 250 } });
  await queryRequest;
  await expect(page.locator('.idpop')).toContainText('Query result for layer 0');
});

test('adds a cached MapServer without sublayers as one layer', async ({ page }) => {
  await page.route('https://services.example.test/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/MapServer')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ mapName: 'Cached geology', tileInfo: { rows: 256, cols: 256 }, layers: [] })
      });
    }
    if (url.pathname.endsWith('/legend')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ layers: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });
  await openUserLayerForm(
    page, 'https://services.example.test/arcgis/rest/services/Cached/MapServer', 'Cached layers'
  );
  await page.getByRole('button', { name: 'Add layer' }).click();
  await expect(page.locator('#legend [data-order-key^="overlay:user-layer-"]').filter({ hasText: 'Cached geology' }))
    .toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mapviewer.user-layers.v1')));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    name: 'Cached geology',
    group: 'Cached layers',
    tiles: 'https://services.example.test/arcgis/rest/services/Cached/MapServer/tile/{z}/{y}/{x}'
  });
  expect(saved[0].queryable).toBeUndefined();
});
