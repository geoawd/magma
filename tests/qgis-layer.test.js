import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeojsonQgisLayerDefinition, buildQgisLayerDefinition, QGIS_TURBO_COLORS } from '../js/qgis-layer.js';

test('QGIS layer definition embeds an escaped GDAL source and raster color style', () => {
  const qlr = buildQgisLayerDefinition({
    id: 'elevation & surface',
    name: 'Ardquin DSM',
    url: 'https://example.org/Ardquin%20DSM.tif?token=a&format=cog',
    opacity: 0.6,
    minimum: 0,
    maximum: 100,
    colorStops: [
      { value: 0, color: '#30123b', label: 'Low < 0' },
      { value: 100, color: '#7a0403', label: 'High' }
    ]
  });

  assert.match(qlr, /<!DOCTYPE qgis-layer-definition>/);
  assert.match(qlr, /<layer-tree-layer checked="Qt::Checked"[^>]*id="elevation_surface"[^>]*name="Ardquin DSM"/);
  assert.match(qlr, /<datasource>\/vsicurl\/https:\/\/example\.org\/Ardquin%20DSM\.tif\?token=a&amp;format=cog<\/datasource>/);
  assert.match(qlr, /<authid>EPSG:29902<\/authid>/);
  assert.match(qlr, /type="singlebandpseudocolor"/);
  assert.match(qlr, /classificationMax="100" classificationMin="0"/);
  assert.match(qlr, /color="#30123b" label="Low &lt; 0"/);
  assert.equal((qlr.match(/<rastershader>/g) || []).length, 1);
});

test('QGIS layer definition emits discrete class breaks and validates input', () => {
  const qlr = buildQgisLayerDefinition({
    id: 'soil',
    name: 'Soil',
    url: 'https://example.org/soil.tif',
    minimum: 0,
    maximum: 20,
    discrete: true,
    colorStops: [
      { value: 10, color: '#000000', label: 'First class' },
      { value: 20, color: '#ffffff', label: 'Second class' }
    ]
  });

  assert.match(qlr, /colorRampType="DISCRETE"/);
  assert.match(qlr, /classificationMode="1"/);
  assert.match(qlr, /label="First class" value="10"/);
  assert.throws(() => buildQgisLayerDefinition({
    id: 'invalid', name: 'Invalid', url: 'file:///tmp/raster.tif'
  }), /HTTP or HTTPS/);
  assert.throws(() => buildQgisLayerDefinition({
    id: 'invalid', name: 'Invalid', url: 'https://example.org/a.tif',
    minimum: 0, maximum: 10, colorStops: [{ value: 1, color: 'red' }]
  }), /increasing values and six-digit hex colors/);
});

test('QGIS export can fall back to a single-band gray renderer', () => {
  const qlr = buildQgisLayerDefinition({
    id: 'gray-raster',
    name: 'Gray raster',
    url: 'https://example.org/gray.tif',
    opacity: 0.8,
    minimum: -10,
    maximum: 30,
    colorStops: []
  });
  assert.match(qlr, /type="singlebandgray"/);
  assert.match(qlr, /grayBand="1"/);
  assert.match(qlr, /<algorithm>StretchToMinimumMaximum<\/algorithm>/);
});

test('QGIS Turbo fallback provides a ramp of control colors', () => {
  assert.ok(QGIS_TURBO_COLORS.length > 2);
  assert.equal(QGIS_TURBO_COLORS[0], '#30123b');
  assert.equal(QGIS_TURBO_COLORS.at(-1), '#7a0403');
});

test('GeoJSON QGIS layer definition exports an escaped OGR source and graduated ranges', () => {
  const qlr = buildGeojsonQgisLayerDefinition({
    id: 'waters',
    name: 'Tellus Waters',
    url: 'https://example.org/waters.geojson?format=a&token=b',
    opacity: 0.7,
    crsAuthId: 'EPSG:4326',
    geometryTypes: ['Point'],
    style: { color: ['step', ['to-number', ['get', 'CU'], 0], '#2b83ba', 1, '#d7191c'], width: 0.25 },
    categories: [
      { text: '< 1', color: '#2b83ba', lo: -Infinity, hi: 1, field: 'CU' },
      { text: '≥ 1', color: '#d7191c', lo: 1, hi: Infinity, field: 'CU' }
    ],
    minimum: 0,
    maximum: 3
  });

  assert.match(qlr, /providerKey="ogr"/);
  assert.match(qlr, /\/vsicurl\/https:\/\/example\.org\/waters\.geojson\?format=a&amp;token=b/);
  assert.match(qlr, /<provider>ogr<\/provider>/);
  assert.match(qlr, /<authid>EPSG:4326<\/authid>/);
  assert.match(qlr, /<wkt>GEOGCRS\["WGS 84"/);
  assert.match(qlr, /<proj4>\+proj=longlat \+datum=WGS84 \+no_defs<\/proj4>/);
  assert.match(qlr, /<srid>4326<\/srid>/);
  assert.match(qlr, /type="graduatedSymbol"/);
  assert.match(qlr, /attr="CU"/);
  assert.match(qlr, /label="&lt; 1"/);
  assert.match(qlr, /type="marker"/);
  assert.match(qlr, /value="43,131,186,255/);
  assert.match(qlr, /<layerOpacity>0\.7<\/layerOpacity>/);
});

test('GeoJSON QGIS layer definition exports categorized polygon styles and validates inputs', () => {
  const qlr = buildGeojsonQgisLayerDefinition({
    id: 'hydro',
    name: 'Hydro & aquifers',
    url: 'https://example.org/hydro.geojson',
    crsAuthId: 'EPSG:29902',
    geometryTypes: ['MultiPolygon'],
    style: { fill: ['match', ['get', 'Aquifer'], 'Dalradian', '#c3afd5', '#808080'], width: 0.25 },
    categories: [
      { text: 'Dalradian', color: '#c3afd5', labels: ['Dalradian'], field: 'Aquifer' },
      { text: 'Other', color: '#808080', other: true, field: 'Aquifer' }
    ]
  });

  assert.match(qlr, /name="Hydro &amp; aquifers"/);
  assert.match(qlr, /type="categorizedSymbol"/);
  assert.match(qlr, /attr="Aquifer"/);
  assert.match(qlr, /value="Dalradian" label="Dalradian"/);
  assert.match(qlr, /type="fill"/);
  assert.match(qlr, /<layer class="SimpleFill"/);
  assert.match(qlr, /<wkt>PROJCRS\["TM65 \/ Irish Grid"/);
  assert.match(qlr, /<authid>EPSG:29902<\/authid>/);
  assert.match(qlr, /<geographicflag>false<\/geographicflag>/);
  assert.throws(() => buildGeojsonQgisLayerDefinition({
    id: 'invalid', name: 'Invalid', url: 'file:///tmp/data.geojson'
  }), /HTTP or HTTPS GeoJSON URL/);
  assert.throws(() => buildGeojsonQgisLayerDefinition({
    id: 'invalid', name: 'Invalid', url: 'https://example.org/data.geojson',
    opacity: 2
  }), /opacity must be between 0 and 1/);
  assert.throws(() => buildGeojsonQgisLayerDefinition({
    id: 'invalid', name: 'Invalid', url: 'https://example.org/data.geojson',
    style: { color: 'red' }
  }), /six-digit hex colors/);
});
