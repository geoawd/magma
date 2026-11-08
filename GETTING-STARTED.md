# First-time setup

This guide explains how to configure a new copy of the map viewer and add common data types. The viewer is a static web application: there is no build step, and its map and data settings are JavaScript objects rather than a separate JSON manifest.

## 1. Run the application

Serve the repository over HTTP; do not open `index.html` using `file://`.

```sh
python3 serve.py --no-browser
```

Then open `http://localhost:8000`. The included server supports HTTP byte-range requests, which PMTiles and COGs need. Other hosts must also permit range requests where required and allow cross-origin requests (CORS) from the viewer's origin.

## 2. Populate the configuration

For the public profile, the main configuration file is [`config/config.js`](config/config.js). It is a JavaScript file that must assign an object to `window.CONFIG`; an empty file, an empty object, or a plain JSON file will not start the profile. Keep the outer object and add datasets, overlays, and themes inside it.

This is a minimal starting point:

```js
window.CONFIG = {
  title: 'My Map',
  center: [-6.5, 54.7], // [longitude, latitude]
  zoom: 7,
  styleUrl: 'config/style.json',
  datasets: [],
  basemaps: [],
  overlays: [],
  themes: []
};
```

The referenced style file must be a MapLibre style document. For a blank map with a background, `config/style.json` can start as:

```json
{
  "version": 8,
  "name": "My Map",
  "sources": {},
  "layers": [
    {
      "id": "background",
      "type": "background",
      "paint": { "background-color": "#f8f9fa" }
    }
  ]
}
```

`center` is longitude then latitude. `styleUrl` is the fallback style and is also used when no vector datasets are configured. Paths such as `data/my-file.geojson` are relative to the application root; full `https://` URLs work for remotely hosted files. Every remote service must be accessible to the browser, including its CORS and authentication requirements.

Add a theme when you want users to select a curated group of layers. For example:

```js
themes: [
  { name: 'My data', overlays: ['my-boundaries', 'my-raster'] }
],
defaultTheme: 0
```

Theme names and IDs are case-sensitive. A theme can select overlay IDs, PMTiles dataset IDs, vector layer names, or configured groups. Anything not selected is normally hidden in that theme. Read the examples below before replacing an existing configuration: the repository's `config/config.js` also contains extensive layer metadata, terrain, search, and notification settings.

## 3. Add vector data in PMTiles

Each PMTiles dataset has a unique `id`, a style JSON file, and an archive path. The style describes source-layer names and how to draw the vector features; the `pmtiles` setting supplies the archive URL at runtime.

Add an entry to `datasets` in `config/config.js`:

```js
datasets: [
  {
    id: 'geology',
    name: 'Geology',
    style: 'config/geology-style.json',
    pmtiles: 'data/geology.pmtiles'
  }
],
layerDefaults: {
  'bedrock': true
},
themes: [
  { name: 'Geology', datasets: ['geology'] }
],
defaultTheme: 0
```

Create `config/geology-style.json`:

```json
{
  "version": 8,
  "name": "Geology",
  "sources": {
    "geology": {
      "type": "vector",
      "url": "pmtiles://data/geology.pmtiles"
    }
  },
  "layers": [
    {
      "id": "bedrock-fill",
      "type": "fill",
      "source": "geology",
      "source-layer": "bedrock",
      "metadata": {
        "theme-layer": "bedrock",
        "legend-label": "Bedrock"
      },
      "paint": {
        "fill-color": "#d8b365",
        "fill-outline-color": "#6b5b3e"
      }
    }
  ],
  "metadata": {
    "legend-groups": [
      { "name": "Geology", "layers": ["bedrock"] }
    ]
  }
}
```

Replace `bedrock` with the actual source-layer name in your archive. The source name in the style (`geology`) must match the layer's `source`. When a dataset has a `pmtiles` path, the style loader rewrites vector source URLs to that archive. Use the same `theme-layer` key in `layerDefaults` and the style's legend metadata. A layer not set to `true` in `layerDefaults` starts hidden. PMTiles archives can be hosted remotely; the site must support byte-range requests and the archive host must allow browser access. If an archive is missing, the map controls still start, but that archive's features cannot be shown.

## 4. Add a GeoJSON overlay

GeoJSON overlays are appropriate for standalone point, line, and polygon files. Add an object to `overlays`:

```js
overlays: [
  {
    id: 'my-boundaries',
    name: 'Study area boundaries',
    group: 'Study areas',
    geojson: true,
    url: 'data/study-areas.geojson',
    projection: 'EPSG:4326',
    geometryType: 'Polygon',
    style: {
      color: '#253494',
      fill: '#2c7fb8',
      width: 1.5
    },
    opacity: 0.6,
    visible: false,
    attribution: 'Example data provider'
  }
],
themes: [
  { name: 'Study areas', overlays: ['my-boundaries'] }
]
```

GeoJSON coordinates normally use WGS 84 longitude/latitude (`EPSG:4326`). Set `projection` to the source CRS if the file uses another CRS. The file is fetched when the overlay becomes visible in the active theme, not just because it is listed in the configuration.

For data-driven symbology, `style.color` and `style.fill` accept MapLibre expressions. For example, color polygons by an attribute:

```js
style: {
  color: '#333333',
  fill: [
    'match', ['get', 'class'],
    'High', '#d73027',
    'Moderate', '#fee08b',
    '#91bfdb'
  ],
  width: 1
}
```

The final color is the fallback for unmatched values. Use `['step', ['to-number', ['get', 'value'], 0], ...]` for numeric ranges. Optional `legend: { title, entries: [{ label, color }, ...] }` supplies legend labels and swatches. The advanced layer controls also provide classification tools for loaded GeoJSON.

## 5. Add JSON-backed table and map data

Use a regular GeoJSON overlay for a GeoJSON feature collection. A **JSON theme** is a different feature for tabular JSON files: it can show multiple related tables and draw map features from a geometry field in its primary table.

Add a theme entry:

```js
themes: [
  {
    name: 'Monitoring sites',
    jsonTheme: 'monitoring-sites',
    jsonConfig: 'config/monitoring-sites.js'
  }
]
```

Create `config/monitoring-sites.js` as an ES module:

```js
export default {
  id: 'monitoring-sites',
  dataDirectory: 'data/monitoring-sites/',
  linkField: 'id',
  labelField: 'name',
  geometryField: 'geometry',
  geoJsonProjection: 'EPSG:4326',
  tabs: [
    {
      key: 'sites',
      label: 'Sites',
      file: 'sites.json',
      dataKey: 'sites',
      isPrimary: true
    },
    {
      key: 'samples',
      label: 'Samples',
      file: 'samples.json',
      dataKey: 'samples'
    }
  ]
};
```

The `id` must match the theme's `jsonTheme`. Each tab file must contain an array at its configured `dataKey`. For example, `data/monitoring-sites/sites.json` could contain:

```json
{
  "sites": [
    {
      "id": "S-001",
      "name": "Example site",
      "geometry": {
        "type": "Point",
        "coordinates": [-6.1, 54.6]
      }
    }
  ]
}
```

Declare exactly one primary tab. Its rows provide the map geometry, ID, and label; related tabs join to the primary rows using `linkField`. In this example, a row in `samples.json` needs the same `id` value to be associated with that site. The primary geometry can be GeoJSON geometry or WKT. Set `geoJsonProjection` for GeoJSON coordinates, or `projection` for WKT coordinates; projected coordinates are converted to WGS 84 for display. `geometryField`, `linkField`, and `labelField` must match the actual column names.

## 6. Add a Cloud Optimized GeoTIFF (COG)

Add a COG as an overlay. Supply a browser-accessible COG URL and an optional class legend:

```js
overlays: [
  {
    id: 'soil-ph',
    name: 'Soil pH',
    group: 'Soils',
    cog: 'https://data.example.org/soil-ph.tif',
    tileSize: 256,
    resampling: 'bilinear',
    legendunits: 'pH',
    opacity: 0.8,
    visible: false,
    classes: [
      { max: 5.5, label: 'Acidic' },
      { max: 7, label: 'Near neutral' },
      { max: 14, label: 'Alkaline' }
    ]
  }
],
themes: [
  { name: 'Soils', overlays: ['soil-ph'] }
]
```

Class `max` values must be finite and ascending. Each value is the inclusive upper bound for that class; values above the final break use the last class color. Without `classes`, single-band COGs use the configured/default ramp and can be styled with the advanced controls. Multiband COGs retain their native RGB rendering. Other optional COG settings include `minzoom`, `maxzoom`, `attribution`, `hillshade_option`, and `contour_option`.

COGs must be tiled Cloud Optimized GeoTIFFs. The server must support HTTP range requests and CORS; otherwise the browser cannot read the data correctly. The application encodes COG URLs once, so write spaces literally and do not pre-encode percent signs. For selectable terrain and hillshade models, configure `terrain.models` instead of adding them only as regular overlays; each model requires an `id`, `name`, and `cog` URL.

### Register an additional COG projection

The COG protocol reads the CRS embedded in the GeoTIFF. It recognizes common EPSG codes, including `EPSG:29902` and `EPSG:2157`. If the COG uses an EPSG code the protocol does not know, register that code with the protocol before the COG is opened. Add this near the top of `config/config.js`, after the protocol script has loaded:

```js
window.MaplibreCOGProtocol.registerProjection(
  27700,
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
  '+x_0=400000 +y_0=-100000 +ellps=airy +units=m +no_defs'
);

window.CONFIG = {
  // ...
};
```

Pass the integer EPSG code stored in the GeoTIFF (without the `EPSG:` prefix) and the authoritative PROJ definition for that CRS. Include any required datum transformation parameters or grids; the abbreviated British National Grid definition above illustrates the registration call, but may not be sufficiently accurate for every dataset. This registration is specific to the COG protocol; defining the same CRS with the global `proj4.defs()` alone does not register it for COG rendering. User-defined CRS GeoTIFFs without an EPSG code and rotated or sheared COGs are not supported by this renderer; assign a suitable EPSG CRS or reproject the file to a north-up EPSG-coded CRS such as EPSG:3857.

For GeoJSON or JSON-theme geometry in a custom CRS, register it separately with the global Proj4js instance before the map starts:

```js
proj4.defs('EPSG:12345', '+proj=... +datum=... +units=m +no_defs');
```

Then set the layer's `projection` (GeoJSON overlay or JSON theme WKT) to `'EPSG:12345'`. JSON theme configs can also provide `projectionDef` for a custom WKT projection definition.

## 7. Style layers

Vector style files use the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/). Each layer has a `type`, a source, and type-specific `paint` and `layout` properties. Common layer types are `fill` for polygons, `line` for lines, `circle` for point symbols, and `symbol` for text or icons. Use data-driven expressions such as `match`, `step`, and `interpolate` to style features from their properties or zoom level. The [MapLibre expressions guide](https://maplibre.org/maplibre-style-spec/expressions/) includes syntax and examples.

GeoJSON overlay `style` is a simpler configuration interface: use `color`, `fill`, `width`, `dasharray`, and `radius`, or use supported MapLibre expressions for colors and sizes. COG appearance is controlled with `classes`, the profile's `cogStyleDefaults`, and the advanced layer controls.

If you also work with OpenLayers, its [style API](https://openlayers.org/en/latest/apidoc/module-ol_style_Style-Style.html) and [vector layer examples](https://openlayers.org/en/latest/examples/vector-layer.html) are useful general references for vector styling concepts. OpenLayers style objects are not directly compatible with this MapLibre application; use the MapLibre style format and expressions above.

## 8. Check the configuration

1. Run the app over HTTP and open the browser developer console. Fix configuration errors, failed style requests, CORS errors, and incorrect data paths.
2. Confirm that each theme references existing IDs and that each PMTiles style's `source-layer` matches its archive.
3. Check remote COG and PMTiles hosting for byte-range support and cross-origin access.
4. Run `npm test` for configuration and runtime checks. If browser tests are set up, run `npx playwright install chromium` once and then `npm run test:e2e`.

When adding or changing configuration features in the application, update this guide and the relevant sections of [`design/application-design.md`](design/application-design.md) together.
