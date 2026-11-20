///////////////////////////////////////////////////////////////////////////
// APPLICATION CONFIGURATION
///////////////////////////////////////////////////////////////////////////

window.CONFIG = {
  title: 'MAGMA - Mapping and Analysis of Geoscience Models and Archives',
  showZoom: true, // development helper: show the current zoom level beside the grid reference; set to false for production
  copytourlocation: true,
  // Optional 3Dconnexion SpaceMouse support (requires a WebHID-capable browser and a secure context).
  spaceMouse: {
    enabled: true,
    advancedModeOnly: true,
    panPixelsPerSecond: 500,
    zoomLevelsPerSecond: 0.5,
    rotationDegreesPerSecond: 60,
    reversePanX: false,
    reversePanY: true,
    reverseZoom: false,
    reversePitch: true,
    reverseRotation: false,
    translationX: 'panX',
    translationY: 'panY',
    translationZ: 'zoom',
    rotationX: 'pitch',
    rotationY: 'none',
    rotationZ: 'heading'
  },
  notifications: window.CONFIG_NOTIFICATIONS,
  cogProjections: [
    {
      code: 27700,
      definition: '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
        '+x_0=400000 +y_0=-100000 +ellps=airy +units=m +no_defs'
    }
  ],

///////////////////////////////////////////////////////////////////////////
//  Datasets - PMTILES
///////////////////////////////////////////////////////////////////////////
// Vector datasets: each has its own .pmtiles and style.json. Layers from all datasets share one legend.
//   id | style (complete MapLibre style) | pmtiles (overrides the style URL) | name (optional legend group)
// Themes can use `datasets: ['geol']` to switch on every layer from a dataset, and/or `
// layers: [...]` for individual layers.
// Remove `datasets` to use `styleUrl` alone.
///////////////////////////////////////////////////////////////////////////

  datasets: [
    {
      id: 'linear-pmtiles',
      style: 'config/linear-style.json',
      pmtiles: 'https://data.better-open-data.com/lidar_zstd/linear.pmtiles',
      name: 'Linear features'
    },
    {
      id: 'superficial-pmtiles',
      style: 'config/superficial-style.json',
      pmtiles: 'https://data.better-open-data.com/lidar_zstd/superficial.pmtiles',
      name: 'Superficial geology'
    },
    {
      id: 'bedrock-pmtiles',
      style: 'config/bedrock.json',
      pmtiles: 'https://data.better-open-data.com/lidar_zstd/bedrock.pmtiles',
      name: 'Bedrock geology'
    },
  ],
  
  styleUrl: 'config/style.json',

  // Applied to COGs without configured classes, including Tellus Magnetics.
  // Quantile mode exports a smooth ramp with this many stops; configured classes still take precedence.
  cogStyleDefaults: {
    ramp: 'CET rainbow4',
    mode: 'quantile',
    quantileStops: 256
  },

///////////////////////////////////////////////////////////////////////////
//  Query Layers 
//  null = auto-detect every layer on a vector source in your style; or list ids
///////////////////////////////////////////////////////////////////////////  
  queryLayers: null,          

///////////////////////////////////////////////////////////////////////////
//  Basemaps
///////////////////////////////////////////////////////////////////////////

  basemaps: [
    { id: 'osm', name: 'OpenStreetMap', tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxzoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', opacity: 1, visible: true },
    { id: 'Gray', name: 'World Light Gray Base', tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}.png',
      maxzoom: 19, attribution: '&copy; ESRI', opacity: 1, visible: false }
  ],

///////////////////////////////////////////////////////////////////////////
//  Project Extent
///////////////////////////////////////////////////////////////////////////

  bounds: [[-8.5, 53.5], [-5.0, 55.6]], // project extent: southwest and northeast [longitude, latitude]

///////////////////////////////////////////////////////////////////////////
//  Layer Visibility on startup
///////////////////////////////////////////////////////////////////////////
  
  layerDefaults: {
    'bedrock-pmtiles': false,
    'linear-pmtiles': false,
    'superficial-pmtiles': false
  },

///////////////////////////////////////////////////////////////////////////
//  Overlays XYZ / WMS etc
///////////////////////////////////////////////////////////////////////////
// WMS:  { id: 'w1', name: 'My WMS', url: 'https://example.org/wms', layers: 'geology_50k', version: '1.3.0' },
// XYZ:  { id: 'x1', name: 'My tiles', tiles: 'https://example.org/{z}/{x}/{y}.png', maxzoom: 18 },
// Optional on any overlay: group, opacity (0-1), visible (true/false), attribution, minzoom, maxzoom, WGS84 bounds [west, south, east, north],
//   legendUrl (image),
//   info (https link shown as an 'i' link in the layer's panel)
// For COGs, set resampling to 'nearest' or 'bilinear' (default: nearest for color rasters);
//   hillshade controls are hidden by default; set hillshade_option: true to show them and enable hillshade initially.
//   set contour_option: true to draw COG contours; configure contour_intervals: { minor, major } and
//   contour_colors: { minor, major }. Intervals use the COG's value units; defaults are 10 and 50.

// GeoJSON overlay (polygon fills, line strokes and point circles):
// {
//   id: 'g1', name: 'My boundary', group: 'Boundaries',
//   geojson: true, url: 'data/boundary.geojson',
//   projection: 'EPSG:29902', // source CRS; defaults to EPSG:4326
//   geometryType: 'Polygon', // optional hint for the legend before lazy-loaded data is available
//   style: {
//     color: '#d9480f',       // line/point outline and polygon outline color
//     width: 2,               // line width and point outline width
//     dasharray: [4, 2],      // optional dashed line
//     radius: 5,              // point radius; defaults to 5
//     fill: '#fdae61'         // polygon/point fill; defaults to color
//   },
//   styleUrl: 'config/hydrostyle.json', // optional JSON file with { style: {...}, legend: {...} }
//   opacity: 1,               // 0-1; defaults to 1
//   visible: false,           // defaults to hidden
//   minzoom: 10, maxzoom: 22, // display zoom range; does not defer the data request
//   attribution: '&copy; Data provider',
//   filterlegend: true, // only list attribute classes with features in the current view; defaults to false
//   legendUrl: 'https://example.org/legend.png', // optional legend image
//   info: 'https://example.org/about'             // optional info link
// }
// Attribute-driven color legends: style.color can use MapLibre `match` for explicit string/numeric classes,
// or `step` with numeric stops for ranges. GeoJSON class entries are listed and can be toggled individually.
///////////////////////////////////////////////////////////////////////////

  
overlays: window.CONFIG_OVERLAYS,
///////////////////////////////////////////////////////////////////////////
//  Groups
///////////////////////////////////////////////////////////////////////////
// Named collections of datasets, vector layers, overlays and other groups, for use in a theme's `groups: [...]`.
//   'Name': { datasets: [ids], layers: [source-layer names or theme-layer keys], overlays: [ids], groups: [other group names] }
///////////////////////////////////////////////////////////////////////////

  groups: {
    'A Test Group': { overlays: ['gsni_pseudogravity', 'Bedrock Aquifer'] },
  },


///////////////////////////////////////////////////////////////////////////
//  Linked JSON data
///////////////////////////////////////////////////////////////////////////
// Joins JSON files to a vector layer. Matching rows appear in the click popup and as extra tabs in the results table.
//   'Layer name': { field: attribute on the layer, links: [{ label, file, dataKey (array in the file; default first array), field (column in the file; default = layer field) }] }
///////////////////////////////////////////////////////////////////////////

  dataLinks: {
  },

///////////////////////////////////////////////////////////////////////////
//  Layer Metadata
///////////////////////////////////////////////////////////////////////////
// Layer information (the "i" button on a layer). Key = vector layer name as in the legend, or an overlay id.
//   { metadata: '<record url>' }  -> fetches the JSON record and shows `infoFields`; a link to the record page (without f=json) goes at the bottom.
//   { metadata, fields: [...] }   -> same, but with this layer's own fields / order.   Optional: linkText, page (override the link target).
//   'https://…'                   -> just an "About this layer" link inside the layer's panel.
// The metadata server must allow cross-origin (CORS) requests from the site hosting this page.
///////////////////////////////////////////////////////////////////////////

  layerInfo: {
    'Site Reports': { metadata: 'https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/2bd4d1e5-9401-4da9-9566-f481b84fa110?f=json' },
    'Boreholes': {metadata: 'https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/09757268-929d-4203-b1fc-56d9391e4688?f=json'} ,
    'Bedrock Aquifer Classification': {metadata: 'https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/eeee2244-953d-4b81-8124-9e1ce602bf2e?f=json'} ,

  },

  // Group-level information: key = group name exactly as shown in the legend (overlay `group`, or a vector legend group).
  // Same formats as layerInfo. Every layer in the group shows it unless the layer has its own entry in layerInfo (or `info`).
  groupInfo: {
    'Tellus Magnetics': { metadata: 'https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/43e0d940-c82e-40bb-abc0-a775158500b5?f=json' },
    'Geophysics - Magnetics': { metadata: 'https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/43e0d940-c82e-40bb-abc0-a775158500b5?f=json' },
    'Geophysics - Electromagnetics': { metadata: 'https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/43e0d940-c82e-40bb-abc0-a775158500b5?f=json' },
    'Geophysics - Radiometrics': { metadata: 'https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/43e0d940-c82e-40bb-abc0-a775158500b5?f=json' },
    'Tellus Soils': { metadata: 'https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/062d0e21-a0b2-41f4-a39f-56381c8db86c?f=json' },
    'Tellus Soils A Aqua Regia': { metadata: 'https://gsni-data.bgs.ac.uk/geonetwork/api/collections/main/items/062d0e21-a0b2-41f4-a39f-56381c8db86c?f=json' },
  
  },

  
  // What to show from the record, in this order. Each item:
  //   label  – heading shown above the value (leave out for none)
  //   path   – where the value is in the JSON, e.g. 'properties.title' or 'properties.contacts[0].emails[0].value'
  //   format – optional: 'title' | 'date' | 'daterange' | 'scale' | 'list' | 'lines' | 'email' | 'link',
  //            or a function (value, wholeRecord) => text.  Plain text is the default; web addresses become links.
  // Items with no value in the record are skipped. Delete, reorder or add lines freely.
  infoFields: [
    { path: 'properties.title', format: 'title' },
    { label: 'Description', path: 'properties.description' },
    { label: 'Data period', path: 'time.interval', format: 'daterange' },
    { label: 'Last updated', path: 'properties.updated', format: 'date' },
    { label: 'Scale', path: 'properties.gn-elastic-index-record.resolutionScaleDenominator[0]', format: 'scale' },
    { label: 'Keywords', path: 'properties.keywords', format: 'list' },
    { label: 'Licence', path: 'properties.gn-elastic-index-record.otherProperties.licenseObject', format: 'lines' },
    { label: 'Contact', path: 'properties.contacts[0].organization' },
    { label: 'Email', path: 'properties.contacts[0].emails[0].value', format: 'email' }
  ],
  // Vector style-layer keys to filter by classes present in the current view; omitted keys default to false.
  filterlegend: {
    'bedrock-pmtiles': true  // opt in to showing only classes present in the map view; omitted layers default to false
  },
  legendOther: false,         // true = also list the 'fallback' colour of a class-coloured layer as "Other"
  collapseLayers: false,      // true = start with each layer's classes collapsed
  search: { countrycodes: 'gb,ie', limit: 5 },   // place search (OpenStreetMap Nominatim); grid refs need no service

///////////////////////////////////////////////////////////////////////////
// Theme Configuration
///////////////////////////////////////////////////////////////////////////
// Themes: pick which layers are on. `layers` = source-layer names or style metadata keys,
// `groups` = style groups, overlay groups, or named themes; `datasets` = dataset ids,
// and `overlays` = overlay ids. Anything not listed is switched off. A theme with no keys shows everything.
// Groups may name a style group, configured overlay group, or named theme.
// Examples: ['Geotechnical'], ['Geology (10K) WMS'], or ['Geology WMS'].
// `showResults: true` opens the results table when the theme loads (default off; queries always open it).
///////////////////////////////////////////////////////////////////////////

    themes: [
      { name: 'Site Investigations',
      datasets: ['linear-pmtiles', 'superficial-pmtiles', 'bedrock-pmtiles', ],
        overlays: ['Geotechnical', 'esri_world_imagery', 'lot1_ortho_ni'] },
      { name: 'Geological Mapping',
      datasets: ['linear-pmtiles', 'superficial-pmtiles', 'bedrock-pmtiles', ], 
      overlays: ['10K_bedrock', '10K_superficial', '10K_linear', '10K_mass_movement', '10K_artificial','10K_landform', '250K_bedrock', '250K_superficial', '250K_linear','esri_world_imagery','lot1_ortho_ni'] },
      { name: 'Geophysics WMS', 
      overlays: ['Geophysics - Magnetics','Geophysics - Electromagnetics','Geophysics - Radiometrics', 'esri_world_imagery'] },
      { name: 'Tellus Geophysics', 
      overlays: ['Tellus Magnetics', 'Tellus Electromagnetics','Tellus Radiometrics','esri_world_imagery'] },
      { name: 'Tellus Geochemistry', 
      overlays: ['Tellus Waters','Tellus Soils','Tellus Soils A Aqua Regia','esri_world_imagery'] },
      { name: 'Hydrogeology', 
      overlays: ['Hydrogeology Reports','Groundwater Data Repository','Bedrock Aquifer Classification','Bedrock Aquifer', 'Groundwater Vulnerability', 'Superficial Aquifer', 'esri_world_imagery'] },
  ],


///////////////////////////////////////////////////////////////////////////
//  Default theme when the project loads
///////////////////////////////////////////////////////////////////////////
  defaultTheme: 0,

///////////////////////////////////////////////////////////////////////////
//  Set Visibility for pmtiles layers
///////////////////////////////////////////////////////////////////////////
  layerZooms: {},             // optional tile-zoom range per layer, e.g. { Boreholes: [10, 14] }

///////////////////////////////////////////////////////////////////////////
//  Terrain Models
///////////////////////////////////////////////////////////////////////////
// 3D view + hillshade from Cloud Optimised GeoTIFFs: one band of elevation (metres), EPSG:3857, tiled with overviews.
// Add models for a user-selectable list; each needs a unique id, display name and COG path.
// The page must be served over http(s) (not opened from disk). Remove `terrain` to switch the 3D button and hillshade off.
///////////////////////////////////////////////////////////////////////////

  terrain: {
    models: window.CONFIG_TERRAIN_MODELS,
    defaultModel: '10m',       // selected initially; defaults to the first model
    exaggeration: 1.0,         // vertical exaggeration in the 3D view
    pitch: 60,                 // tilt when 3D is switched on (0-80)
    tileSize: 256,             // the COG's internal tile size (256 or 512)
    hillshade: true,           // add a "Hillshade (DTM)" layer to the legend (id 'hillshade', usable in themes)
    hillshadeVisible: true,    // start with the hillshade switched on?
    hillshadeStrength: 0.6,    // 0-1, shading strength at 0% transparency
    hillshadeStyle: {
      method: 'combined', direction: 315, altitude: 45, anchor: 'map',
      shadowColor: '#000000', highlightColor: '#ffffff', accentColor: '#000000'
    },
    contours: {
      visible: false,
      opacity: 0.5,
      colors: { minor: '#808384', major: '#30383b' },
      thresholds: {
        11: [100, 500],
        12: [50, 500], 
        13: [10, 100], 
        14: [10, 100], 
        15: [10, 100], 
        16: [10, 100]
      }
    },
    allThemes: true            // hillshade + 3D tick boxes stay available in every theme (false = hillshade follows themes' `overlays`)
    // optional: hillshadeName, group, info (link or { metadata }), attribution
  },

///////////////////////////////////////////////////////////////////////////
//  Initial View and Zoom
///////////////////////////////////////////////////////////////////////////

  center: [-6.5, 54.6],       // [lon, lat]
  zoom: 8
};
