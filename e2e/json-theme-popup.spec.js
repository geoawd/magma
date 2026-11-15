import { expect, test } from '@playwright/test';

test('JSON theme popup renders linked rows and pages through ArcGIS results', async ({ page }) => {
  await page.goto('/js/json-theme-popup.js');
  const popup = await page.evaluate(async () => {
    const { createJsonThemePopupController } = await import('/js/json-theme-popup.js');
    let popupAddedToMap = false;
    class Popup {
      setLngLat() { return this; }
      setDOMContent() { return this; }
      addTo() { popupAddedToMap = true; return this; }
    }
    const config = {
      geometryDataset: false,
      tabs: [
        { key: 'primary', isPrimary: true },
        { key: 'tests', label: 'Tests', isPrimary: false }
      ],
      linkField: 'id',
      labelField: 'name',
      popupFields: [{ field: 'reading', label: 'Reading', suffix: 'm' }],
      hiddenColumns: []
    };
    const state = {
      visibleRows: {
        tests: [{ id: 'site-1', result: 'first' }, { id: 'site-1', result: 'second' }]
      }
    };
    const controller = createJsonThemePopupController({
      document,
      map: { getZoom: () => 10, flyTo() {} },
      maplibregl: { Popup },
      getConfig: () => config,
      getState: () => state,
      renderCell: (row, tabKey, field) => {
        const cell = document.createElement('td');
        cell.textContent = String(row[field]);
        return cell;
      }
    });
    const content = controller.showJsonThemePopup({
      features: [{ properties: { id: 'site-1', name: 'Site One', reading: 12 } }],
      lngLat: { lng: -6, lat: 54 }
    });
    const linked = content.querySelector('.idsec.linked');
    linked.querySelector('.nav:last-child').click();
    const linkedPage = linked.querySelector('.pophead span').textContent;
    const linkedValue = linked.querySelector('.idtab').textContent;

    controller.appendArcgisFeaturesToJsonThemePopup(content, [
      { sourceLayer: 'Reports', properties: { OBJECTID: 1, title: 'Report one' } },
      { sourceLayer: 'Reports', properties: { OBJECTID: 2, title: 'Report two' } }
    ]);
    const reports = [...content.querySelectorAll('.idsec')].find(section =>
      section.querySelector('.idname')?.textContent === 'Reports (2)');
    reports.querySelector('.nav:last-child').click();
    return {
      title: content.querySelector('.idtitle').textContent,
      reading: content.querySelector('.idsec:not(.linked) .idtab').textContent,
      linkedPage,
      linkedValue,
      reportPage: reports.querySelector('.pophead span').textContent,
      reportValue: reports.querySelector('.idtab').textContent,
      popupAddedToMap
    };
  });

  expect(popup).toEqual({
    title: 'Site One',
    reading: 'Reading12 m',
    linkedPage: '2 of 2',
    linkedValue: 'idsite-1resultsecond',
    reportPage: '2 of 2',
    reportValue: 'OBJECTID2titleReport two',
    popupAddedToMap: true
  });
});
