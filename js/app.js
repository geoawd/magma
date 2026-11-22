import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.13.0/dist/maplibre-gl.mjs';
import { cogClassColorLut } from './cog-classes.js';
import { registerCogProjections } from './cog-projections.js';
import {
  COG_DEFAULT_QUANTILE_STOPS,
  COG_RAMP_COLORS,
  cogQgisColorStops as buildCogQgisColorStops,
  cogQuantileBounds,
  cogQuantileRampColors,
  sampleCogValueRange
} from './cog-style.js';
import { cogResamplingUrl } from './cog-resampling.js';
import { geojsonFieldStats } from './geojson-classification.js';
import { buildGeojsonQgisLayerDefinition, buildQgisLayerDefinition, QGIS_TURBO_COLORS } from './qgis-layer.js';
import {
  isJsonThemeShareState,
  jsonThemeMapView,
  parseMapViewHash,
  sharedSessionMapView,
  sharedSessionSnapshot
} from './shared-links.js';
import { buildJsonFeatures, createJsonThemeState, filterJsonRows, hasJsonFilters, jsonGeometryCenter, jsonGeometryIntersectsBounds, loadJsonThemeConfig, loadJsonThemeData } from './json-theme-runtime.js';
import { createSpaceMouseController } from './spacemouse.js';
import { createArcgisQueryController } from './arcgis-query-controller.js';
import { createMapClickController } from './map-click-controller.js';
import { createBoxSelectionController } from './box-selection-controller.js';
import { createMapLayerVisibilityController } from './map-layer-visibility.js';
import { resolveThemeMembership } from './map-theme-controller.js';
import { createArcgisLegendController } from './arcgis-legend-controller.js';
import { createTerrainControlsController } from './terrain-controls.js';
import { createTerrainLegendRowController } from './terrain-legend-row.js';
import { createTerrainRuntimeController } from './terrain-runtime-controller.js';
import { terrainErrorToast } from './terrain-error-toast.js';
import { createCogContourSourceController } from './cog-contour-source.js';
import { createTerrainRangeValidator, normalizeTerrainModels } from './terrain-models.js';
import { createJsonThemePopupController } from './json-theme-popup.js';
import { createMapFeatureQueryController } from './map-feature-query.js';
import { createLocationSearchController } from './location-search-controller.js';
import { createDataSearchController } from './data-search-controller.js';
import { createNotificationController } from './notification-controller.js';
import { createGeojsonLegendController } from './geojson-legend-controller.js';
import { createOverlayDownloadController } from './overlay-download-controller.js';
import { createOverlayRowControlsController } from './overlay-row-controls.js';
import { createOverlayVisibilityController } from './overlay-visibility-controller.js';
import { createGeojsonStyleController } from './geojson-style-controller.js';
import { createGeojsonLayerController, hasRenderableGeojsonGeometry } from './geojson-layer-controller.js';
import { createLegendCategoryController } from './legend-category-controller.js';
import { createLegendInViewController } from './legend-in-view-controller.js';
import { createVectorLegendController } from './vector-legend-controller.js';
import { createOverlayLegendController } from './overlay-legend-controller.js';
import { createCogRampControlsController } from './cog-ramp-controls.js';
import { createCogOverlayLayerController } from './cog-overlay-layer-controller.js';
import { createTerraDrawController } from './terra-draw-controller.js';
import { escapeHtml, parseServiceUrl, safeExternalUrl } from './safe-content.js';
import { createWorkspaceStore } from './workspaces.js';
import { loadOptionalScript, loadOptionalStylesheet } from './optional-vendors.js';

window.maplibregl = maplibregl;
const CONFIG = window.CONFIG;
const USER_LAYERS_KEY = `mapviewer.user-layers${window.CONFIG_PROFILE === 'internal' ? '.internal' : ''}.v1`;
const XLSX_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const XLSX_INTEGRITY = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
async function ensureXlsx() {
  if (!window.XLSX) await loadOptionalScript(XLSX_SCRIPT, XLSX_INTEGRITY);
  if (!window.XLSX) throw new Error('The spreadsheet library did not initialize.');
  return window.XLSX;
}
function loadUserLayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(USER_LAYERS_KEY) || '[]');
    if (!Array.isArray(saved)) return;
    const ids = new Set((CONFIG.overlays || []).map(overlay => overlay.id));
    saved.forEach(layer => {
      if (!layer || layer.userAdded !== true || typeof layer.id !== 'string' || ids.has(layer.id) ||
          typeof layer.name !== 'string' || typeof layer.group !== 'string' ||
          layer.serviceType !== 'esri-rest') return;
      const restored = {
        id: layer.id, name: layer.name, group: layer.group, userAdded: true,
        serviceType: 'esri-rest', global: false,
        visible: typeof layer.visible === 'boolean' ? layer.visible : true
      };
      if (typeof layer.url !== 'string' && typeof layer.tiles !== 'string') return;
      try { httpServiceUrl(layer.url || layer.tiles.replace(/\{z\}|\{x\}|\{y\}/g, '0')); }
      catch (error) {
        console.warn(`Ignoring saved user layer "${layer.name}": ${error.message}`);
        return;
      }
      if (typeof layer.url === 'string') restored.url = layer.url;
      if (typeof layer.tiles === 'string') restored.tiles = layer.tiles;
      if (typeof layer.layers === 'string') {
        restored.layers = layer.layers;
        if (typeof layer.url === 'string') restored.queryable = true;
      }
      ids.add(restored.id);
      CONFIG.overlays ||= [];
      CONFIG.overlays.push(restored);
    });
  } catch (error) {
    console.warn('Saved user layers could not be read:', error);
  }
}
loadUserLayers();
const dataCatalogueLink = document.querySelector('#dataCatalogueLink');
if (dataCatalogueLink && window.CONFIG_PROFILE === 'internal') {
  dataCatalogueLink.href = 'data-catalogue.html?profile=internal';
}
proj4.defs('EPSG:29902',
  '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 ' +
  '+ellps=mod_airy +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs');
maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
let cogProtocolPromise = null;
let cogProtocolRegistered = false;
function registerCogProtocol() {
  if (cogProtocolRegistered) return;
  const cogProtocol = window.MaplibreCOGProtocol.cogProtocol;
  maplibregl.addProtocol('cog', async request => {
    const match = request.url.match(/#dem&reliefScale=([^&/]+)&reliefCenter=([^&/]+)(?:&resampling=(nearest|bilinear))?(?=\/\d+\/\d+\/\d+$)/);
    if (!match || request.type !== 'image') return cogProtocol(request);
    const scale = Number(match[1]), center = Number(match[2]);
    if (!Number.isFinite(scale) || scale < 1 || !Number.isFinite(center)) {
      throw new Error('Invalid COG hillshade relief scaling.');
    }
    const demFragment = `#dem${match[3] ? `&resampling=${match[3]}` : ''}`;
    const response = await cogProtocol({ ...request, url: request.url.replace(match[0], demFragment) });
    return { ...response, data: await scaleCogDemTile(response.data, scale, center) };
  });
  cogProtocolRegistered = true;
}
function ensureCogProtocol() {
  if (cogProtocolRegistered) return Promise.resolve(window.MaplibreCOGProtocol);
  if (!cogProtocolPromise) {
    cogProtocolPromise = (async () => {
      if (!window.MaplibreCOGProtocol) await loadOptionalScript('js/maplibre-cog-protocol.js');
      if (!window.MaplibreCOGProtocol?.cogProtocol) throw new Error('The COG protocol did not initialize.');
      registerCogProjections(window.MaplibreCOGProtocol, CONFIG.cogProjections);
      registerCogProtocol();
      return window.MaplibreCOGProtocol;
    })().catch(error => {
      cogProtocolPromise = null;
      throw error;
    });
  }
  return cogProtocolPromise;
}
const $ = id => document.getElementById(id);
const uiV2 = document.documentElement.dataset.ui === 'v2';
const sharedJsonHashState = decodeShareHash();
const sharedSnapshot = sharedSessionSnapshot(sharedJsonHashState);
const mapHashView = parseMapViewHash(location.hash);
const sharedMapView = mapHashView || jsonThemeMapView(sharedJsonHashState) || sharedSessionMapView(sharedJsonHashState);
const isSharedUrl = !!sharedMapView || isJsonThemeShareState(sharedJsonHashState) || !!sharedSnapshot;
const advancedModeBtn = $('advancedModeBtn');
advancedModeBtn.onclick = () => {
  const enabled = advancedModeBtn.getAttribute('aria-pressed') !== 'true';
  advancedModeBtn.setAttribute('aria-pressed', String(enabled));
  document.body.classList.toggle('advanced-mode', enabled);
  if (!enabled) notificationController.cancelPick();
  if (!enabled && boxMode) setBox(false);
  if (!enabled) {
    document.body.classList.remove('mobile-drawing-tools-open');
    $('mobileDrawingToolsBtn').setAttribute('aria-pressed', 'false');
  } else {
    ensureTerraDrawControl().catch(error => toast(`Could not load drawing tools: ${error.message}`));
  }
};
const map = new maplibregl.Map({
  container: 'map',
  style: window.MAP_STYLE || CONFIG.styleUrl,
  attributionControl: { compact: true, customAttribution: CONFIG.customAttribution },
  center: sharedMapView?.center || CONFIG.center,
  zoom: sharedMapView?.zoom ?? CONFIG.zoom,
  bearing: sharedMapView?.bearing || 0,
  pitch: sharedMapView?.pitch || 0,
  maxPitch: 80
});
const mapFeatureQueries = createMapFeatureQueryController({
  map,
  getConfig: () => CONFIG,
  notify: message => toast(message)
});
const {
  queryData,
  around,
  wholeMap,
  arcgisClickEnvelope,
  arcgisBoxPolygon,
  withLinked
} = mapFeatureQueries;
const terraDrawController = createTerraDrawController({
  map,
  window,
  loadStylesheet: loadOptionalStylesheet,
  loadScript: loadOptionalScript
});
function ensureTerraDrawControl() {
  return terraDrawController.ensureLoaded();
}
const arcgisQueryController = createArcgisQueryController({
  getOverlays: () => (CONFIG.overlays || []).filter(overlay =>
    overlay.queryable === true && !overlay.geojson && !overlay.cog &&
    map.getLayer(overlay.id) && map.getLayoutProperty(overlay.id, 'visibility') !== 'none'),
  notify: toast
});
createSpaceMouseController({
  map,
  button: $('spaceMouseBtn'),
  settingsButton: $('spaceMouseSettingsBtn'),
  hid: window.navigator?.hid,
  window,
  document,
  config: CONFIG.spaceMouse,
  is3d: () => terrainOn,
  notify: toast
});
const notificationController = createNotificationController({
  map,
  maplibregl,
  document,
  window,
  navigator,
  config: CONFIG,
  projectCoordinates: location => proj4('EPSG:4326', 'EPSG:29902', [location.lng, location.lat]),
  isBoxMode: () => boxMode,
  setBoxMode: on => setBox(on),
  toast
});
if (CONFIG.copytourlocation === true) map.addControl({
  onAdd() {
    const group = document.createElement('div');
    group.className = 'maplibregl-ctrl maplibregl-ctrl-group tour-copy-control advanced-only';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Copy tour stop';
    button.title = 'Copy the current map view as a tour stop';
    button.setAttribute('aria-label', button.title);
    button.onclick = async () => {
      const center = map.getCenter();
      const formatCoordinate = value => Number(value.toFixed(5));
      const formatCamera = value => Number(value.toFixed(2));
      const visibleOverlays = [];
      const hiddenOverlays = [];
      themeOverlays.forEach(id => {
        const checkbox = ctl.ov[id]?.el.querySelector('.grprow input[type="checkbox"]');
        if (checkbox?.checked) visibleOverlays.push(id);
        else if (checkbox) hiddenOverlays.push(id);
      });
      const snippet = [
        '      {',
        "        title: 'New tour stop',",
        "        description: 'Describe this stop.',",
        "        target: '#map',",
        `        theme: ${JSON.stringify(activeThemeName)},`,
        '        layers: {',
        `          overlays: ${JSON.stringify(visibleOverlays)},`,
        `          hideOverlays: ${JSON.stringify(hiddenOverlays)}`,
        '        },',
        `        center: [${formatCoordinate(center.lng)}, ${formatCoordinate(center.lat)}],`,
        `        zoom: ${formatCamera(map.getZoom())},`,
        `        bearing: ${formatCamera(map.getBearing())},`,
        `        pitch: ${formatCamera(map.getPitch())},`,
        `        terrain: ${terrainOn},`,
        '        duration: 1200',
        '      }'
      ].join('\n');
      try {
        await navigator.clipboard.writeText(snippet);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = snippet;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        let copied = false;
        try {
          textarea.focus();
          textarea.select();
          copied = document.execCommand('copy');
        } catch (error) {
          toast(`Could not copy tour stop: ${error.message}`);
          return;
        } finally {
          textarea.remove();
        }
        if (!copied) {
          toast('Could not copy tour stop. Check clipboard permissions and try again.');
          return;
        }
      }
      toast('Tour stop copied. Paste it into config/tours.js.');
    };
    group.appendChild(button);
    return group;
  },
  onRemove() {}
}, uiV2 ? 'bottom-right' : 'top-right');
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    notificationController.cancelPick();
    closeMobileMoreTools(true);
  }
});
document.querySelectorAll('#aboutPage .lgcollapse').forEach(b => b.onclick = () => {
  b.setAttribute('aria-expanded', String(!b.closest('.lgroup').classList.toggle('collapsed')));
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
const boundsValid = Array.isArray(CONFIG.bounds) && CONFIG.bounds.length === 2 && CONFIG.bounds.every(p =>
  Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) &&
  CONFIG.bounds[0][0] >= -180 && CONFIG.bounds[1][0] <= 180 &&
  CONFIG.bounds[0][1] >= -85.051129 && CONFIG.bounds[1][1] <= 85.051129 &&
  CONFIG.bounds[0][0] < CONFIG.bounds[1][0] && CONFIG.bounds[0][1] < CONFIG.bounds[1][1];
if (boundsValid) map.addControl({
  onAdd() {
    const group = document.createElement('div');
    group.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.className = 'maplibregl-ctrl-icon maplibregl-ctrl-zoomall';
    button.type = 'button'; button.title = 'Zoom to all extents'; button.setAttribute('aria-label', button.title);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M4 4l6 6M20 15v5h-5m5 0-6-6"/></svg>';
    button.onclick = () => {
      const sideEdge = uiV2 && !isMobile() ? Math.round($('side').getBoundingClientRect().right) : 0;
      map.fitBounds(CONFIG.bounds, { padding: { top: 40, right: 40, bottom: 40, left: 40 + sideEdge }, duration: 700 });
    };
    group.appendChild(button);
    return group;
  },
  onRemove() {}
}, 'top-right');
map.addControl(new maplibregl.ScaleControl());
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');
map.addControl({
  onAdd() {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl map-copy-link-control';
    container.appendChild($('shareMapBtn'));
    return container;
  },
  onRemove() { $('shareMapBtn').remove(); }
}, uiV2 ? 'bottom-right' : 'top-right');
new ResizeObserver(() => map.resize()).observe($('mapwrap'));   // keeps the map right when menu / results change
const panelSplitter = $('panelSplitter');
const resultsPanel = $('panel');
const mainView = $('main');
const MIN_PANEL_HEIGHT = 150;
const MIN_MAP_HEIGHT = 160;
function panelHeightLimits() {
  return { min: MIN_PANEL_HEIGHT, max: Math.max(MIN_PANEL_HEIGHT, mainView.clientHeight - MIN_MAP_HEIGHT - panelSplitter.offsetHeight) };
}
function setPanelHeight(height, userResized = false) {
  const limits = panelHeightLimits();
  const next = Math.max(limits.min, Math.min(limits.max, height));
  if (userResized) activeJsonThemeState.panelManuallySized = true;
  resultsPanel.style.height = `${next}px`;
  panelSplitter.setAttribute('aria-valuemin', String(limits.min));
  panelSplitter.setAttribute('aria-valuemax', String(Math.round(limits.max)));
  panelSplitter.setAttribute('aria-valuenow', String(Math.round(next)));
  map.resize();
}
panelSplitter.addEventListener('pointerdown', event => {
  if (!document.body.classList.contains('has-table')) return;
  event.preventDefault();
  const startY = event.clientY;
  const startHeight = resultsPanel.getBoundingClientRect().height;
  panelSplitter.setPointerCapture(event.pointerId);
  const move = moveEvent => setPanelHeight(startHeight + startY - moveEvent.clientY, true);
  const finish = () => {
    panelSplitter.removeEventListener('pointermove', move);
    panelSplitter.removeEventListener('pointerup', finish);
    panelSplitter.removeEventListener('pointercancel', finish);
  };
  panelSplitter.addEventListener('pointermove', move);
  panelSplitter.addEventListener('pointerup', finish);
  panelSplitter.addEventListener('pointercancel', finish);
});
panelSplitter.addEventListener('keydown', event => {
  const current = resultsPanel.getBoundingClientRect().height;
  if (event.key === 'ArrowUp') { event.preventDefault(); setPanelHeight(current + 24, true); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); setPanelHeight(current - 24, true); }
  else if (event.key === 'Home') { event.preventDefault(); setPanelHeight(MIN_PANEL_HEIGHT, true); }
  else if (event.key === 'End') { event.preventDefault(); setPanelHeight(panelHeightLimits().max, true); }
});

const esc = escapeHtml;
const safeCellUrl = value => typeof value === 'string' && /^https:/i.test(value.trim())
  ? safeExternalUrl(value.trim(), location.href) : null;
const cell = value => value === null || value === undefined ? '' :
  safeCellUrl(value) ? `<a href="${esc(safeCellUrl(value))}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>` : esc(value);

if (CONFIG.showZoom) {
  const zoomEl = $('zoomLevel');
  zoomEl.hidden = false;
  const showZoom = () => zoomEl.textContent = 'Zoom ' + map.getZoom().toFixed(1);
  map.on('zoom', showZoom);
  showZoom();
}
let cursorPosition = null;
let cursorCoordinateText = 'Move the cursor…';
let cogCursorRequestId = 0;
let cogCursorTimer = null;
function visibleSingleBandCogs() {
  return allOverlays().filter(overlay => {
    const state = overlay.cogState;
    if (!state?.valueReadoutAvailable) return false;
    return [overlay.id, ...state.colorLayerIds].some(id => {
      const visibility = layerVisibility.get(id);
      return map.getLayer(id) && visibility?.selected && visibility.inTheme && !visibility.groups.size;
    });
  });
}
function scheduleCogCursorValues(point) {
  const requestId = ++cogCursorRequestId;
  clearTimeout(cogCursorTimer);
  if (!point) return;
  $('cogValues').textContent = '';
  if (!visibleSingleBandCogs().length) return;
  cogCursorTimer = setTimeout(() => showCogCursorValues(point, requestId), 120);
}
async function showCogCursorValues(point, requestId) {
  const cogs = visibleSingleBandCogs();
  if (!cogs.length) return;
  const results = await Promise.all(cogs.map(async overlay => {
    try {
      const values = await window.MaplibreCOGProtocol.locationValues(overlay.cogState.url, point);
      if (!Array.isArray(values)) throw new Error('The COG returned no sample values.');
      const value = values.find(Number.isFinite);
      if (value === undefined) return `${overlay.name || overlay.id}: no data`;
      const units = typeof overlay.legendunits === 'string' && overlay.legendunits
        ? ` ${overlay.legendunits}` : '';
      return `${overlay.name || overlay.id}: ${cogValueLabel(value)}${units}`;
    } catch (error) {
      console.error(`Could not read ${overlay.name || overlay.id} COG value:`, error);
      return `${overlay.name || overlay.id}: unavailable`;
    }
  }));
  if (requestId !== cogCursorRequestId) return;
  $('cogValues').textContent = results.join('\n');
}
map.on('mousemove', e => {
  const [x, y] = proj4('EPSG:4326', 'EPSG:29902', [e.lngLat.lng, e.lngLat.lat]);
  cursorPosition = { longitude: e.lngLat.lng, latitude: e.lngLat.lat };
  cursorCoordinateText = `Irish Grid  E ${x.toFixed(0)}  N ${y.toFixed(0)}`;
  $('coords').textContent = cursorCoordinateText;
  scheduleCogCursorValues(cursorPosition);
});
map.on('mouseout', () => {
  cursorPosition = null;
  cogCursorRequestId++;
  clearTimeout(cogCursorTimer);
  $('cogValues').textContent = '';
});

// ---------- Menu ----------
let tool = null;
let updateSearchFields;
const isMobile = () => matchMedia('(max-width: 700px)').matches;
let thirdPartyNoticesRequest = null;
function loadThirdPartyNotices() {
  if (thirdPartyNoticesRequest) return thirdPartyNoticesRequest;
  const content = $('thirdPartyNotices');
  content.textContent = 'Loading notices...';
  thirdPartyNoticesRequest = fetch('notices.txt')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then(text => { content.textContent = text; })
    .catch(() => {
      content.textContent = 'Third-party notices could not be loaded.';
      thirdPartyNoticesRequest = null;
    });
  return thirdPartyNoticesRequest;
}
const RAIL_STATE_KEY = 'mapviewer.rail.v1';
const RAIL_TOOLS = ['legend', 'search', 'about'];
///////////////////////////////////////////////////////////////////////////
// Opens the selected side drawer tool and updates the active rail button.
///////////////////////////////////////////////////////////////////////////
function openTool(name) {
  tool = name === tool ? null : name;
  document.body.classList.toggle('drawer-open', !!tool);
  if (!tool) {
    $('drawer').style.removeProperty('--mobile-drawer-height');
    $('drawerDragHandle').setAttribute('aria-valuenow', '45');
  }
  document.querySelectorAll('#rail [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  $('legendPage').classList.toggle('active', tool === 'legend');
  $('searchPage').classList.toggle('active', tool === 'search');
  $('aboutPage').classList.toggle('active', tool === 'about');
  if (tool === 'about') loadThirdPartyNotices();
  if (tool === 'search') { updateSearchFields(); if (!isMobile()) $('searchText').focus(); }
  if (tool && boxMode) setBox(false);
  syncAddDataButton();
  if (uiV2 && !isMobile()) {
    try { localStorage.setItem(RAIL_STATE_KEY, tool || 'closed'); } catch { /* storage unavailable */ }
  }
}
const drawerDragHandle = $('drawerDragHandle');
let drawerDrag = null;
function setMobileDrawerHeight(height) {
  const maxHeight = window.innerHeight * 0.8;
  const clampedHeight = Math.max(0, Math.min(maxHeight, height));
  const heightPercent = clampedHeight / window.innerHeight * 100;
  $('drawer').style.setProperty('--mobile-drawer-height', `${heightPercent}dvh`);
  drawerDragHandle.setAttribute('aria-valuenow', String(Math.round(heightPercent)));
}
function finishMobileDrawerDrag() {
  if (!drawerDrag) return;
  const height = $('drawer').getBoundingClientRect().height;
  drawerDrag = null;
  $('drawer').style.removeProperty('transition');
  drawerDragHandle.classList.remove('dragging');
  if (height < window.innerHeight * 0.25) {
    $('drawer').style.removeProperty('--mobile-drawer-height');
    if (tool) openTool(tool);
  } else {
    setMobileDrawerHeight(height > window.innerHeight * 0.6 ? window.innerHeight * 0.8 : window.innerHeight * 0.45);
  }
}
drawerDragHandle.addEventListener('pointerdown', event => {
  if (!isMobile() || !tool) return;
  event.preventDefault();
  drawerDrag = { pointerId: event.pointerId, startY: event.clientY, startHeight: $('drawer').getBoundingClientRect().height };
  drawerDragHandle.classList.add('dragging');
  $('drawer').style.transition = 'none';
  drawerDragHandle.setPointerCapture(event.pointerId);
});
drawerDragHandle.addEventListener('pointermove', event => {
  if (!drawerDrag || event.pointerId !== drawerDrag.pointerId) return;
  setMobileDrawerHeight(drawerDrag.startHeight + drawerDrag.startY - event.clientY);
});
drawerDragHandle.addEventListener('pointerup', event => {
  if (drawerDrag?.pointerId === event.pointerId) finishMobileDrawerDrag();
});
drawerDragHandle.addEventListener('pointercancel', event => {
  if (drawerDrag?.pointerId === event.pointerId) finishMobileDrawerDrag();
});
drawerDragHandle.addEventListener('keydown', event => {
  if (!isMobile() || !tool) return;
  const height = $('drawer').getBoundingClientRect().height;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const nextHeight = height + (event.key === 'ArrowUp' ? 1 : -1) * window.innerHeight * 0.1;
    if (nextHeight < window.innerHeight * 0.25 && event.key === 'ArrowDown') openTool(tool);
    else setMobileDrawerHeight(nextHeight);
  } else if (event.key === 'Home') {
    event.preventDefault();
    setMobileDrawerHeight(window.innerHeight * 0.45);
  } else if (event.key === 'End') {
    event.preventDefault();
    setMobileDrawerHeight(window.innerHeight * 0.8);
  }
});
function syncAddDataButton() {
  const button = $('addDataBtn');
  if (!button) return;
  const active = tool === 'legend' && !$('addDataPanel').hidden;
  document.body.classList.toggle('add-data-open', active);
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
}
document.querySelectorAll('#rail [data-tool]').forEach(b => b.onclick = () => openTool(b.dataset.tool));
document.querySelectorAll('.dclose').forEach(b => b.onclick = () => openTool(tool));
$('moreToolsBtn').onclick = () => {
  const menu = $('mobileMoreToolsMenu');
  const opening = menu.hidden;
  menu.hidden = !opening;
  $('moreToolsBtn').setAttribute('aria-expanded', String(opening));
};
const closeMobileMoreTools = (restoreFocus = false) => {
  $('mobileMoreToolsMenu').hidden = true;
  $('moreToolsBtn').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('moreToolsBtn').focus();
};
$('mobileGlobeTool').onclick = () => { $('globeBtn').click(); closeMobileMoreTools(true); };
$('mobilePrintTool').onclick = () => { $('printBtn').click(); closeMobileMoreTools(true); };
$('mobileDrawingToolsBtn').onclick = () => {
  const opening = !document.body.classList.contains('mobile-drawing-tools-open');
  document.body.classList.toggle('mobile-drawing-tools-open', opening);
  $('mobileDrawingToolsBtn').setAttribute('aria-pressed', String(opening));
  if (opening) ensureTerraDrawControl().catch(error => toast(`Could not load drawing tools: ${error.message}`));
  closeMobileMoreTools(true);
};
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('#mobileMoreToolsMenu, #moreToolsBtn')) closeMobileMoreTools();
});

const fallbackTourSteps = [...$('tourSteps').content.querySelectorAll('li')].map(item => ({
  title: item.dataset.title,
  target: item.dataset.target,
  open: item.dataset.open,
  description: item.textContent.trim().replace(/\s+/g, ' ')
}));
const configuredTours = Array.isArray(window.TOURS) ? window.TOURS : [];
const requestedTourId = new URLSearchParams(location.search).get('tour');
const requestedTour = configuredTours.find(tour => tour.id === requestedTourId);
const tourSelect = $('tourSelect');
configuredTours.forEach(tour => {
  const option = document.createElement('option');
  option.value = tour.id;
  option.textContent = tour.name;
  tourSelect.appendChild(option);
});
$('interactiveTourControls').hidden = configuredTours.length === 0;
if (requestedTour) tourSelect.value = requestedTour.id;
let currentTourSteps = fallbackTourSteps;
let tourPopover = null;
let tourTarget = null;
let tourIndex = 0;
let tourPopup = null;
let tourPopoverDragged = false;
function closeTourPopup() {
  if (tourPopup) tourPopup.remove();
  tourPopup = null;
}
function applyTourStop(stop) {
  if (!stop || !map.loaded()) return;
  if (stop.theme && $('themeSel')) {
    const option = [...$('themeSel').options].find(item =>
      item.textContent === stop.theme || item.value === stop.theme);
    if (option) {
      $('themeSel').value = option.value;
      $('themeSel').dispatchEvent(new Event('change'));
    } else console.warn(`Tour theme "${stop.theme}" was not found.`);
  }
  const layers = stop.layers || {};
  if (Array.isArray(layers.show)) setVis(layers.show, true);
  if (Array.isArray(layers.hide)) setVis(layers.hide, false);
  if (Array.isArray(layers.overlays)) {
    layers.overlays.forEach(id => {
      if (ctl.ov[id]) ctl.ov[id].set(true);
      else console.warn(`Tour overlay "${id}" was not found.`);
    });
  }
  if (Array.isArray(layers.hideOverlays)) layers.hideOverlays.forEach(id => ctl.ov[id]?.set(false));
  const camera = {};
  if (typeof stop.terrain === 'boolean') {
    setTerrain3D(stop.terrain, true, false);
    if (!Number.isFinite(stop.pitch)) camera.pitch = stop.terrain ? (CONFIG.terrain?.pitch ?? 60) : 0;
    if (!Number.isFinite(stop.bearing)) camera.bearing = 0;
  }
  if (Array.isArray(stop.center) && stop.center.length === 2 && stop.center.every(Number.isFinite)) {
    camera.center = stop.center;
  }
  ['zoom', 'bearing', 'pitch'].forEach(key => {
    if (Number.isFinite(stop[key])) camera[key] = stop[key];
  });
  if (Object.keys(camera).length) {
    map.flyTo({ ...camera, duration: Number.isFinite(stop.duration) ? stop.duration : 900 });
  }
  closeTourPopup();
  if (stop.popup && typeof stop.popup === 'object') {
    tourPopup = new maplibregl.Popup({
      closeButton: true,
      maxWidth: stop.popup.maxWidth || '360px'
    }).setLngLat(stop.popup.lngLat || camera.center || map.getCenter().toArray())
      .setHTML(String(stop.popup.html || '')).addTo(map);
  }
}
function clampTourPopoverPosition(left, top) {
  const mapRect = $('map').getBoundingClientRect();
  const margin = 12;
  const minLeft = Math.max(margin, mapRect.left + margin);
  tourPopover.style.maxWidth = `${Math.max(1, Math.min(340, innerWidth - minLeft - margin))}px`;
  const { width, height } = tourPopover.getBoundingClientRect();
  return {
    left: Math.max(minLeft, Math.min(left, innerWidth - width - margin)),
    top: Math.max(margin, Math.min(top, innerHeight - height - margin))
  };
}
function positionTourPopover() {
  if (!tourPopover) return;
  if (tourPopoverDragged) {
    const position = clampTourPopoverPosition(
      parseFloat(tourPopover.style.left),
      parseFloat(tourPopover.style.top)
    );
    tourPopover.style.left = `${position.left}px`;
    tourPopover.style.top = `${position.top}px`;
    return;
  }
  const rect = tourTarget?.getBoundingClientRect();
  const popover = tourPopover.getBoundingClientRect();
  const margin = 12, gap = 12;
  let left = rect ? rect.right + gap : (innerWidth - popover.width) / 2;
  if (left + popover.width > innerWidth - margin && rect) left = rect.left - popover.width - gap;
  let top = rect ? rect.top : (innerHeight - popover.height) / 2;
  if (top + popover.height > innerHeight - margin) top = innerHeight - popover.height - margin;
  const position = clampTourPopoverPosition(left, top);
  tourPopover.style.left = `${position.left}px`;
  tourPopover.style.top = `${position.top}px`;
}
function renderTourStep() {
  if (!tourPopover) return;
  tourTarget?.classList.remove('tour-target');
  const step = currentTourSteps[tourIndex];
  applyTourStop(step);
  const matches = step.target ? [...document.querySelectorAll(step.target)] : [];
  let candidate = matches.find(element => element.getClientRects().length);
  if (step.open === 'transparency' && candidate) {
    if (candidate.getAttribute('aria-expanded') !== 'true') candidate.click();
    const panel = candidate.closest('.grprow')?.parentElement.querySelector(':scope > .lpanel:not(.infopanel)');
    const slider = panel?.querySelector('input[type="range"]');
    tourTarget = slider?.getClientRects().length ? slider : candidate;
  } else if (step.open === 'hillshade') {
    const method = matches[0];
    const panel = method?.closest('.lpanel');
    const trigger = panel?.parentElement?.querySelector('.grprow .tbtn[aria-label^="Transparency"]');
    if (trigger?.getAttribute('aria-expanded') !== 'true') trigger?.click();
    tourTarget = method?.getClientRects().length ? method : trigger;
  } else if (step.open === 'terrain') {
    const exaggeration = matches[0];
    const panel = exaggeration?.closest('.terrain-panel');
    const trigger = panel?.parentElement?.querySelector('.terrain-tools');
    if (trigger?.getAttribute('aria-expanded') !== 'true') trigger?.click();
    tourTarget = exaggeration?.getClientRects().length ? exaggeration : trigger;
  } else tourTarget = candidate || $('map');
  if (!tourTarget?.getClientRects().length) tourTarget = $('map');
  tourTarget?.classList.add('tour-target');
  tourTarget?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  tourPopover.querySelector('.tour-title').textContent = step.title;
  tourPopover.querySelector('.tour-count').textContent = `${tourIndex + 1} of ${currentTourSteps.length}`;
  tourPopover.querySelector('.tour-description').textContent = step.description;
  const previous = tourPopover.querySelector('.tour-previous');
  const next = tourPopover.querySelector('.tour-next');
  previous.disabled = tourIndex === 0;
  next.textContent = tourIndex === currentTourSteps.length - 1 ? 'Finish' : 'Next';
  positionTourPopover();
  setTimeout(positionTourPopover, 220);
}
function finishTour() {
  if (!tourPopover) return;
  const lastTarget = tourTarget;
  tourTarget?.classList.remove('tour-target');
  tourPopover.remove();
  tourPopover = null;
  tourTarget = null;
  tourPopoverDragged = false;
  closeTourPopup();
  window.removeEventListener('resize', positionTourPopover);
  document.removeEventListener('scroll', positionTourPopover, true);
  document.removeEventListener('keydown', handleTourKeydown);
  const focusTarget = lastTarget?.matches('button, input, select') ? lastTarget : $('#rail [data-tool="legend"]');
  focusTarget?.focus();
}
function handleTourKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); finishTour(); }
}
function startTour(tour = null) {
  openTool('legend');
  currentTourSteps = Array.isArray(tour?.stops) && tour.stops.length
    ? tour.stops.map(stop => ({ ...stop, description: String(stop.description || '') }))
    : fallbackTourSteps;
  tourIndex = 0;
  tourPopoverDragged = false;
  const panel = document.createElement('section');
  panel.id = 'tourPopover';
  panel.className = 'tour-popover';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'tourTitle');
  panel.setAttribute('aria-describedby', 'tourDescription');
  const header = document.createElement('header');
  header.title = 'Drag to move this tour panel';
  let drag = null;
  header.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return;
    drag.moved = true;
    tourPopoverDragged = true;
    const position = clampTourPopoverPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    event.preventDefault();
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
  };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);
  const title = document.createElement('strong');
  title.id = 'tourTitle';
  title.className = 'tour-title';
  const count = document.createElement('span');
  count.className = 'tour-count';
  header.append(title, count);
  const description = document.createElement('p');
  description.id = 'tourDescription';
  description.className = 'tour-description';
  const footer = document.createElement('footer');
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'tour-previous';
  previous.textContent = 'Previous';
  previous.onclick = () => { if (tourIndex > 0) { tourIndex--; renderTourStep(); } };
  const end = document.createElement('button');
  end.type = 'button';
  end.textContent = 'End tour';
  end.onclick = finishTour;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'primary tour-next';
  next.onclick = () => {
    if (tourIndex === currentTourSteps.length - 1) finishTour();
    else { tourIndex++; renderTourStep(); }
  };
  footer.append(previous, end, next);
  panel.append(header, description, footer);
  document.body.appendChild(panel);
  tourPopover = panel;
  window.addEventListener('resize', positionTourPopover);
  document.addEventListener('scroll', positionTourPopover, true);
  document.addEventListener('keydown', handleTourKeydown);
  renderTourStep();
  next.focus();
}
$('startTour').onclick = () => startTour();
$('startInteractiveTour').onclick = () => {
  const tour = configuredTours.find(item => item.id === tourSelect.value);
  if (tour) startTour(tour);
};
$('copyTourLink').onclick = async () => {
  const tour = configuredTours.find(item => item.id === tourSelect.value);
  if (!tour) return;
  const link = new URL(window.location.href);
  link.searchParams.set('tour', tour.id);
  link.hash = '';
  try {
    await navigator.clipboard.writeText(link.href);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = link.href;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    let copied = false;
    try {
      textarea.focus();
      textarea.select();
      copied = document.execCommand('copy');
    } catch (error) {
      toast(`Could not copy tour link: ${error.message}`);
      return;
    } finally {
      textarea.remove();
    }
    if (!copied) {
      toast('Could not copy tour link. Check clipboard permissions and try again.');
      return;
    }
  }
  toast(`Link copied for "${tour.name}".`);
};

const queryArcgisOverlays = arcgisQueryController.query;

// ---------- Click popup ----------
// CONFIG.dataLinks: { <vector layer>: { field, links: [{ label, file, dataKey?, field? }] } } joins JSON rows to clicked / selected features.
let boxMode = false, justBoxed = false;
map.on('mousemove', e => {
  if (!boxMode) map.getCanvas().style.cursor = queryData(around(e.point, 3)).length ? 'pointer' : '';
});

// ---------- Legend ----------
const OPS = { '<=': '≤', '>=': '≥', '<': '<', '>': '>', '==': '=', '!=': '≠' };
const fmtFilter = f => {
  if (!f) return null;
  if (OPS[f[0]] && Array.isArray(f[1]) && f[1][0] === 'get') return `${f[1][1]} ${OPS[f[0]]} ${f[2]}`;
  return JSON.stringify(f).slice(0, 40);
};
const col = (v, d = '#999') => (typeof v === 'string' ? v.replace(/["'<>;]/g, '') : d);
const layerVisibility = new Map();
const geojsonLoaders = new Map();
const geojsonStyleCache = new Map();
const geojsonAppliedStyles = new WeakMap();
let geojsonLoadingEnabled = false;
const layerVisibilityController = createMapLayerVisibilityController({
  map,
  state: layerVisibility,
  isGeojsonLoadingEnabled: () => geojsonLoadingEnabled,
  loadGeojsonData,
  updateScaleState,
  updateArcgisLegendInView: () => updateArcgisLegendInView(),
  initializeVisibleCogControls,
  getCursorPosition: () => cursorPosition,
  scheduleCogCursorValues,
  allOverlays,
  ensurePendingCogLayer
});
const {
  registerLayerVisibility,
  syncLayerVisibility,
  setVis,
  setThemeVisibility,
  setGroupVisibility
} = layerVisibilityController;
const GEOJSON_GEOMETRY_KINDS = {
  Point: 'point',
  MultiPoint: 'point',
  LineString: 'line',
  MultiLineString: 'line',
  Polygon: 'polygon',
  MultiPolygon: 'polygon'
};
function collectGeojsonGeometryTypes(geometry, types) {
  if (!geometry || typeof geometry !== 'object') return;
  if (geometry.type === 'GeometryCollection') {
    (geometry.geometries || []).forEach(child => collectGeojsonGeometryTypes(child, types));
  } else if (typeof geometry.type === 'string') {
    types.add(geometry.type);
  }
}
function geojsonGeometryTypes(data) {
  const types = new Set();
  (Array.isArray(data?.features) ? data.features : [])
    .forEach(feature => collectGeojsonGeometryTypes(feature?.geometry, types));
  return types;
}
function updateGeojsonLoadStatus(id) {
  const loader = geojsonLoaders.get(id);
  const status = loader?.statusElement;
  if (!loader) return;
  const message = loader.status === 'loading'
    ? 'Loading GeoJSON...'
    : loader.status === 'error'
      ? 'Could not load; toggle the layer off and on to retry.'
      : '';
  if (status) {
    status.textContent = message;
    status.hidden = !message;
  }
  if (loader.classifyButton) {
    loader.classifyButton.disabled = loader.status !== 'loaded';
    loader.classifyButton.title = loader.status === 'loaded'
      ? `Classify ${loader.config.name || loader.config.id}`
      : 'Enable this layer to load its attributes before classifying';
  }
}
async function loadGeojsonData(id) {
  const loader = geojsonLoaders.get(id);
  if (!loader || loader.status === 'loaded') return;
  if (loader.loadingPromise) return loader.loadingPromise;
  const w = loader.config;
  loader.status = 'loading';
  updateGeojsonLoadStatus(id);
  loader.loadingPromise = (async () => {
    try {
      await loadGeojsonStyle(w);
      const response = await fetch(w.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data.features)) {
        const featureCount = data.features.length;
        data.features = data.features.filter(feature => hasRenderableGeojsonGeometry(feature?.geometry));
        const skippedCount = featureCount - data.features.length;
        if (skippedCount) {
          const message = `Skipped ${skippedCount} feature${skippedCount === 1 ? '' : 's'} without coordinates in ${w.name || w.id}.`;
          console.warn(message);
          toast(message);
        }
      }
      const from = w.projection || 'EPSG:4326';
      if (from !== 'EPSG:4326') (data.features || []).forEach(f => {
        if (f.geometry?.coordinates) f.geometry.coordinates = reprojectCoords(f.geometry.coordinates, from);
      });
      const source = map.getSource(id);
      if (!source) throw new Error('GeoJSON map source is unavailable');
      source.setData(data);
      loader.geometryTypes = geojsonGeometryTypes(data);
      loader.data = data;
      loader.status = 'loaded';
      renderGeojsonLegend(w);
    } catch (error) {
      loader.status = 'error';
      toast(`Could not load ${w.name || w.id}: ${error.message}`);
    } finally {
      loader.loadingPromise = null;
      updateGeojsonLoadStatus(id);
    }
  })();
  return loader.loadingPromise;
}
function loadVisibleGeojsonLayers() {
  geojsonLoaders.forEach((loader, id) => {
    const state = layerVisibility.get(id);
    if (state?.selected && state.inTheme && !state.groups.size) loadGeojsonData(id);
  });
}
// ---- data-driven colours: a 'match' (or 'step') colour expression becomes one legend entry per class ----
const COLOR_PROP = { fill: 'fill-color', circle: 'circle-color', line: 'line-color' };
const isClear = c => /transparent|,\s*0\)$|^#[0-9a-f]{6}00$/i.test(c.trim());
const fieldOf = x => Array.isArray(x)
  ? x[0] === 'get' ? x[1] : ['coalesce', 'to-number', 'to-string', 'match', 'step'].includes(x[0]) ? fieldOf(x[1]) : null
  : null;
function colorClasses(l, includeOther = CONFIG.legendOther) {
  const e = (l.paint || {})[COLOR_PROP[l.type]];
  if (!Array.isArray(e)) return null;
  const legendEntries = l.metadata?.legend?.entries || [];
  const out = [];
  if (e[0] === 'match') {
    const input = e[1], all = [];
    for (let i = 2; i < e.length - 1; i += 2) {
      if (typeof e[i + 1] !== 'string') return null;
      const labels = Array.isArray(e[i]) ? e[i] : [e[i]];
      all.push(...labels);
      const legend = legendEntries[out.length];
      const text = legend?.color === e[i + 1] && typeof legend.label === 'string'
        ? legend.label : labels.join(', ');
      out.push({ text, color: e[i + 1], test: ['match', input, labels, true, false], labels, field: fieldOf(input) });
    }
    const fb = e[e.length - 1];
    const otherLegend = legendEntries[out.length];
    if (includeOther && typeof fb === 'string' && !isClear(fb)) out.push({
      text: otherLegend?.color === fb && typeof otherLegend.label === 'string' ? otherLegend.label : 'Other',
      color: fb,
      test: ['!', ['match', input, all, true, false]],
      other: true,
      all: new Set(all.map(String)),
      field: fieldOf(input)
    });
  } else if (e[0] === 'step') {
    const input = e[1], stops = [-Infinity], cols = [e[2]];
    for (let i = 3; i < e.length - 1; i += 2) { stops.push(e[i]); cols.push(e[i + 1]); }
    if (cols.some(c => typeof c !== 'string')) return null;
    const field = fieldOf(input);
    if (stops.length === 1) out.push({
      text: 'All values', color: cols[0], test: field ? ['has', field] : ['all'], field
    });
    else cols.forEach((color, i) => {
      const lo = stops[i], hi = i + 1 < stops.length ? stops[i + 1] : Infinity, conds = [];
      if (lo > -Infinity) conds.push(['>=', input, lo]);
      if (hi < Infinity) conds.push(['<', input, hi]);
      out.push({ text: lo === -Infinity ? `< ${hi}` : hi === Infinity ? `≥ ${lo}` : `${lo} – ${hi}`, color, test: ['all', ...conds], lo, hi, field });
    });
  }
  return out.length ? out : null;
}
const legendCategoryController = createLegendCategoryController({
  document,
  map,
  setLayerVisibility: setVis,
  updateScaleState: () => updateScaleState()
});
const {
  setClassFilters,
  applyEntry,
  createIsolationStatus: createCategoryIsolationStatus,
  createIsolationController: createCategoryIsolationController,
  createIsolationButton: categoryIsolationButton
} = legendCategoryController;

function swatch(l, dot, color) {   // `color` overrides the layer colour (used for data-driven classes)
  const p = l.paint || {};
  let inner;
  if (l.type === 'circle') {
    const d = Math.max(8, Math.min(16, (p['circle-radius'] || 5) * 2));
    inner = `<i style="width:${d}px;height:${d}px;border-radius:50%;background:${color ? col(color) : col(p['circle-color'])};border:1px solid ${col(p['circle-stroke-color'], '#000')}">${dot ? '<b></b>' : ''}</i>`;
  } else if (l.type === 'fill') {
    inner = `<i style="width:16px;height:12px;background:${color ? col(color) : col(p['fill-color'])};opacity:${typeof p['fill-opacity'] === 'number' ? p['fill-opacity'] : 1};border:1px solid ${col(p['fill-outline-color'], 'rgba(0,0,0,.4)')}"></i>`;
  } else {
    inner = `<i style="width:16px;height:0;border-top:${Math.max(2, p['line-width'] || 2)}px solid ${color ? col(color) : col(p['line-color'])}"></i>`;
  }
  return `<span class="sw">${inner}</span>`;
}

async function loadGeojsonStyle(w) {
  if (!w.styleUrl) return;
  if (w.geojson !== true) throw new Error(`Overlay "${w.name || w.id}" styleUrl requires a GeoJSON overlay.`);
  const url = new URL(w.styleUrl, document.baseURI).href;
  if (geojsonAppliedStyles.get(w) === url) return;
  if (!geojsonStyleCache.has(url)) {
    let pending;
    pending = fetch(url).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then(definition => {
      if (!definition || typeof definition !== 'object' || Array.isArray(definition) ||
          !definition.style || typeof definition.style !== 'object' || Array.isArray(definition.style)) {
        throw new Error('Style file must contain a style object.');
      }
      if (definition.legend !== undefined &&
          (!definition.legend || typeof definition.legend !== 'object' || Array.isArray(definition.legend))) {
        throw new Error('Style file contains an invalid legend object.');
      }
      return definition;
    }).catch(error => {
      if (geojsonStyleCache.get(url) === pending) geojsonStyleCache.delete(url);
      throw error;
    });
    geojsonStyleCache.set(url, pending);
  }
  const definition = await geojsonStyleCache.get(url);
  w.style = definition.style;
  if (definition.legend !== undefined) w.legend = definition.legend;
  const loader = geojsonLoaders.get(w.id);
  if (loader) loader.originalStyle = { ...w.style };
  geojsonStyleController.applyPaint(w);
  renderGeojsonLegend(w);
  geojsonAppliedStyles.set(w, url);
}

const isUrl = u => typeof u === 'string' && /^https?:\/\//i.test(u.trim());
const ICON_SLIDERS = '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';
const ICON_ZOOM = '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M4 4l6 6M20 15v5h-5m5 0-6-6"/></svg>';
const ICON_COLOR_RAMP = '<svg viewBox="0 0 24 24"><path d="M3 20h18M4 20V5M20 20V3"/><rect x="7" y="13" width="3" height="7" rx=".5" style="fill:#3288bd;stroke:none"/><rect x="12" y="9" width="3" height="11" rx=".5" style="fill:#66c2a5;stroke:none"/><rect x="17" y="5" width="2" height="15" rx=".5" style="fill:#d7191c;stroke:none"/></svg>';
const ICON_INFO = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
const ICON_EYE = '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A11 11 0 0112 5c7 0 11 7 11 7a15 15 0 01-4 4.8M6.2 6.2C2.9 8.1 1 12 1 12s4 7 11 7a10 10 0 004.1-.9"/></svg>';
const geojsonLegendController = createGeojsonLegendController({
  document,
  loaders: geojsonLoaders,
  geometryKinds: GEOJSON_GEOMETRY_KINDS,
  colorClasses,
  escapeHtml: esc,
  sanitizeColor: col,
  createCategoryIsolationStatus,
  createCategoryIsolationController,
  categoryIsolationButton,
  applyEntry
});
const {
  categories: geojsonLegendCategories,
  render: renderGeojsonLegend,
  inViewGroups: geojsonInViewGroups
} = geojsonLegendController;
// Small per-layer panel: transparency slider + optional info link. Returns { btn, panel }.
const ICON_EXT = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

// ---- metadata ("i") panel: fetches a JSON record and shows the fields listed in CONFIG.infoFields ----
const getPath = (o, p) => String(p).match(/[^.\[\]]+/g).reduce((x, k) => (x == null ? undefined : x[k]), o);
const toStrings = v => v == null ? [] : Array.isArray(v) ? v.flatMap(toStrings)
  : typeof v === 'object' ? ('default' in v ? toStrings(v.default) : []) : [String(v)];
const fmtDate = t => { const d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const linkify = t => esc(t).replace(/https?:\/\/[^\s<]+/g, m => {
  const tail = (m.match(/[.,;:)]+$/) || [''])[0], u = m.slice(0, m.length - tail.length);
  return `<a href="${u}" target="_blank" rel="noopener">${u}</a>${tail}`;
});
function infoValue(v, format, data) {
  if (typeof format === 'function') { const r = format(v, data); return r ? linkify(String(r)) : ''; }
  const a = toStrings(v).map(x => x.trim()).filter(Boolean);
  if (!a.length) return '';
  switch (format) {
    case 'date': return esc(fmtDate(a[0]));
    case 'daterange': return esc(a.map(x => x === '..' ? 'present' : fmtDate(x)).join(' – '));
    case 'scale': return esc('1:' + Number(a[0]).toLocaleString('en-GB'));
    case 'email': return `<a href="mailto:${esc(a[0])}">${esc(a[0])}</a>`;
    case 'link': return isUrl(a[0]) ? `<a href="${esc(a[0])}" target="_blank" rel="noopener">${esc(a[0])}</a>` : esc(a[0]);
    case 'list': return esc(a.join(', '));
    case 'lines': return a.map(linkify).join('<br>');
    default: return a.map(linkify).join(', ');
  }
}
function metaUrls(m) {
  const page = new URL(m.metadata, location.href), json = new URL(page);
  json.searchParams.set('f', 'json');
  page.searchParams.delete('f');
  return { json: json.href, page: m.page || page.href };
}
const metaCache = {};
const fetchMeta = url => metaCache[url] ||= fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .catch(e => { delete metaCache[url]; throw e; });
function renderInfo(data, meta) {
  let h = '';
  (meta.fields || CONFIG.infoFields || []).forEach(f => {
    const v = infoValue(getPath(data, f.path), f.format, data);
    if (!v) return;
    h += f.format === 'title' ? `<div class="ititle">${v}</div>`
      : `<div class="irow">${f.label ? `<div class="ilabel">${esc(f.label)}</div>` : ''}<div>${v}</div></div>`;
  });
  return h || '<span class="hint">No information found in the record.</span>';
}
function infoTool(meta) {
  const btn = document.createElement('button');
  btn.className = 'tbtn'; btn.innerHTML = ICON_INFO; btn.title = 'Layer information';
  btn.setAttribute('aria-label', 'Layer information'); btn.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = 'lpanel infopanel'; panel.hidden = true;
  const urls = isUrl(meta.metadata) ? metaUrls(meta) : null;
  const foot = urls ? `<div class="ifoot"><a href="${esc(urls.page)}" target="_blank" rel="noopener">${ICON_EXT}${esc(meta.linkText || 'View full metadata record')}</a></div>` : '';
  let state = 0;   // 0 = not loaded, 1 = loading, 2 = done
  btn.onclick = async () => {
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
    if (panel.hidden) return;
    const c = btn.closest('.lcollapsed');   // opening the info also expands a collapsed layer
    if (c) { c.classList.remove('lcollapsed'); const cb = c.querySelector('.cbtn'); if (cb) cb.setAttribute('aria-expanded', 'true'); }
    if (state === 0) {
      state = 1;
      if (!urls) {
        panel.innerHTML = `<div class="irow">${linkify(meta.metadata).replace(/\r?\n/g, '<br>')}</div>`;
        state = 2;
      } else {
        panel.innerHTML = '<span class="hint">Loading…</span>' + foot;
        try { panel.innerHTML = renderInfo(await fetchMeta(urls.json), meta) + foot; state = 2; }
        catch (e) { state = 0; panel.innerHTML = '<span class="hint">The information could not be loaded here. Use the link to view the record.</span>' + foot; }
      }
    }
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  return { btn, panel };
}

// Layer's own info wins, then the id's entry in CONFIG.layerInfo, then its group's entry in CONFIG.groupInfo.
const infoFor = (id, group, own) => own ?? (CONFIG.layerInfo || {})[id] ?? (CONFIG.groupInfo || {})[group];
// Small per-layer panel: transparency slider (+ optional plain info link). Returns { btn, panel, infoBtn, infoPanel }.
function layerTools(transp, info, onChange, extraHtml = '') {
  const meta = info && typeof info === 'object' && info.metadata ? info : null;
  const link = typeof info === 'string' ? info : meta && meta.link;
  const btn = document.createElement('button');
  btn.className = 'tbtn'; btn.innerHTML = ICON_SLIDERS;
  btn.title = 'Transparency' + (isUrl(link) ? ' and information' : '');
  btn.setAttribute('aria-label', btn.title); btn.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = 'lpanel'; panel.hidden = true;
  panel.innerHTML = `<label class="trow">Transparency <input type="range" min="0" max="100" value="${transp}"><span class="tval">${transp}%</span></label>` +
    extraHtml +
    (isUrl(link) ? `<a href="${esc(link.trim())}" target="_blank" rel="noopener">${ICON_INFO}About this layer</a>` : '');
  const rng = panel.querySelector('input'), val = panel.querySelector('.tval');
  rng.oninput = () => { val.textContent = rng.value + '%'; onChange(Number(rng.value)); };
  btn.onclick = () => { panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); };
  const it = meta ? infoTool(meta) : {};
  return { btn, panel, infoBtn: it.btn, infoPanel: it.panel };
}
// Vector layers: scale each style layer's opacity properties (keeps any data-driven expression)
const OPACITY_PROPS = { fill: ['fill-opacity'], circle: ['circle-opacity', 'circle-stroke-opacity'], line: ['line-opacity'] };
const origOpacity = {};
function setTransparency(sl, pct) {
  const f = 1 - pct / 100;
  map.getStyle().layers.filter(l => styleLayerKey(l) === sl).forEach(l => (OPACITY_PROPS[l.type] || []).forEach(prop => {
    const k = l.id + '|' + prop;
    if (!(k in origOpacity)) { const o = map.getPaintProperty(l.id, prop); origOpacity[k] = o == null ? 1 : o; }
    const o = origOpacity[k];
    map.setPaintProperty(l.id, prop, f === 1 ? o : typeof o === 'number' ? o * f : ['*', f, o]);
  }));
}
const ICON_CHEV = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5.9L5 6m4 4v6m6-6v6"/></svg>';
function collapser(target, startCollapsed) {   // chevron that collapses a layer's classes / panel
  const b = document.createElement('button');
  b.className = 'cbtn'; b.innerHTML = ICON_CHEV; b.title = 'Collapse or expand';
  b.setAttribute('aria-label', 'Collapse or expand layer');
  const set = c => { target.classList.toggle('lcollapsed', c); b.setAttribute('aria-expanded', String(!c)); };
  b.onclick = () => set(!target.classList.contains('lcollapsed'));
  set(!!startCollapsed);
  return b;
}
const ctl = { data: {}, ov: {} };   // switches used by themes
let groupSequence = 0;
function addGroup(parent, name) {
  const sec = document.createElement('section');
  sec.className = 'lgroup';
  sec.dataset.orderKey = `group:${name}`;
  sec.dataset.groupName = name;
  sec.innerHTML = `<h3 class="lghead"><button class="lgcollapse" type="button" aria-expanded="true"><span>${esc(name)}</span></button>` +
    `<button class="lremove" type="button" hidden title="Remove manually added layers from ${esc(name)}" aria-label="Remove manually added layers from ${esc(name)}">${ICON_TRASH}</button>` +
    `<button class="lgexpand" type="button" aria-expanded="true" title="Collapse or expand ${esc(name)}" aria-label="Collapse or expand ${esc(name)}"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>` +
    `<button class="lgeye" type="button" aria-pressed="false" title="Hide ${esc(name)}" aria-label="Hide ${esc(name)}">${ICON_EYE}</button></h4>` +
    '<div class="lgbody"></div>';
  const group = { key: `legend-group-${++groupSequence}`, body: sec.querySelector('.lgbody'), layerIds: new Set(), onVisibilityChange: null };
  const collapse = sec.querySelector('.lgcollapse');
  const remove = sec.querySelector('.lremove');
  const expand = sec.querySelector('.lgexpand');
  const eye = sec.querySelector('.lgeye');
  const head = sec.querySelector('.lghead');
  head.draggable = true;
  head.title = 'Drag to reorder group';
  const toggleCollapsed = () => {
    const collapsed = sec.classList.toggle('collapsed');
    [collapse, expand].forEach(button => button.setAttribute('aria-expanded', String(!collapsed)));
  };
  collapse.onclick = toggleCollapsed;
  expand.onclick = toggleCollapsed;
  let visible = true;
  group.setVisibility = on => {
    visible = on;
    eye.innerHTML = visible ? ICON_EYE : ICON_EYE_OFF;
    const label = `${visible ? 'Hide' : 'Show'} ${name}`;
    eye.title = label;
    eye.setAttribute('aria-label', label);
    eye.setAttribute('aria-pressed', String(!visible));
    sec.classList.toggle('group-hidden', !visible);
    setGroupVisibility([...group.layerIds], group.key, visible);
    if (group.onVisibilityChange) group.onVisibilityChange(visible);
  };
  remove.onclick = event => { event.stopPropagation(); removeManualGroupAdditions(sec); };
  eye.onclick = () => group.setVisibility(!visible);
  parent.appendChild(sec);
  return group;
}
function enableLegendReordering() {
  const root = $('legend');
  let dragged = null;
  let dragHandle = null;
  let moved = false;
  root.addEventListener('pointerdown', event => {
    const groupName = event.target.closest('.lgcollapse span');
    const groupHead = groupName?.closest('.lghead');
    if (groupHead?.parentElement?.parentElement === root) {
      dragHandle = { type: 'group', element: groupHead.parentElement };
      return;
    }
    const item = event.target.closest('.lgbody > [data-order-key]');
    const layerName = event.target.closest('.lname span');
    dragHandle = item && layerName && item.contains(layerName) ? { type: 'item', element: item } : null;
  });
  root.addEventListener('pointerup', () => { dragHandle = null; });
  root.addEventListener('pointercancel', () => { dragHandle = null; });
  root.addEventListener('dragstart', event => {
    if (!dragHandle || !dragHandle.element.contains(event.target)) {
      event.preventDefault();
      dragHandle = null;
      return;
    }
    dragged = dragHandle;
    dragHandle = null;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged.element.dataset.orderKey);
    dragged.element.classList.add('dragging');
    moved = false;
  });
  root.addEventListener('dragover', event => {
    if (!dragged) return;
    root.querySelectorAll('.drop-before, .drop-after').forEach(element => element.classList.remove('drop-before', 'drop-after'));
    const group = event.target.closest('.lgroup');
    if (dragged.type === 'group' && group?.parentElement === root && group !== dragged.element) {
      event.preventDefault();
      const after = event.clientY > group.getBoundingClientRect().top + group.offsetHeight / 2;
      group.classList.add(after ? 'drop-after' : 'drop-before');
      const anchor = after ? group.nextSibling : group;
      if (anchor !== dragged.element) { root.insertBefore(dragged.element, anchor); moved = true; }
      return;
    }
    const target = event.target.closest('.lgbody > [data-order-key]');
    if (dragged.type !== 'item' || !target || target === dragged.element || target.parentElement !== dragged.element.parentElement) return;
    event.preventDefault();
    const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    target.classList.add(after ? 'drop-after' : 'drop-before');
    const anchor = after ? target.nextSibling : target;
    if (anchor !== dragged.element) { target.parentElement.insertBefore(dragged.element, anchor); moved = true; }
  });
  root.addEventListener('dragend', () => {
    root.querySelectorAll('.dragging, .drop-before, .drop-after').forEach(element => element.classList.remove('dragging', 'drop-before', 'drop-after'));
    if (moved) {
      syncMapLayerOrder();
      scheduleSessionSave();
    }
    dragged = null;
    dragHandle = null;
    moved = false;
  });
}
function syncMapLayerOrder() {
  const groups = [...$('legend').children].filter(group => group.matches('.lgroup'));
  const blocks = groups.reverse().flatMap(group => [...group.querySelector('.lgbody').children].reverse().flatMap(item => {
    const key = item.dataset.orderKey || '';
    if (key.startsWith('layer:')) {
      const themeLayer = item.dataset.sl;
      return map.getStyle().layers.filter(layer => styleLayerKey(layer) === themeLayer).map(layer => layer.id);
    }
    const id = key.replace(/^(overlay|basemap):/, '');
    const overlay = allOverlays().find(entry => entry.id === id);
    return (overlay?.layerIds || [id]).filter(layerId => map.getLayer(layerId));
  }));
  const layers = [...new Set(blocks.filter(id => map.getLayer(id)))];
  let beforeId;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    map.moveLayer(layers[index], beforeId);
    beforeId = layers[index];
  }
  map.getStyle().layers
    .filter(layer => layer.id.startsWith('json-'))
    .forEach(layer => map.moveLayer(layer.id));
}
let themeLayers = null;   // null = every layer; otherwise the layer names allowed by the active theme
let themeBaseLayers = [];
let activeThemeName = null;
let activeThemeAll = false;
let themeOverlays = [];
let themeBaseOverlays = [];
const themeOverlayVisibility = new Map();
function captureThemeOverlayVisibility(name = activeThemeName) {
  if (!name) return;
  const visibility = new Map();
  themeOverlays.forEach(id => {
    const checkbox = ctl.ov[id]?.el.querySelector('.grprow input[type="checkbox"]');
    if (checkbox) visibility.set(id, checkbox.checked);
  });
  themeOverlayVisibility.set(name, visibility);
}
const profileStorageSuffix = window.CONFIG_PROFILE === 'internal' ? '.internal' : '';
const THEME_ADDITIONS_KEY = `mapviewer.theme-additions${profileStorageSuffix}.v1`;
const SESSION_STATE_KEY = `mapviewer.session${profileStorageSuffix}.v1`;
const WORKSPACE_STORE = createWorkspaceStore(localStorage, `mapviewer.workspaces${profileStorageSuffix}.v1`);
const SESSION_STATE_VERSION = 1;
let startupSessionSnapshot = null;
let sessionPersistenceReady = false;
let sessionSaveTimer = null;
let sessionSaveFailed = false;
const themeAdditions = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_ADDITIONS_KEY) || '{}');
    return new Map(Object.entries(saved).map(([name, additions]) => [name, {
      layers: new Set(Array.isArray(additions.layers) ? additions.layers.filter(value => typeof value === 'string') : []),
      overlays: new Set(Array.isArray(additions.overlays) ? additions.overlays.filter(value => typeof value === 'string') : []),
      overlayGroups: new Set(Array.isArray(additions.overlayGroups) ? additions.overlayGroups.filter(value => typeof value === 'string') : [])
    }]));
  } catch { return new Map(); }
})();
function saveThemeAdditions() {
  try {
    localStorage.setItem(THEME_ADDITIONS_KEY, JSON.stringify(Object.fromEntries(
      [...themeAdditions].map(([name, additions]) => [name, {
        layers: [...additions.layers],
        overlays: [...additions.overlays],
        overlayGroups: [...additions.overlayGroups]
      }])
    )));
    scheduleSessionSave();
  } catch { toast('Theme additions could not be saved in this browser.'); }
}
function addedRasterOverlaysToDisable(additions, overlayConfigs) {
  const groupName = overlay => overlay.group || 'Overlays';
  const groups = new Set(additions.overlayGroups);
  const rasterOverlaysByGroup = new Map();
  overlayConfigs.filter(overlay => !overlay.geojson).forEach(overlay => {
    const name = groupName(overlay);
    if (!rasterOverlaysByGroup.has(name)) rasterOverlaysByGroup.set(name, []);
    rasterOverlaysByGroup.get(name).push(overlay);
  });
  rasterOverlaysByGroup.forEach((overlays, name) => {
    if (overlays.length > 1 && overlays.every(overlay => additions.overlays.has(overlay.id))) groups.add(name);
  });
  const disabled = new Set();
  groups.forEach(name => {
    const overlays = rasterOverlaysByGroup.get(name) || [];
    const firstOverlayId = overlays[0]?.id;
    overlays.slice(1).filter(overlay => additions.overlays.has(overlay.id))
      .forEach(overlay => disabled.add(overlay.id));
    if (firstOverlayId) disabled.delete(firstOverlayId);
  });
  return disabled;
}
function readSessionSnapshot() {
  let raw;
  try { raw = localStorage.getItem(SESSION_STATE_KEY); }
  catch (error) {
    console.warn('Saved map session could not be read:', error);
    return null;
  }
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw);
    const center = snapshot?.view?.center;
    if (snapshot?.version !== SESSION_STATE_VERSION
      || !Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)
      || !Number.isFinite(snapshot.view.zoom)) {
      console.warn('Ignoring an incompatible saved map session.');
      return null;
    }
    return snapshot;
  } catch (error) {
    console.warn('Ignoring an unreadable saved map session:', error);
    return null;
  }
}
function chooseSessionStartup() {
  if (isSharedUrl) return Promise.resolve({ action: 'shared', snapshot: sharedSnapshot });
  const snapshot = readSessionSnapshot();
  if (!snapshot) return Promise.resolve({ action: 'start', snapshot: null });
  const dialog = $('sessionRestoreDialog');
  return new Promise(resolve => {
    const choices = [...dialog.querySelectorAll('[data-session-choice]')];
    const trapFocus = event => {
      if (event.key !== 'Tab') return;
      const index = choices.indexOf(document.activeElement);
      if (index === -1 || (event.shiftKey ? index === 0 : index === choices.length - 1)) {
        event.preventDefault();
        choices[event.shiftKey ? choices.length - 1 : 0].focus();
      }
    };
    const finish = event => {
      const button = event.target instanceof Element ? event.target.closest('[data-session-choice]') : null;
      if (!button) return;
      dialog.removeEventListener('click', finish);
      dialog.removeEventListener('keydown', trapFocus);
      dialog.close();
      resolve({ action: button.dataset.sessionChoice, snapshot });
    };
    dialog.addEventListener('click', finish);
    dialog.addEventListener('keydown', trapFocus);
    dialog.showModal();
    choices[0].focus();
  });
}
function clearSavedThemeAdditions() {
  themeAdditions.clear();
  try { localStorage.removeItem(THEME_ADDITIONS_KEY); }
  catch (error) {
    console.warn('Saved theme additions could not be cleared:', error);
    toast('Saved theme additions could not be cleared in this browser.');
  }
}
function sessionSnapshot() {
  captureThemeOverlayVisibility();
  const rowFor = key => [...$('legend').querySelectorAll('[data-order-key]')]
    .find(row => row.dataset.orderKey === key);
  const vector = Object.fromEntries(Object.entries(ctl.data).map(([id, control]) => {
    const row = control.el;
    return [id, {
      selected: !!row.querySelector('.grp input')?.checked,
      entries: [...row.querySelectorAll('.ent input')].map(input => input.checked),
      transparency: Number(row.querySelector('.lpanel input[type="range"]')?.value || 0)
    }];
  }));
  const overlays = Object.fromEntries(allOverlays().map(overlay => {
    const checkbox = rowFor(`overlay:${overlay.id}`)?.querySelector('.grprow input[type="checkbox"]');
    return checkbox ? [overlay.id, checkbox.checked] : null;
  }).filter(Boolean));
  const basemaps = Object.fromEntries(validBasemaps().map(basemap => {
    const checkbox = rowFor(`basemap:${basemap.id}`)?.querySelector('.grprow input[type="checkbox"]');
    return checkbox ? [basemap.id, checkbox.checked] : null;
  }).filter(Boolean));
  const transparency = {};
  [...$('legend').querySelectorAll('[data-order-key]')].forEach(row => {
    const key = row.dataset.orderKey;
    const input = row.querySelector('.lpanel input[type="range"]');
    if (input && (key.startsWith('overlay:') || key.startsWith('basemap:'))) transparency[key] = Number(input.value);
  });
  const cogs = Object.fromEntries(allOverlays().filter(overlay => overlay.cogState).map(overlay => {
    const state = overlay.cogState;
    return [overlay.id, {
      ramp: state.ramp,
      mode: state.mode,
      hillshadeEnabled: state.hillshadeEnabled,
      hillshadePreferenceSet: state.hillshadePreferenceSet,
      hillshadeStrength: state.hillshadeStrength,
      hillshadeVerticalScale: state.hillshadeVerticalScale,
      contoursEnabled: state.contoursEnabled,
      contourPreferenceSet: state.contourPreferenceSet,
      contourIntervals: { ...state.contourIntervals },
      contourColors: { ...state.contourColors },
      opacity: state.opacity
    }];
  }));
  const center = map.getCenter();
  return {
    version: SESSION_STATE_VERSION,
    theme: activeThemeName,
    view: {
      center: center.toArray(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      projection: map.getProjection?.()?.type || 'mercator'
    },
    vector,
    overlays,
    themeOverlayVisibility: Object.fromEntries([...themeOverlayVisibility].map(([name, visibility]) =>
      [name, Object.fromEntries(visibility)])),
    basemaps,
    transparency,
    cogs,
    hiddenGroups: [...$('legend').querySelectorAll('.lgroup.group-hidden')].map(group => group.dataset.groupName),
    terrain: {
      enabled: terrainOn,
      model: activeTerrainModel?.id || null,
      exaggeration: terrainExaggeration
    },
    hillshadeStyle: { ...hillshadeStyle },
    contourColors: { ...contourColors },
    contourOpacity: terrainControls.state.contourOpacity
  };
}
function saveSessionSnapshot() {
  if (!sessionPersistenceReady) return;
  try {
    localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(sessionSnapshot()));
    sessionSaveFailed = false;
  } catch (error) {
    console.warn('Map session could not be saved:', error);
    if (!sessionSaveFailed) toast('Map session could not be saved in this browser.');
    sessionSaveFailed = true;
  }
}
function scheduleSessionSave() {
  if (!sessionPersistenceReady) return;
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(saveSessionSnapshot, 300);
}
function restoreSessionSnapshot(snapshot) {
  if (!snapshot) return;
  Object.entries(snapshot.vector || {}).forEach(([id, saved]) => {
    const row = ctl.data[id]?.el;
    const checkbox = row?.querySelector('.grp input');
    if (!checkbox || typeof saved.selected !== 'boolean') return;
    checkbox.checked = saved.selected;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    const entries = [...row.querySelectorAll('.ent input')];
    (Array.isArray(saved.entries) ? saved.entries : []).forEach((checked, index) => {
      if (!entries[index] || typeof checked !== 'boolean') return;
      entries[index].checked = checked;
      entries[index].dispatchEvent(new Event('change', { bubbles: true }));
    });
    const transparency = row.querySelector('.lpanel input[type="range"]');
    if (transparency && Number.isFinite(saved.transparency)) {
      transparency.value = String(Math.max(0, Math.min(100, saved.transparency)));
      transparency.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  const rowFor = key => [...$('legend').querySelectorAll('[data-order-key]')]
    .find(row => row.dataset.orderKey === key);
  Object.entries(snapshot.overlays || {}).forEach(([id, visible]) => {
    if (typeof visible !== 'boolean') return;
    const checkbox = rowFor(`overlay:${id}`)?.querySelector('.grprow input[type="checkbox"]');
    if (checkbox) { checkbox.checked = visible; checkbox.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  Object.entries(snapshot.basemaps || {}).forEach(([id, visible]) => {
    if (typeof visible !== 'boolean') return;
    const checkbox = rowFor(`basemap:${id}`)?.querySelector('.grprow input[type="checkbox"]');
    if (checkbox) { checkbox.checked = visible; checkbox.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  Object.entries(snapshot.transparency || {}).forEach(([key, value]) => {
    if (!Number.isFinite(value)) return;
    const input = rowFor(key)?.querySelector('.lpanel input[type="range"]');
    if (!input) return;
    input.value = String(Math.max(0, Math.min(100, value)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const hiddenGroups = new Set(Array.isArray(snapshot.hiddenGroups) ? snapshot.hiddenGroups : []);
  $('legend').querySelectorAll('.lgroup').forEach(group => {
    const eye = group.querySelector('.lgeye');
    if (eye && hiddenGroups.has(group.dataset.groupName) && eye.getAttribute('aria-pressed') !== 'true') eye.click();
  });
  if (snapshot.terrain && Number.isFinite(snapshot.terrain.exaggeration)) {
    const modelId = terrainModels.find(model => model.id === snapshot.terrain.model)?.id;
    if (modelId && activeTerrainModel?.id !== modelId) setTerrainModel(modelId);
    terrainExaggeration = Math.min(3, Math.max(1, snapshot.terrain.exaggeration));
    const slider = $('legend').querySelector('.terrain-exaggeration');
    if (slider) {
      slider.value = String(terrainExaggeration);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (snapshot.terrain.enabled && terrainCb && !terrainCb.checked) setTerrain3D(true, true, false);
  }
  if (snapshot.view?.projection === 'globe' || snapshot.view?.projection === 'mercator') {
    const globe = snapshot.view.projection === 'globe';
    map.setProjection({ type: globe ? 'globe' : 'mercator' });
    $('globeBtn').classList.toggle('active', globe);
    $('globeBtn').setAttribute('aria-pressed', String(globe));
  }
  const view = snapshot.view;
  map.jumpTo({
    center: view.center,
    zoom: view.zoom,
    bearing: Number.isFinite(view.bearing) ? view.bearing : 0,
    pitch: Number.isFinite(view.pitch) ? view.pitch : 0
  });
  updateScaleState();
  updateArcgisLegendInView();
}
function prepareSessionSnapshot(snapshot) {
  const savedVisibility = snapshot?.themeOverlayVisibility;
  if (savedVisibility && typeof savedVisibility === 'object' && !Array.isArray(savedVisibility)) {
    Object.entries(savedVisibility).forEach(([name, saved]) => {
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      themeOverlayVisibility.set(name, new Map(
        Object.entries(saved).filter(([, visible]) => typeof visible === 'boolean')
      ));
    });
  }
  const savedStyle = snapshot?.hillshadeStyle;
  if (savedStyle) {
    if (HILLSHADE_METHODS.some(([method]) => method === savedStyle.method)) hillshadeStyle.method = savedStyle.method;
    if (savedStyle.anchor === 'map' || savedStyle.anchor === 'viewport') hillshadeStyle.anchor = savedStyle.anchor;
    [['direction', 0, 359], ['altitude', 0, 90]].forEach(([key, min, max]) => {
      if (Number.isFinite(savedStyle[key])) hillshadeStyle[key] = Math.max(min, Math.min(max, savedStyle[key]));
    });
    [['shadowColor', 'shadowColor'], ['highlightColor', 'highlightColor'], ['accentColor', 'accentColor']].forEach(([key, field]) => {
      if (typeof savedStyle[field] === 'string' && /^#[0-9a-f]{6}$/i.test(savedStyle[field])) hillshadeStyle[key] = savedStyle[field];
    });
  }
  if (snapshot.contourColors) {
    ['minor', 'major'].forEach(key => {
      if (typeof snapshot.contourColors[key] === 'string' && /^#[0-9a-f]{6}$/i.test(snapshot.contourColors[key]))
        contourColors[key] = snapshot.contourColors[key];
    });
  }
  if (Number.isFinite(snapshot.contourOpacity))
    terrainControls.state.contourOpacity = Math.max(0, Math.min(1, snapshot.contourOpacity));
}
function initializeWorkspaceControls() {
  const select = $('workspaceSelect');
  const status = $('workspaceStatus');
  const remove = $('workspaceRemoveBtn');
  const refresh = selectedName => {
    try {
      const entries = WORKSPACE_STORE.list();
      select.replaceChildren(new Option('Select a workspace', ''));
      entries.forEach(entry => select.add(new Option(entry.name, entry.name)));
      if (selectedName) select.value = selectedName;
      remove.disabled = !select.value;
      $('workspaceCount').textContent = entries.length ? ` (${entries.length})` : '';
      status.textContent = entries.length
        ? `${entries.length} saved workspace${entries.length === 1 ? '' : 's'}. Saving the same name updates it.`
        : 'No saved workspaces yet.';
      return true;
    } catch (error) {
      status.textContent = `Saved workspaces could not be loaded: ${error.message}`;
      remove.disabled = true;
      return false;
    }
  };
  select.onchange = () => { remove.disabled = !select.value; };
  if (document.documentElement.dataset.ui === 'v2') {
    $('workspaceGroup').classList.add('collapsed');
    $('workspaceGroup').querySelector('.lgcollapse').setAttribute('aria-expanded', 'false');
  }
  $('workspaceSaveBtn').onclick = () => {
    try {
      const saved = WORKSPACE_STORE.save($('workspaceName').value, sessionSnapshot());
      $('workspaceName').value = saved.name;
      refresh(saved.name);
      status.textContent = `Saved workspace "${saved.name}".`;
    } catch (error) {
      status.textContent = error.message;
    }
  };
  $('workspaceLoadBtn').onclick = () => {
    try {
      if (!select.value) throw new Error('Choose a saved workspace to load.');
      const saved = WORKSPACE_STORE.get(select.value);
      if (!saved) throw new Error('Choose a saved workspace to load.');
      prepareSessionSnapshot(saved.snapshot);
      const themeIndex = (CONFIG.themes || []).findIndex(theme => theme.name === saved.snapshot.theme);
      if (themeIndex >= 0 && $('themeSel').value !== String(themeIndex)) {
        $('themeSel').value = String(themeIndex);
        $('themeSel').dispatchEvent(new Event('change'));
      }
      restoreSessionSnapshot(saved.snapshot);
      scheduleSessionSave();
      status.textContent = themeIndex < 0 && saved.snapshot.theme
        ? `Loaded "${saved.name}"; its saved theme is no longer configured.`
        : `Loaded workspace "${saved.name}".`;
    } catch (error) {
      status.textContent = error.message;
    }
  };
  remove.onclick = () => {
    try {
      const selectedName = select.value;
      if (!selectedName) throw new Error('Choose a saved workspace to remove.');
      if (!WORKSPACE_STORE.remove(selectedName)) throw new Error(`Workspace "${selectedName}" no longer exists.`);
      refresh();
      status.textContent = `Removed workspace "${selectedName}".`;
    } catch (error) {
      status.textContent = error.message;
    }
  };
  refresh();
}
function updateManualRemovalControls() {
  const additions = themeAdditions.get(activeThemeName);
  document.querySelectorAll('#legend .lgroup:not(.json-theme-legend)').forEach(group => {
    const removable = !activeThemeAll && additions && [...group.querySelector('.lgbody').children].some(item => {
      const key = item.dataset.orderKey || '';
      return key.startsWith('layer:') ? additions.layers.has(key.slice(6))
        : key.startsWith('overlay:') && additions.overlays.has(key.slice(8));
    });
    group.querySelector('.lremove').hidden = !removable;
  });
}
function removeManualGroupAdditions(group) {
  if (!activeThemeName || activeThemeAll) return;
  const additions = themeAdditions.get(activeThemeName);
  if (!additions) return;
  const items = [...group.querySelector('.lgbody').children].filter(item => {
    const key = item.dataset.orderKey || '';
    return key.startsWith('layer:') ? additions.layers.has(key.slice(6))
      : key.startsWith('overlay:') && additions.overlays.has(key.slice(8));
  });
  if (!items.length) return;
  const prompt = items.length === 1
    ? 'Remove this added layer?'
    : 'Remove these added layers?';
  confirmToast(prompt, () => {
    items.forEach(item => {
      const key = item.dataset.orderKey;
      if (key.startsWith('layer:')) additions.layers.delete(key.slice(6));
      else additions.overlays.delete(key.slice(8));
    });
    additions.overlayGroups.delete(group.dataset.groupName);
    themeLayers = [...new Set([...themeBaseLayers, ...additions.layers])];
    themeOverlays = [...new Set([...themeBaseOverlays, ...additions.overlays])];
    saveThemeAdditions();
    Object.entries(ctl.data).forEach(([id, control]) => {
      const inTheme = themeLayers.includes(id);
      control.theme(inTheme);
      control.el.hidden = !inTheme;
    });
    Object.entries(ctl.ov).forEach(([id, control]) => {
      const inTheme = themeOverlays.includes(id);
      control.theme(inTheme);
      control.el.hidden = !inTheme;
    });
    document.querySelectorAll('#legend .lgroup:not(.json-theme-legend)').forEach(section => {
      section.hidden = ![...section.querySelectorAll('.lgbody > *')].some(item => !item.hidden);
    });
    updateManualRemovalControls();
    populateSearchLayers();
    updateArcgisLegendInView();
  }, group.querySelector('.lremove'));
}
const jsonThemeStates = new Map();
let activeJsonThemeId = null;
let activeJsonConfig = null;
let activeJsonThemeState = createJsonThemeState();
const { showJsonThemePopup, appendArcgisFeaturesToJsonThemePopup } = createJsonThemePopupController({
  document,
  map,
  maplibregl,
  getConfig: activeJsonThemeConfig,
  getState: () => activeJsonThemeState,
  renderCell: jsonThemeCell
});
const mapClickController = createMapClickController({
  map,
  document,
  maplibregl,
  queryData,
  around,
  arcgisClickEnvelope,
  queryArcgisOverlays,
  withLinked,
  getJsonThemeConfig: () => activeJsonThemeState.active ? activeJsonThemeConfig() : null,
  getJsonThemeState: () => activeJsonThemeState,
  isNotificationPicking: notificationController.isPicking,
  selectNotificationLocation: notificationController.selectLocation,
  isBoxMode: () => boxMode,
  isJustBoxed: () => justBoxed,
  datasetGeometryLayerIds,
  showJsonThemePopup,
  appendArcgisFeaturesToJsonThemePopup,
  escapeHtml: esc,
  renderCell: cell
});
map.on('click', mapClickController.handleClick);
function jsonThemeMapIds(themeId = activeJsonThemeId) {
  const namespace = String(themeId || 'theme').replace(/[^a-z0-9_-]/gi, '-');
  const layer = `json-${namespace}-points`;
  const ids = {
    source: `json-${namespace}-source`,
    layer,
    lines: `json-${namespace}-lines`,
    polygons: `json-${namespace}-polygons`,
    clusters: `${layer}-clusters`,
    clusterCount: `${layer}-cluster-count`
  };
  ids.geometryLayers = [ids.layer, ids.lines, ids.polygons];
  ids.layers = [...ids.geometryLayers, ids.clusters, ids.clusterCount];
  return ids;
}
function resolveThemeGroup(name, seen = new Set()) {
  if (seen.has(name)) return { layers: [], overlays: [] };
  seen.add(name);
  const namedTheme = (CONFIG.themes || []).find(theme => theme.name === name);
  const custom = (CONFIG.groups || {})[name];   // CONFIG.groups: { name: { datasets, layers, overlays, groups } }
  const datasets = [...(namedTheme?.datasets || []), ...(custom?.datasets || [])];
  const overlays = (CONFIG.overlays || []).filter(overlay => overlay.group === name).map(overlay => overlay.id);
  const nested = (custom?.groups || []).map(g => resolveThemeGroup(g, seen));
  return {
    layers: [
      ...((window.LEGEND_GROUP_LAYERS || {})[name] || []),
      ...(namedTheme?.layers || []),
      ...(custom?.layers || []),
      ...datasets.flatMap(id => (window.DATASET_LAYERS || {})[id] || []),
      ...nested.flatMap(g => g.layers)
    ],
    overlays: [...overlays, ...(namedTheme?.overlays || []), ...(custom?.overlays || []), ...nested.flatMap(g => g.overlays)]
  };
}
///////////////////////////////////////////////////////////////////////////
// Applies configured theme visibility to vector layers, overlays, and JSON data.
///////////////////////////////////////////////////////////////////////////
function setupThemes(preferredThemeName = null, honorSharedJsonState = true) {
  const list = CONFIG.themes || [];
  const savedThemeVisibility = startupSessionSnapshot?.themeOverlayVisibility;
  if (savedThemeVisibility && typeof savedThemeVisibility === 'object' && !Array.isArray(savedThemeVisibility)) {
    Object.entries(savedThemeVisibility).forEach(([name, saved]) => {
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      themeOverlayVisibility.set(name, new Map(
        Object.entries(saved).filter(([, visible]) => typeof visible === 'boolean')
      ));
    });
  }
  $('themeBar').hidden = !list.length;
  if (!list.length) return;
  const sel = $('themeSel');
  sel.innerHTML = list.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('');
  const apply = i => {
    arcgisQueryController.cancel();
    const t = list[i];
    captureThemeOverlayVisibility();
    activeThemeName = t.name;
    const additions = themeAdditions.get(t.name) || { layers: new Set(), overlays: new Set(), overlayGroups: new Set() };
    const groupMembers = (t.groups || []).map(name => resolveThemeGroup(name));
    const overlayConfigs = validOverlays();
    const membership = resolveThemeMembership({
      theme: t,
      groupMembers,
      overlayConfigs,
      datasetLayers: window.DATASET_LAYERS || {}
    });
    activeThemeAll = membership.activeThemeAll;
    const overlayGroups = membership.overlayGroups;
    themeBaseOverlays = membership.themeBaseOverlays;
    themeOverlays = [...new Set([...themeBaseOverlays, ...additions.overlays])];
    themeBaseLayers = membership.themeBaseLayers;
    themeLayers = activeThemeAll ? null : [...new Set([...themeBaseLayers, ...additions.layers])];
    // Theme membership gates rendering without changing the user's checkbox state.
    Object.entries(ctl.data).forEach(([sl, o]) => {
      const inTheme = activeThemeAll || themeLayers.includes(sl);
      o.theme(inTheme); o.el.hidden = !inTheme;
    });
    Object.entries(ctl.ov).forEach(([id, o]) => {
      const inTheme = activeThemeAll || themeOverlays.includes(id);
      o.theme(inTheme); o.el.hidden = !inTheme;
    });
    const savedVisibility = themeOverlayVisibility.get(t.name);
    if (savedVisibility) {
      themeOverlays.forEach(id => {
        if (savedVisibility.has(id)) ctl.ov[id]?.set(savedVisibility.get(id));
      });
    } else {
      overlayGroups.forEach((group, groupIndex) => {
        group.ids.forEach((id, layerIndex) => ctl.ov[id]?.set(groupIndex === 0 && layerIndex === 0));
      });
    }
    additions.layers.forEach(id => ctl.data[id]?.set(true));
    const disabledAddedRasterOverlays = addedRasterOverlaysToDisable(additions, overlayConfigs);
    additions.overlays.forEach(id => ctl.ov[id]?.set(!disabledAddedRasterOverlays.has(id)));
    document.querySelectorAll('#legend .lgroup:not(.json-theme-legend)').forEach(g => {   // hide headings with nothing left under them
      g.hidden = ![...g.querySelectorAll('.lgbody > *')].some(e => !e.hidden);
    });
    updateManualRemovalControls();
    clearResults();
    if (t.jsonTheme) activateJsonTheme(t).catch(error => toast(`Could not load ${t.name} config: ${error.message}`));
    else { setJsonThemeActive(false); setResults(!!t.showResults); }
    populateSearchLayers();   // search only offers the theme's layers
    updateArcgisLegendInView();
    syncMapLayerOrder();
  };
  sel.onchange = () => apply(sel.value);
  const firstJsonTheme = list.findIndex(theme => theme.jsonTheme && theme.jsonConfig);
  const hasSharedJsonState = honorSharedJsonState && isJsonThemeShareState(sharedJsonHashState) && firstJsonTheme >= 0;
  const preferredIndex = list.findIndex(theme => theme.name === preferredThemeName);
  const initialTheme = preferredIndex >= 0 ? preferredIndex
    : hasSharedJsonState ? firstJsonTheme : (CONFIG.defaultTheme || 0);
  sel.value = initialTheme;
  apply(sel.value);
}
function renderAddDataPicker() {
  const list = $('addDataList');
  list.replaceChildren();
  const search = $('addDataSearch');
  search.value = '';
  search.disabled = true;
  search.oninput = () => filterAddDataPicker(true);
  $('addDataApply').disabled = true;
  if (!activeThemeName) return;
  if (activeThemeAll) {
    const message = document.createElement('p');
    message.className = 'hint';
    message.textContent = 'This theme already includes all available data.';
    list.appendChild(message);
    $('addDataApply').disabled = true;
    return;
  }
  const groups = new Map();
  const add = (kind, id, control) => {
    const group = control.el.closest('.lgroup')?.dataset.groupName || 'Other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ kind, id, label: kind === 'layer' ? id.replace(/_/g, ' ') : control.el.querySelector('.lname span')?.textContent || id });
  };
  Object.entries(ctl.data).forEach(([id, control]) => {
    if (!themeLayers.includes(id)) add('layer', id, control);
  });
  Object.entries(ctl.ov).forEach(([id, control]) => {
    if (!themeOverlays.includes(id)) add('overlay', id, control);
  });
  if (!groups.size) {
    const message = document.createElement('p');
    message.className = 'hint';
    message.textContent = 'No additional layers are available for this theme.';
    list.appendChild(message);
    $('addDataApply').disabled = true;
    return;
  }
  search.disabled = false;
  [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(([name, items]) => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'add-data-group';
    fieldset.dataset.groupName = name;
    const legend = document.createElement('legend');
    legend.className = 'add-data-group-head';
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'add-data-collapse';
    collapse.setAttribute('aria-expanded', 'false');
    collapse.setAttribute('aria-label', `Expand ${name}`);
    collapse.title = `Expand ${name}`;
    collapse.innerHTML = ICON_CHEV;
    const groupLabel = document.createElement('label');
    const groupInput = document.createElement('input');
    groupInput.type = 'checkbox';
    groupInput.dataset.groupCheck = 'true';
    const groupName = document.createElement('span');
    groupName.textContent = name;
    groupLabel.append(groupInput, groupName);
    legend.append(collapse, groupLabel);
    fieldset.appendChild(legend);
    const itemList = document.createElement('div');
    itemList.className = 'add-data-items';
    itemList.hidden = true;
    fieldset.classList.add('collapsed');
    const itemInputs = [];
    items.forEach(item => {
      const label = document.createElement('label');
      label.dataset.itemName = item.label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.kind = item.kind;
      input.dataset.id = item.id;
      const text = document.createElement('span');
      text.textContent = item.label;
      label.append(input, text);
      itemList.appendChild(label);
      itemInputs.push(input);
    });
    fieldset.appendChild(itemList);
    collapse.onclick = () => {
      const expanded = collapse.getAttribute('aria-expanded') !== 'true';
      collapse.setAttribute('aria-expanded', String(expanded));
      collapse.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${name}`);
      collapse.title = `${expanded ? 'Collapse' : 'Expand'} ${name}`;
      fieldset.classList.toggle('collapsed', !expanded);
      itemList.hidden = !expanded;
    };
    const updateGroup = () => {
      filterAddDataPicker();
    };
    groupInput.onchange = () => {
      itemInputs.filter(input => !input.closest('label').hidden)
        .forEach(input => { input.checked = groupInput.checked; });
      updateGroup();
    };
    itemInputs.forEach(input => input.onchange = updateGroup);
    list.appendChild(fieldset);
  });
  const noResults = document.createElement('p');
  noResults.className = 'hint add-data-no-results';
  noResults.textContent = 'No matching groups or layers.';
  noResults.hidden = true;
  list.appendChild(noResults);
  filterAddDataPicker(true);
}
function filterAddDataPicker(resetExpansion = false) {
  const list = $('addDataList');
  const query = $('addDataSearch').value.trim().toLowerCase();
  let visibleGroups = 0;
  list.querySelectorAll('.add-data-group').forEach(fieldset => {
    const groupMatches = !!query && fieldset.dataset.groupName.toLowerCase().includes(query);
    const labels = [...fieldset.querySelectorAll('.add-data-items > label')];
    let matchingItems = 0, selectedItems = 0;
    labels.forEach(label => {
      const matches = !query || label.dataset.itemName.toLowerCase().includes(query);
      label.hidden = !matches;
      if (matches) {
        matchingItems++;
        if (label.querySelector('input').checked) selectedItems++;
      }
    });
    const visible = !query || groupMatches || matchingItems > 0;
    fieldset.hidden = !visible;
    if (visible) visibleGroups++;
    const expanded = resetExpansion ? !!query && visible : visible && !fieldset.classList.contains('collapsed');
    fieldset.classList.toggle('collapsed', !expanded);
    const items = fieldset.querySelector('.add-data-items');
    items.hidden = !expanded;
    const collapse = fieldset.querySelector('.add-data-collapse');
    collapse.setAttribute('aria-expanded', String(expanded));
    collapse.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${fieldset.dataset.groupName}`);
    collapse.title = `${expanded ? 'Collapse' : 'Expand'} ${fieldset.dataset.groupName}`;
    const groupInput = fieldset.querySelector('input[data-group-check]');
    groupInput.checked = matchingItems > 0 && selectedItems === matchingItems;
    groupInput.indeterminate = selectedItems > 0 && selectedItems < matchingItems;
  });
  const noResults = list.querySelector('.add-data-no-results');
  if (noResults) noResults.hidden = !query || visibleGroups > 0;
  $('addDataApply').disabled = !list.querySelector('input[data-kind]:checked');
  if (uiV2) {
    const count = list.querySelectorAll('input[data-kind]:checked').length;
    $('addDataApply').textContent = count ? `Add ${count} selected` : 'Add selected';
  }
}
function closeAddDataPanel() {
  $('addDataPanel').hidden = true;
  $('legend').hidden = false;
  syncAddDataButton();
}
function applySelectedThemeData() {
  if (!activeThemeName) return;
  const selected = [...$('addDataList').querySelectorAll('input[data-kind]:checked')];
  if (!selected.length) return;
  const additions = themeAdditions.get(activeThemeName) || { layers: new Set(), overlays: new Set(), overlayGroups: new Set() };
  const overlayConfigs = validOverlays();
  $('addDataList').querySelectorAll('.add-data-group').forEach(fieldset => {
    const groupCheck = fieldset.querySelector('input[data-group-check]');
    if (!groupCheck?.checked) return;
    const selectedIds = new Set([...fieldset.querySelectorAll('input[data-kind="overlay"]:checked')]
      .map(input => input.dataset.id));
    const selectedRasterOverlays = overlayConfigs.filter(overlay =>
      (overlay.group || 'Overlays') === fieldset.dataset.groupName && !overlay.geojson && selectedIds.has(overlay.id));
    if (selectedRasterOverlays.length > 1) additions.overlayGroups.add(fieldset.dataset.groupName);
  });
  selected.forEach(input => {
    const { kind, id } = input.dataset;
    if (kind === 'layer') additions.layers.add(id);
    else if (kind === 'overlay') additions.overlays.add(id);
  });
  const disabledAddedRasterOverlays = addedRasterOverlaysToDisable(additions, overlayConfigs);
  selected.forEach(input => {
    const { kind, id } = input.dataset;
    if (kind === 'layer') {
      if (themeLayers && !themeLayers.includes(id)) themeLayers.push(id);
      const control = ctl.data[id];
      if (control) {
        control.theme(true);
        control.el.hidden = false;
        control.set(true);
      }
    } else if (kind === 'overlay') {
      if (!themeOverlays.includes(id)) themeOverlays.push(id);
      const control = ctl.ov[id];
      if (control) {
        control.theme(true);
        control.el.hidden = false;
        control.set(!disabledAddedRasterOverlays.has(id));
      }
    }
  });
  themeAdditions.set(activeThemeName, additions);
  saveThemeAdditions();
  document.querySelectorAll('#legend .lgroup:not(.json-theme-legend)').forEach(group => {
    group.hidden = ![...group.querySelectorAll('.lgbody > *')].some(item => !item.hidden);
  });
  updateManualRemovalControls();
  populateSearchLayers();
  updateArcgisLegendInView();
  syncMapLayerOrder();
  closeAddDataPanel();
}
function openAddDataPanel() {
  const wasLayersOpen = tool === 'legend';
  if (!wasLayersOpen) openTool('legend');
  if (wasLayersOpen && !$('addDataPanel').hidden) {
    closeAddDataPanel();
    return;
  }
  $('legend').hidden = true;
  $('addDataPanel').hidden = false;
  if (uiV2) {
    $('addDataPanel').querySelector('.add-data-head strong').textContent = `Add data to ${activeThemeName || 'theme'}`;
    $('addDataApply').textContent = 'Add selected';
  }
  renderAddDataPicker();
  syncAddDataButton();
}
$('addDataBtn').onclick = openAddDataPanel;
$('addDataClose').onclick = closeAddDataPanel;
$('addDataApply').onclick = applySelectedThemeData;
$('addOwnLayerBtn').onclick = () => {
  $('userLayerError').hidden = true;
  $('userLayerError').textContent = '';
  $('userLayerForm').reset();
  $('userLayerGroup').value = 'user added layers';
  $('userLayerDialog').showModal();
  $('userLayerUrl').focus();
};
$('userLayerCancel').onclick = () => $('userLayerDialog').close();
function httpServiceUrl(value) {
  return parseServiceUrl(value);
}
const restoreTilePlaceholders = value => value.replace(/%7B(z|x|y)%7D/gi, '{$1}');
async function getEsriServiceLayers(inputUrl) {
  const serviceUrl = new URL(inputUrl.href);
  const match = decodeURIComponent(serviceUrl.pathname).match(/^(.*\/MapServer)(?:\/\d+)?(?:\/tile\/(?:\{z\}|\d+)\/(?:\{y\}|\d+)\/(?:\{x\}|\d+))?\/?$/i);
  if (!match) throw new Error('Enter an ArcGIS REST MapServer URL, optionally ending in /tile/{z}/{y}/{x}.');
  serviceUrl.pathname = match[1];
  serviceUrl.searchParams.set('f', 'json');
  const response = await fetch(serviceUrl);
  if (!response.ok) throw new Error(`ArcGIS REST returned HTTP ${response.status}.`);
  let metadata;
  try { metadata = await response.json(); }
  catch { throw new Error('The ArcGIS REST URL did not return JSON service metadata.'); }
  if (metadata.error || (!metadata.tileInfo && !Array.isArray(metadata.layers) && metadata.singleFusedMapCache !== true))
    throw new Error('The URL is not a readable ArcGIS REST MapServer service.');
  const baseUrl = new URL(inputUrl.href);
  baseUrl.pathname = match[1];
  const serviceLayers = (metadata.layers || []).filter(layer =>
    Number.isInteger(layer.id) && typeof layer.name === 'string' && layer.name.trim() &&
    (!Array.isArray(layer.subLayerIds) || layer.subLayerIds.length === 0)
  );
  if (serviceLayers.length) {
    return serviceLayers.map(layer => ({
      name: layer.name.trim(),
      visible: layer.defaultVisibility !== false,
      url: baseUrl.href,
      layers: String(layer.id)
    }));
  }
  if (metadata.tileInfo) {
    baseUrl.pathname = `${match[1]}/tile/{z}/{y}/{x}`;
    return [{
      name: metadata.mapName || 'MapServer',
      visible: true,
      tiles: restoreTilePlaceholders(baseUrl.href)
    }];
  }
  throw new Error('The MapServer does not expose any individual layers to add.');
}
function persistUserLayers(layers) {
  localStorage.setItem(USER_LAYERS_KEY, JSON.stringify(layers));
}
async function submitUserLayer(event) {
  event.preventDefault();
  const submit = $('userLayerSubmit');
  const errorOutput = $('userLayerError');
  errorOutput.hidden = true;
  errorOutput.textContent = '';
  submit.disabled = true;
  try {
    const url = httpServiceUrl($('userLayerUrl').value.trim());
    const group = $('userLayerGroup').value.trim();
    if (!group) throw new Error('Enter a group for the layers.');
    const serviceLayers = await getEsriServiceLayers(url);
    const overlays = serviceLayers.map(layer => ({
      id: `user-layer-${crypto.randomUUID()}`,
      name: layer.name,
      group,
      serviceType: 'esri-rest',
      userAdded: true,
      global: false,
      visible: layer.visible,
      opacity: 1,
      ...(layer.url && layer.layers ? { queryable: true } : {}),
      ...(layer.url ? { url: layer.url } : {}),
      ...(layer.tiles ? { tiles: layer.tiles } : {}),
      ...(layer.layers ? { layers: layer.layers } : {})
    }));
    const savedUserLayers = (CONFIG.overlays || []).filter(layer => layer.userAdded);
    const userLayers = [...savedUserLayers, ...overlays];
    persistUserLayers(userLayers);
    CONFIG.overlays ||= [];
    CONFIG.overlays.push(...overlays);
    try {
      const firstSymbol = map.getStyle().layers.find(layer => layer.type === 'symbol');
      overlays.forEach(overlay => addRasterLayer(overlay, firstSymbol?.id));
      buildOverlayLegend(overlays);
    } catch (error) {
      const newIds = new Set(overlays.map(overlay => overlay.id));
      CONFIG.overlays = CONFIG.overlays.filter(layer => !newIds.has(layer.id));
      overlays.forEach(overlay => {
        if (map.getLayer(overlay.id)) map.removeLayer(overlay.id);
        if (map.getSource(overlay.id)) map.removeSource(overlay.id);
      });
      persistUserLayers(savedUserLayers);
      throw error;
    }
    if (activeThemeName) {
      const additions = themeAdditions.get(activeThemeName) || { layers: new Set(), overlays: new Set(), overlayGroups: new Set() };
      overlays.forEach(overlay => additions.overlays.add(overlay.id));
      themeAdditions.set(activeThemeName, additions);
      overlays.forEach(overlay => {
        if (!themeOverlays.includes(overlay.id)) themeOverlays.push(overlay.id);
        ctl.ov[overlay.id]?.theme(true);
        ctl.ov[overlay.id]?.el && (ctl.ov[overlay.id].el.hidden = false);
        ctl.ov[overlay.id]?.set(overlay.visible);
      });
      saveThemeAdditions();
    }
    updateManualRemovalControls();
    populateSearchLayers();
    updateArcgisLegendInView();
    syncMapLayerOrder();
    $('userLayerDialog').close();
    closeAddDataPanel();
  } catch (error) {
    errorOutput.textContent = `Could not add layer: ${error.message}`;
    errorOutput.hidden = false;
  } finally {
    submit.disabled = false;
  }
}
$('userLayerForm').addEventListener('submit', submitUserLayer);
async function activateJsonTheme(theme) {
  const config = await loadJsonThemeConfig(theme);
  const themeId = theme.jsonTheme;
  if (activeJsonThemeId !== themeId && activeJsonThemeState.active) setJsonThemeActive(false);
  activeJsonThemeId = themeId;
  activeJsonConfig = config;
  if (!jsonThemeStates.has(themeId)) {
    const state = createJsonThemeState();
    state.themeId = themeId;
    state.tab = config.tabs.find(tab => tab.isPrimary)?.key || config.tabs[0]?.key || null;
    jsonThemeStates.set(themeId, state);
  }
  activeJsonThemeState = jsonThemeStates.get(themeId);
  setJsonThemeActive(true);
  setResults(!!(theme.showResults ?? config.showResults));
}
function activeJsonThemeConfig() {
  return activeJsonConfig;
}
function jsonThemeRows(tabKey) {
  const rows = activeJsonThemeState.rows[tabKey] || [];
  const config = activeJsonThemeConfig();
  const primary = config.tabs.find(tab => tab.isPrimary);
  if (!config.geometryDataset || tabKey !== primary.key) return rows;
  return rows.map(row => {
    const tileProperties = activeJsonThemeState.geometryPropertiesById.get(String(row[config.linkField]));
    return tileProperties ? { ...tileProperties, ...row } : row;
  });
}
function jsonThemeColumns(tabKey) {
  const hidden = activeJsonThemeConfig().hiddenColumns || [];
  return [...new Set(jsonThemeRows(tabKey).flatMap(row => Object.keys(row)))].filter(field => !hidden.includes(field));
}
function jsonThemeColorExpression(config) {
  const value = ['to-number', ['get', config.depthField], -1];
  const classes = config.depthClasses || [];
  const expression = ['case'];
  classes.slice(0, -1).forEach(({ max, fill }, index) => {
    expression.push(index === 0 ? ['<=', value, max] : ['<', value, max], fill);
  });
  expression.push(classes.at(-1)?.fill || '#2166ac');
  return expression;
}
///////////////////////////////////////////////////////////////////////////
// Style layers of a deployment's `geometryDataset` that draw its `geometryLayer`.
///////////////////////////////////////////////////////////////////////////
function datasetGeometryLayerIds(config) {
  const sources = window.DATASET_SOURCES?.[config.geometryDataset] || [];
  return map.getStyle().layers
    .filter(l => sources.includes(l.source) && l['source-layer'] === config.geometryLayer)
    .map(l => l.id);
}
const geometryLayerFilters = new Map();   // layer id -> its original filter
const geometryLayerCursor = new Set();
// Limits the dataset's own layers to the rows left after bounds and filters; null restores them.
function setGeometryLayerFilter(config, ids) {
  datasetGeometryLayerIds(config).forEach(id => {
    if (!geometryLayerFilters.has(id)) geometryLayerFilters.set(id, map.getFilter(id) || null);
    const original = geometryLayerFilters.get(id);
    const field = config.geometryLinkField || config.linkField;
    const keep = ['in', ['get', field], ['literal', [...(ids || [])]]];
    map.setFilter(id, !ids ? original : original ? ['all', original, keep] : keep);
  });
}
function addJsonThemeMapLayers() {
  const ids = jsonThemeMapIds();
  const geometryConfig = activeJsonThemeConfig();
  if (geometryConfig.geometryDataset) {
    datasetGeometryLayerIds(geometryConfig).forEach(id => {
      if (geometryLayerCursor.has(id)) return;
      geometryLayerCursor.add(id);
      map.on('mouseenter', id, () => { if (activeJsonThemeState.active) map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });
    return;
  }
  if (!map.getSource(ids.source)) {
    const config = activeJsonThemeConfig();
    const pointOnly = activeJsonThemeState.features.length > 0 &&
      activeJsonThemeState.features.every(feature => feature.geometry.type === 'Point');
    const clustered = config.clustering === true && pointOnly;
    map.addSource(ids.source, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: activeJsonThemeState.features },
      cluster: clustered,
      clusterRadius: 48,
      clusterMaxZoom: 13
    });
    map.addLayer({
      id: ids.polygons, type: 'fill', source: ids.source,
      paint: {
        'fill-color': jsonThemeColorExpression(config),
        'fill-opacity': config.fillOpacity ?? 0.35
      }
    });
    map.addLayer({
      id: ids.lines, type: 'line', source: ids.source,
      paint: {
        'line-color': jsonThemeColorExpression(config),
        'line-width': config.lineWidth ?? 2
      }
    });
    if (clustered) {
      map.addLayer({
        id: ids.clusters, type: 'circle', source: ids.source,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#286b68',
          'circle-radius': ['step', ['get', 'point_count'], 15, 25, 19, 100, 24],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      });
      map.addLayer({
        id: ids.clusterCount, type: 'symbol', source: ids.source,
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff' }
      });
    }
    map.addLayer({
      id: ids.layer, type: 'circle', source: ids.source,
      ...(clustered ? { filter: ['!', ['has', 'point_count']] } : {}),
      paint: {
        'circle-color': jsonThemeColorExpression(config),
        'circle-radius': 5,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff'
      }
    });
    ids.geometryLayers.forEach(id => {
      map.on('click', id, showJsonThemePopup);
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });
  }
  map.getSource(ids.source).setData({
    type: 'FeatureCollection', features: activeJsonThemeState.features
  });
  ids.layers.filter(id => map.getLayer(id)).forEach(id => registerLayerVisibility(id, true));
}
///////////////////////////////////////////////////////////////////////////
// Loads and joins the active JSON theme's configured datasets once.
///////////////////////////////////////////////////////////////////////////
function loadActiveJsonThemeData() {
  if (activeJsonThemeState.loaded) return Promise.resolve();
  if (activeJsonThemeState.loading) return activeJsonThemeState.loading;
  const config = activeJsonThemeConfig();
  activeJsonThemeState.loading = loadJsonThemeData(config).then(data => {
    activeJsonThemeState.rows = data.rows;
    activeJsonThemeState.errors = data.errors;
    activeJsonThemeState.deployments = data.deployments;
    activeJsonThemeState.deploymentLinks = data.deploymentLinks;
    const primary = config.tabs.find(tab => tab.isPrimary);
    activeJsonThemeState.features = config.geometryDataset ? [] : buildJsonFeatures(activeJsonThemeState.rows[primary.key], config, proj4);
    activeJsonThemeState.featureById = new Map(activeJsonThemeState.features.map(feature => [String(feature.id), feature]));
    activeJsonThemeState.loaded = true;
    if (config.geometryDataset) harvestDatasetGeometry();
    if (activeJsonThemeState.active) {
      addJsonThemeMapLayers();
      if (!activeJsonThemeState.stateRestored) {
        activeJsonThemeState.stateRestored = true;
        restoreJsonThemeState();
      }
      refreshJsonThemeResults();
    }
  }).catch(error => {
    activeJsonThemeState.loading = null;
    throw error;
  });
  return activeJsonThemeState.loading;
}
///////////////////////////////////////////////////////////////////////////
// For deployments with `geometryDataset`: joins loaded vector-tile features to the primary rows by link id.
// Returns true when new geometry was found.
///////////////////////////////////////////////////////////////////////////
function harvestDatasetGeometry() {
  const state = activeJsonThemeState;
  const config = activeJsonThemeConfig();
  if (!state.loaded || !config?.geometryDataset) return false;
  const primary = config.tabs.find(tab => tab.isPrimary);
  const rowsById = new Map((state.rows[primary.key] || []).map(row => [String(row[config.linkField]), row]));
  const tileField = config.geometryLinkField || config.linkField;
  let added = false;
  (window.DATASET_SOURCES?.[config.geometryDataset] || []).forEach(source => {
    if (!map.getSource(source)) return;
    map.querySourceFeatures(source, { sourceLayer: config.geometryLayer }).forEach(tileFeature => {
      const id = String(tileFeature.properties?.[tileField]);
      const row = rowsById.get(id);
      if (!row) return;
      const previous = state.geometryPropertiesById.get(id) || {};
      const tileProperties = { ...previous, ...tileFeature.properties };
      if (Object.keys(tileProperties).length !== Object.keys(previous).length ||
          Object.entries(tileProperties).some(([field, value]) => previous[field] !== value)) {
        state.geometryPropertiesById.set(id, tileProperties);
        added = true;
      }
      if (state.featureById.has(id)) return;
      const feature = { type: 'Feature', id, geometry: tileFeature.geometry, properties: { ...tileProperties, ...row } };
      state.featureById.set(id, feature);
      state.features.push(feature);
      added = true;
    });
  });
  return added;
}
map.on('idle', () => {
  if (activeJsonThemeState.active && harvestDatasetGeometry()) refreshJsonThemeResults();
});
///////////////////////////////////////////////////////////////////////////
// Activates the JSON theme map layer, results panel, and theme controls.
///////////////////////////////////////////////////////////////////////////
function setJsonThemeActive(active) {
  const wasActive = activeJsonThemeState.active;
  activeJsonThemeState.active = active;
  document.body.classList.toggle('json-theme', active);
  $('jsonControls').hidden = !active;
  $('jsonExcelBtn').hidden = !active;
  $('xlsxBtn').hidden = true;
  $('jsonClearBtn').hidden = !active;
  $('csvBtn').hidden = active;
  $('boxBtn').disabled = active;
  $('runSearch').disabled = active;
  $('searchText').disabled = active;
  document.querySelector('#rail [data-tool="search"]').disabled = active;
  if (!activeJsonConfig) {
    $('jsonControls').hidden = true;
    $('jsonExcelBtn').hidden = true;
    $('jsonClearBtn').hidden = true;
    $('csvBtn').hidden = false;
    $('boxBtn').disabled = false;
    $('runSearch').disabled = false;
    $('searchText').disabled = false;
    document.querySelector('#rail [data-tool="search"]').disabled = false;
    return;
  }
  if (active && boxMode) setBox(false);
  if (active && tool === 'search') openTool('search');
  if (active && !wasActive && isMobile()) {
    toast('This view is not optimised for mobile devices. Please view it on a desktop.');
  }
  updateJsonThemeLegend(active);
  const ids = jsonThemeMapIds();
  setThemeVisibility(ids.layers, active);
  if (!active && activeJsonConfig.geometryDataset) setGeometryLayerFilter(activeJsonConfig, null);
  if (active) {
    if (!wasActive && !activeJsonThemeState.panelManuallySized) setPanelHeight(mainView.clientHeight * 0.35);
    if (activeJsonThemeState.loaded) refreshJsonThemeResults();
    else loadActiveJsonThemeData().catch(error => toast(`Could not load ${activeJsonThemeConfig().title || 'JSON theme'} data: ${error.message}`));
  } else if (wasActive) clearResults();
}
function updateJsonThemeLegend(active) {
  const config = activeJsonThemeConfig();
  const legend = $('legend');
  if (!activeJsonThemeState.depthGroup) {
    const themeNamespace = String(activeJsonThemeState.themeId || activeJsonThemeId).replace(/[^a-z0-9_-]/gi, '-');
    const depth = addGroup(legend, config.legendTitle || `${config.title} features`);
    depth.section = depth.body.closest('.lgroup');
    depth.section.id = `json-${themeNamespace}-depth-legend`;
    depth.section.classList.add('json-theme-legend');
    const ids = jsonThemeMapIds();
    ids.layers.forEach(id => depth.layerIds.add(id));
    (config.depthClasses || []).forEach(item => {
      const row = document.createElement('div'); row.className = 'json-legend-row';
      const swatch = document.createElement('span'); swatch.className = 'json-legend-swatch'; swatch.style.backgroundColor = item.fill;
      const label = document.createElement('span'); label.textContent = item.label;
      row.append(swatch, label); depth.body.appendChild(row);
    });
    const linked = addGroup(legend, config.filterGroupTitle || `${config.title} filters/results`);
    linked.section = linked.body.closest('.lgroup');
    linked.section.id = `json-${themeNamespace}-filters-legend`;
    linked.section.classList.add('json-theme-legend', 'json-link-filters');
    const controls = document.createElement('div'); controls.className = 'json-special-filters';
    controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Linked-data filters');
    linked.body.appendChild(controls);
    linked.onVisibilityChange = visible => { if (activeJsonThemeState.active) setResults(visible); };
    const eye = linked.section.querySelector('.lgeye');
    linked.setVisibility = visible => {
      activeJsonThemeState.linkedVisible = visible;
      eye.innerHTML = visible ? ICON_EYE : ICON_EYE_OFF;
      const label = `${visible ? 'Hide' : 'Show'} Quick Filters/Results Table`;
      eye.title = label;
      eye.setAttribute('aria-label', label);
      eye.setAttribute('aria-pressed', String(!visible));
      linked.section.classList.toggle('group-hidden', !visible);
      linked.onVisibilityChange(visible);
    };
    eye.onclick = () => linked.setVisibility(!activeJsonThemeState.linkedVisible);
    activeJsonThemeState.depthGroup = depth;
    activeJsonThemeState.linkedGroup = linked;
  }
  const { depthGroup, linkedGroup } = activeJsonThemeState;
  depthGroup.section.hidden = !active || !!config.geometryDataset;
  linkedGroup.section.hidden = !active;
  legend.prepend(depthGroup.section);
  legend.insertBefore(linkedGroup.section, depthGroup.section.nextSibling);
}
///////////////////////////////////////////////////////////////////////////
// Recomputes viewport-scoped filters and refreshes JSON theme map and tables.
///////////////////////////////////////////////////////////////////////////
function refreshJsonThemeResults(reopenPanel = false) {
  if (!activeJsonThemeState.active) return;
  const focused = document.activeElement?.dataset.jsonFilter;
  if (focused) {
    activeJsonThemeState.filterFocus = focused;
    activeJsonThemeState.filterSelection = {
      start: document.activeElement.selectionStart,
      end: document.activeElement.selectionEnd
    };
  }
  const config = activeJsonThemeConfig();
  const primary = config.tabs.find(tab => tab.isPrimary);
  const bounds = map.getBounds();
  const primaryRows = jsonThemeRows(primary.key);
  const bounded = primaryRows.filter(row => {
    const feature = activeJsonThemeState.featureById.get(String(row[config.linkField]));
    return feature && jsonGeometryIntersectsBounds(feature.geometry, bounds);
  });
  let boundedIds = new Set(bounded.map(row => row[config.linkField]).filter(Boolean));
  if (activeJsonThemeState.specialFilter) {
    const rows = activeJsonThemeState.rows[activeJsonThemeState.specialFilter] || [];
    const linked = new Set(rows.map(row => row[config.linkField]).filter(Boolean));
    boundedIds = new Set([...boundedIds].filter(id => linked.has(id)));
  }
  activeJsonThemeState.boundedIds = boundedIds;
  const primaryBase = filterJsonThemeRows(primary.key,
    bounded.filter(row => boundedIds.has(row[config.linkField])));
  let finalIds = new Set(primaryBase.map(row => row[config.linkField]).filter(Boolean));
  activeJsonThemeState.baseIds = new Set(finalIds);
  config.tabs.filter(tab => !tab.isPrimary).forEach(tab => {
    if (!hasJsonThemeFilters(tab.key)) return;
    const filtered = filterJsonThemeRows(tab.key,
      (activeJsonThemeState.rows[tab.key] || []).filter(row => finalIds.has(row[config.linkField])));
    const matches = new Set(filtered.map(row => row[config.linkField]).filter(Boolean));
    finalIds = new Set([...finalIds].filter(id => matches.has(id)));
  });
  activeJsonThemeState.finalIds = finalIds;
  activeJsonThemeState.visibleRows = {};
  config.tabs.forEach(tab => {
    const scope = tab.isPrimary ? primaryBase : (activeJsonThemeState.rows[tab.key] || []).filter(row => finalIds.has(row[config.linkField]));
    activeJsonThemeState.visibleRows[tab.key] = filterJsonThemeRows(tab.key, scope)
      .filter(row => finalIds.has(row[config.linkField]));
  });
  const visibleFeatures = activeJsonThemeState.features.filter(feature => finalIds.has(feature.properties[config.linkField]));
  const mapIds = jsonThemeMapIds();
  if (config.geometryDataset) setGeometryLayerFilter(config, finalIds);
  if (map.getSource(mapIds.source)) {
    map.getSource(mapIds.source).setData({ type: 'FeatureCollection', features: visibleFeatures });
  }
  renderJsonThemeControls();
  renderJsonThemeTabs();
  renderJsonThemeTable();
  $('count').textContent = `${finalIds.size} items in view`;
  if (reopenPanel && !resultsOn) setResults(true);
}
map.on('moveend', () => {
  if (activeJsonThemeState.active && activeJsonThemeState.loaded) refreshJsonThemeResults();
});
function jsonThemeFilterBucket(kind, tabKey) {
  const bucket = activeJsonThemeState.filters[kind];
  return bucket[tabKey] || (bucket[tabKey] = {});
}
function jsonThemeSpecialFilterControl() {
  return activeJsonThemeState.linkedGroup?.body.querySelector('.json-special-filters');
}
function hasJsonThemeFilters(tabKey, exceptField = null) {
  return hasJsonFilters(activeJsonThemeState.filters, tabKey, exceptField);
}
function filterJsonThemeRows(tabKey, rows, exceptField = null) {
  return filterJsonRows(rows, tabKey, activeJsonThemeState.filters, activeJsonThemeConfig(), exceptField);
}
function jsonThemeDropdownRows(tabKey, field) {
  const config = activeJsonThemeConfig();
  const primary = config.tabs.find(tab => tab.isPrimary);
  const primaryRows = jsonThemeRows(primary.key).filter(row => activeJsonThemeState.boundedIds.has(row[config.linkField]));
  let ids = new Set(filterJsonThemeRows(primary.key, primaryRows, tabKey === primary.key ? field : null)
    .map(row => row[config.linkField]).filter(Boolean));
  config.tabs.filter(tab => !tab.isPrimary && tab.key !== tabKey && hasJsonThemeFilters(tab.key)).forEach(tab => {
    const filtered = filterJsonThemeRows(tab.key,
      (activeJsonThemeState.rows[tab.key] || []).filter(row => ids.has(row[config.linkField])));
    const next = new Set(filtered.map(row => row[config.linkField]).filter(Boolean));
    ids = new Set([...ids].filter(id => next.has(id)));
  });
  const sourceTab = config.tabs.find(tab => tab.key === tabKey);
  const scope = sourceTab.isPrimary
    ? primaryRows.filter(row => ids.has(row[config.linkField]))
    : jsonThemeRows(tabKey).filter(row => ids.has(row[config.linkField]));
  return filterJsonThemeRows(tabKey, scope, field);
}
function renderJsonThemeControls() {
  const config = activeJsonThemeConfig();
  const special = jsonThemeSpecialFilterControl();
  if (!special) return;
  special.replaceChildren();
  const specialSelect = document.createElement('select');
  specialSelect.className = 'theme-select';
  specialSelect.setAttribute('aria-label', 'Filter items by linked data');
  const allOption = document.createElement('option'); allOption.value = ''; allOption.textContent = 'Filter by';
  specialSelect.appendChild(allOption);
  config.tabs.filter(tab => tab.specialFilter).forEach(tab => {
    const option = document.createElement('option'); option.value = tab.key; option.textContent = `Items with ${tab.specialFilter}`;
    specialSelect.appendChild(option);
  });
  specialSelect.value = activeJsonThemeState.specialFilter || '';
  specialSelect.onchange = () => { activeJsonThemeState.specialFilter = specialSelect.value || null; refreshJsonThemeResults(true); };
  special.appendChild(specialSelect);
  const pills = $('jsonActiveFilters');
  pills.replaceChildren();
  if (activeJsonThemeState.specialFilter) {
    const tab = config.tabs.find(item => item.key === activeJsonThemeState.specialFilter);
    appendJsonThemeFilterPill(pills, `With ${tab.specialFilter}`, () => {
      activeJsonThemeState.specialFilter = null; refreshJsonThemeResults(true);
    });
  }
  config.tabs.forEach(tab => {
    const state = activeJsonThemeState.filters;
    Object.entries(state.text[tab.key] || {}).forEach(([field, value]) => value && appendJsonThemeFilterPill(pills, `${tab.label}: ${field} ${value}`, () => {
      delete state.text[tab.key][field]; refreshJsonThemeResults(true);
    }));
    Object.entries(state.range[tab.key] || {}).forEach(([field, value]) => value !== '' && appendJsonThemeFilterPill(pills, `${tab.label}: ${field} ${state.operators[tab.key]?.[field] === 'lte' ? '<=' : '>='} ${value}`, () => {
      delete state.range[tab.key][field]; refreshJsonThemeResults(true);
    }));
    Object.entries(state.dropdown[tab.key] || {}).forEach(([field, values]) => values?.length && appendJsonThemeFilterPill(pills, `${tab.label}: ${field} (${values.length})`, () => {
      delete state.dropdown[tab.key][field]; refreshJsonThemeResults(true);
    }));
  });
  Object.entries(activeJsonThemeState.errors).forEach(([key, message]) => {
    const tab = config.tabs.find(item => item.key === key);
    const error = document.createElement('span');
    error.className = 'json-error';
    error.textContent = `${tab?.label || key}: ${message}`;
    pills.appendChild(error);
  });
}
function appendJsonThemeFilterPill(parent, label, clear) {
  const pill = document.createElement('span');
  pill.className = 'json-pill';
  pill.append(document.createTextNode(label));
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'x'; button.setAttribute('aria-label', `Clear ${label}`);
  button.onclick = clear;
  pill.appendChild(button); parent.appendChild(pill);
}
function renderJsonThemeColumnFilters() {
  const config = activeJsonThemeConfig();
  const tab = config.tabs.find(item => item.key === activeJsonThemeState.tab) || config.tabs[0];
  const controlsByField = new Map();
  jsonThemeColumns(tab.key).forEach(field => {
    const control = document.createElement('div');
    control.className = 'json-filter-control';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', `Filter by ${field}`);
    if (Object.hasOwn(config.rangeFilterColumns, field)) {
      const controls = document.createElement('span'); controls.className = 'range-control';
      const operator = document.createElement('button'); operator.type = 'button'; operator.className = 'range-operator';
      const operators = jsonThemeFilterBucket('operators', tab.key);
      operator.textContent = operators[field] === 'lte' ? '<=' : '>=';
      operator.title = `Toggle ${field} minimum or maximum`;
      operator.setAttribute('aria-label', `Toggle ${field} comparison`);
      operator.onclick = () => {
        operators[field] = operators[field] === 'lte' ? 'gte' : 'lte';
          refreshJsonThemeResults(true);
      };
      const input = document.createElement('input'); input.type = 'number'; input.value = jsonThemeFilterBucket('range', tab.key)[field] || '';
      input.dataset.jsonFilter = `${tab.key}:${field}:range`;
      input.setAttribute('aria-label', `Filter ${field}`);
      input.oninput = () => { jsonThemeFilterBucket('range', tab.key)[field] = input.value; refreshJsonThemeResults(true); };
      controls.append(operator, input); control.appendChild(controls);
    } else if ((config.dropdownColumns || []).includes(field)) {
      control.appendChild(buildJsonThemeDropdown(tab.key, field));
    } else {
      const input = document.createElement('input'); input.type = 'search'; input.value = jsonThemeFilterBucket('text', tab.key)[field] || '';
      input.dataset.jsonFilter = `${tab.key}:${field}:text`;
      input.setAttribute('aria-label', `Filter ${field}`);
      input.oninput = () => { jsonThemeFilterBucket('text', tab.key)[field] = input.value; refreshJsonThemeResults(true); };
      control.appendChild(input);
    }
    controlsByField.set(field, control);
  });
  return controlsByField;
}
function positionOpenJsonThemeDropdown() {
  const key = activeJsonThemeState.openDropdown;
  if (!key) return;
  const trigger = [...$('tablewrap').querySelectorAll('.json-dropdown-trigger')]
    .find(button => button.dataset.jsonFilter === `${key}:trigger`);
  const panel = trigger?.nextElementSibling;
  if (!trigger || !panel) return;
  const bounds = trigger.getBoundingClientRect();
  const width = Math.min(280, innerWidth - 24);
  const height = panel.getBoundingClientRect().height;
  panel.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - width - 8))}px`;
  const below = bounds.bottom + 4;
  const top = below + height <= innerHeight - 8 ? below : bounds.top - height - 4;
  panel.style.top = `${Math.max(8, top)}px`;
}
///////////////////////////////////////////////////////////////////////////
// Renders dataset tabs with counts and their configured help controls.
///////////////////////////////////////////////////////////////////////////
function renderJsonThemeTabs() {
  const config = activeJsonThemeConfig();
  closeJsonThemeHelp();
  const tabs = $('tabs'); tabs.replaceChildren();
  const available = config.tabs.filter(tab => !activeJsonThemeState.hiddenTabs.has(tab.key));
  if (!available.some(tab => tab.key === activeJsonThemeState.tab)) activeJsonThemeState.tab = available[0]?.key || config.tabs[0].key;
  available.forEach(tab => {
    const rows = activeJsonThemeState.visibleRows[tab.key] || [];
    const group = document.createElement('span'); group.className = 'json-tab-group';
    const button = document.createElement('button');
    button.type = 'button'; button.className = `tab${activeJsonThemeState.tab === tab.key ? ' on' : ''}`;
    button.textContent = `${tab.label} (${rows.length})`;
    button.onclick = () => { activeJsonThemeState.tab = tab.key; renderJsonThemeControls(); renderJsonThemeTabs(); renderJsonThemeTable(); };
    group.appendChild(button);
    if (tab.help?.content) {
      const help = document.createElement('button');
      help.type = 'button'; help.className = 'json-tab-help'; help.textContent = '?';
      help.title = tab.help.title || `Help for ${tab.label}`;
      help.setAttribute('aria-label', help.title);
      help.setAttribute('aria-haspopup', 'dialog');
      help.setAttribute('aria-expanded', 'false');
      help.onpointerenter = () => showJsonThemeHelp(tab, help);
      help.onpointerleave = scheduleJsonThemeHelpClose;
      help.onfocus = () => showJsonThemeHelp(tab, help);
      help.onblur = scheduleJsonThemeHelpClose;
      help.onclick = event => {
        event.stopPropagation();
        if (jsonThemeHelpPopover?.trigger === help && jsonThemeHelpPopover.pinned) closeJsonThemeHelp();
        else showJsonThemeHelp(tab, help, true);
      };
      help.onkeydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); closeJsonThemeHelp(true); }
      };
      group.appendChild(help);
    }
    if (tab.hideable) {
      const hide = document.createElement('button'); hide.type = 'button'; hide.className = 'json-tab-hide';
      hide.textContent = 'x'; hide.title = `Hide ${tab.label}`; hide.setAttribute('aria-label', `Hide ${tab.label}`);
      hide.onclick = () => {
        activeJsonThemeState.hiddenTabs.add(tab.key);
        if (activeJsonThemeState.tab === tab.key) activeJsonThemeState.tab = available.find(item => item.key !== tab.key)?.key || config.tabs[0].key;
        renderJsonThemeControls(); renderJsonThemeTabs(); renderJsonThemeTable();
      };
      group.appendChild(hide);
    }
    tabs.appendChild(group);
  });
  if (activeJsonThemeState.hiddenTabs.size) {
    const show = document.createElement('select'); show.setAttribute('aria-label', 'Restore hidden dataset tab');
    const prompt = document.createElement('option'); prompt.value = ''; prompt.textContent = 'Show hidden tab'; show.appendChild(prompt);
    config.tabs.filter(tab => activeJsonThemeState.hiddenTabs.has(tab.key)).forEach(tab => {
      const option = document.createElement('option'); option.value = tab.key; option.textContent = tab.label; show.appendChild(option);
    });
    show.onchange = () => {
      if (show.value) activeJsonThemeState.hiddenTabs.delete(show.value);
      renderJsonThemeTabs();
    };
    tabs.appendChild(show);
  }
}
function buildJsonThemeDropdown(tabKey, field) {
  const key = `${tabKey}:${field}`;
  const wrapper = document.createElement('div'); wrapper.className = 'json-dropdown-wrapper';
  wrapper.addEventListener('click', event => event.stopPropagation());
  const selected = jsonThemeFilterBucket('dropdown', tabKey)[field] || [];
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'json-dropdown-trigger';
  trigger.dataset.jsonFilter = `${key}:trigger`;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', String(activeJsonThemeState.openDropdown === key));
  trigger.textContent = selected.length ? `${selected.length} selected` : 'Any value';
  trigger.title = selected.length ? selected.join(', ') : `Filter ${field}`;
  const panel = document.createElement('div'); panel.className = 'json-dropdown-panel';
  panel.hidden = activeJsonThemeState.openDropdown !== key;
  panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', `${field} values`);
  const search = document.createElement('input'); search.type = 'search'; search.className = 'json-dropdown-search';
  search.placeholder = 'Search values'; search.setAttribute('aria-label', `Search ${field} values`);
  search.dataset.jsonFilter = `${key}:search`;
  search.value = activeJsonThemeState.dropdownSearch[key] || '';
  const actions = document.createElement('div'); actions.className = 'json-dropdown-actions';
  const options = [...new Set(jsonThemeDropdownRows(tabKey, field)
    .map(row => row[field]).filter(value => value != null).map(String).concat(selected))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const optionList = document.createElement('div'); optionList.className = 'json-dropdown-options';
  optionList.setAttribute('role', 'listbox'); optionList.setAttribute('aria-multiselectable', 'true');
  optionList.setAttribute('aria-label', `${field} options`);
  const updateSearch = () => {
    const term = search.value.trim().toLocaleLowerCase();
    activeJsonThemeState.dropdownSearch[key] = search.value;
    optionList.querySelectorAll('.json-dropdown-option').forEach(option => {
      option.hidden = !option.dataset.optionValue.toLocaleLowerCase().includes(term);
    });
  };
  search.oninput = updateSearch;
  const addAction = (text, handler) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.onclick = handler; actions.appendChild(button);
  };
  addAction('Select all', () => {
    jsonThemeFilterBucket('dropdown', tabKey)[field] = [...options];
    refreshJsonThemeResults(true);
  });
  addAction('Clear', () => {
    delete jsonThemeFilterBucket('dropdown', tabKey)[field];
    refreshJsonThemeResults(true);
  });
  options.forEach(value => {
    const option = document.createElement('label'); option.className = 'json-dropdown-option';
    option.dataset.optionValue = value;
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.includes(value);
    checkbox.dataset.jsonFilter = `${key}:option:${value}`;
    checkbox.onchange = () => {
      const next = new Set(jsonThemeFilterBucket('dropdown', tabKey)[field] || []);
      if (checkbox.checked) next.add(value); else next.delete(value);
      jsonThemeFilterBucket('dropdown', tabKey)[field] = [...next];
      refreshJsonThemeResults(true);
    };
    const text = document.createElement('span'); text.textContent = value;
    option.append(checkbox, text); optionList.appendChild(option);
  });
  if (!options.length) { const empty = document.createElement('span'); empty.className = 'json-dropdown-empty'; empty.textContent = 'No values in this view'; optionList.appendChild(empty); }
  panel.append(search, actions, optionList);
  trigger.onclick = () => {
    const opening = activeJsonThemeState.openDropdown !== key;
    activeJsonThemeState.openDropdown = activeJsonThemeState.openDropdown === key ? null : key;
    renderJsonThemeTable();
    if (opening) requestAnimationFrame(() => $('tablewrap').querySelector('.json-dropdown-search')?.focus());
  };
  wrapper.append(trigger, panel);
  return wrapper;
}
document.addEventListener('pointerdown', event => {
  if (activeJsonThemeState.openDropdown && !event.target.closest('.json-dropdown-wrapper')) {
    activeJsonThemeState.openDropdown = null;
    document.querySelectorAll('.json-dropdown-panel:not([hidden])').forEach(panel => { panel.hidden = true; });
    document.querySelectorAll('.json-dropdown-trigger[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  }
});
function jsonThemeSafeUrl(value) {
  return safeExternalUrl(value, location.href);
}
function jsonThemeCell(row, tabKey, field) {
  const config = activeJsonThemeConfig();
  const value = row[field];
  const cellEl = document.createElement('td');
  if (value == null || value === '') { cellEl.textContent = '\u2014'; return cellEl; }
  const rawUrl = typeof value === 'string' && /^(https?|ftp):\/\//i.test(value) ? jsonThemeSafeUrl(value) : null;
  if (rawUrl) {
    const link = document.createElement('a'); link.href = rawUrl; link.textContent = config.urlFields?.[field] || 'View';
    link.target = '_blank'; link.rel = 'noopener noreferrer'; cellEl.appendChild(link);
  } else {
    cellEl.textContent = typeof value === 'number' && !config.nonNumericColumns?.includes(field) ? value.toFixed(2) : String(value);
  }
  cellEl.title = String(value);
  const computed = (config.computedLinks || []).find(definition => definition.field === field);
  if (computed) {
    const base = computed.baseKey ? config.urlBases?.[computed.baseKey] : computed.prefix;
    const url = jsonThemeSafeUrl(`${base || ''}${encodeURIComponent(value)}${computed.suffix || ''}`);
    if (url) {
      const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.className = 'computed-link-icon'; link.title = computed.title || 'Open link'; link.textContent = '\u2197';
      cellEl.appendChild(link);
    }
  }
  activeJsonThemeState.deploymentLinks.filter(link =>
    (link.sourceDeployment || config.deploymentId) === config.deploymentId &&
    link.sourceTab === tabKey && link.sourceColumn === field
  ).forEach(link => {
    const target = activeJsonThemeState.deployments.find(item => item.id === link.targetDeployment);
    const targetUrl = target?.url || link.targetUrl;
    if (!targetUrl) return;
    const state = link.filterType === 'dropdown'
      ? { dropdown: { [link.targetTab]: { [link.targetColumn]: [String(value)] } } }
      : { search: { [link.targetTab]: { [link.targetColumn]: String(value) } } };
    const safeTarget = jsonThemeSafeUrl(targetUrl);
    if (!safeTarget) return;
    const targetLink = document.createElement('a');
    targetLink.href = `${safeTarget.replace(/\/$/, '')}#${btoa(unescape(encodeURIComponent(JSON.stringify(state))))}`;
    targetLink.target = '_blank'; targetLink.rel = 'noopener noreferrer'; targetLink.className = 'deployment-link-icon';
    targetLink.title = `Search in ${target?.title || link.targetTitle || 'linked deployment'}`;
    targetLink.textContent = '\u2197'; cellEl.appendChild(targetLink);
  });
  return cellEl;
}
///////////////////////////////////////////////////////////////////////////
// Builds the active dataset table, aligned filters, and sortable headers.
///////////////////////////////////////////////////////////////////////////
function renderJsonThemeTable() {
  const config = activeJsonThemeConfig();
  const tab = config.tabs.find(item => item.key === activeJsonThemeState.tab) || config.tabs[0];
  const rows = [...(activeJsonThemeState.visibleRows[tab.key] || [])];
  const sort = activeJsonThemeState.sort[tab.key];
  const focusedFilter = activeJsonThemeState.filterFocus || document.activeElement?.dataset.jsonFilter;
  const selection = activeJsonThemeState.filterSelection;
  if (sort) rows.sort((a, b) => String(a[sort.field] ?? '').localeCompare(String(b[sort.field] ?? ''), undefined, { numeric: true }) * (sort.direction === 'desc' ? -1 : 1));
  const columns = jsonThemeColumns(tab.key);
  const filterControls = renderJsonThemeColumnFilters();
  const headerRow = document.createElement('tr');
  const zoomHead = document.createElement('th'); zoomHead.textContent = 'Zoom'; zoomHead.title = 'Zoom to record'; headerRow.appendChild(zoomHead);
  columns.forEach(field => {
    const th = document.createElement('th');
    th.textContent = field;
    th.dataset.sortable = 'true';
    th.tabIndex = 0;
    th.setAttribute('aria-sort', sort?.field === field ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    th.title = `Sort by ${field}`;
    const sortByField = () => {
      const previous = activeJsonThemeState.sort[tab.key];
      activeJsonThemeState.sort[tab.key] = { field, direction: previous?.field === field && previous.direction === 'asc' ? 'desc' : 'asc' };
      renderJsonThemeTable();
    };
    th.onclick = sortByField;
    th.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sortByField(); }
    };
    headerRow.appendChild(th);
  });
  const filterRow = document.createElement('tr'); filterRow.className = 'json-filter-row';
  filterRow.appendChild(document.createElement('th'));
  columns.forEach(field => {
    const th = document.createElement('th');
    const control = filterControls.get(field);
    if (control) th.appendChild(control);
    filterRow.appendChild(th);
  });
  const wrap = $('tablewrap'); wrap.replaceChildren();
  const table = document.createElement('table');
  const head = table.createTHead(); head.append(headerRow, filterRow);
  table.createTBody(); wrap.appendChild(table);
  positionOpenJsonThemeDropdown();
  if (focusedFilter) {
    const replacement = [...wrap.querySelectorAll('[data-json-filter]')]
      .find(element => element.dataset.jsonFilter === focusedFilter);
    replacement?.focus();
    if (replacement instanceof HTMLInputElement && replacement.type === 'search' && selection?.start != null) {
      replacement.setSelectionRange(selection.start, selection.end);
    }
  }
  activeJsonThemeState.filterFocus = null;
  activeJsonThemeState.filterSelection = null;
  activeJsonThemeState.visibleRows[`${tab.key}:sorted`] = rows;
  wrap.onscroll = () => renderJsonThemeVirtualSlice(tab.key, columns);
  renderJsonThemeVirtualSlice(tab.key, columns);
}
function renderJsonThemeVirtualSlice(tabKey, columns) {
  const rows = activeJsonThemeState.visibleRows[`${tabKey}:sorted`] || [];
  const wrap = $('tablewrap');
  const body = wrap.querySelector('tbody');
  if (!body) return;
  const rowHeight = 32;
  const first = Math.max(0, Math.floor(wrap.scrollTop / rowHeight) - 8);
  const count = Math.ceil(wrap.clientHeight / rowHeight) + 16;
  const last = Math.min(rows.length, first + count);
  body.replaceChildren();
  if (first) {
    const spacer = body.insertRow(); const cell = spacer.insertCell(); cell.colSpan = columns.length + 1; cell.style.height = `${first * rowHeight}px`; cell.style.padding = '0';
  }
  rows.slice(first, last).forEach(row => {
    const tr = body.insertRow();
    tr.title = 'Click to zoom to this record';
    tr.onclick = event => {
      if (event.target.closest('a, button')) return;
      const config = activeJsonThemeConfig();
      const feature = activeJsonThemeState.featureById.get(String(row[config.linkField]));
      const center = feature && jsonGeometryCenter(feature.geometry);
      if (center) map.flyTo({ center, zoom: Math.max(map.getZoom(), 14) });
    };
    const action = tr.insertCell();
    const config = activeJsonThemeConfig();
    const zoom = document.createElement('button'); zoom.type = 'button'; zoom.className = 'json-row-zoom';
    zoom.title = `Zoom to ${row[config.labelField] || row[config.linkField]}`;
    zoom.setAttribute('aria-label', zoom.title);
    zoom.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4"></circle><path d="m16 16 4.5 4.5"></path></svg>';
    zoom.onclick = () => {
      const feature = activeJsonThemeState.featureById.get(String(row[config.linkField]));
      const center = feature && jsonGeometryCenter(feature.geometry);
      if (center) map.flyTo({ center, zoom: Math.max(map.getZoom(), 14) });
    };
    action.appendChild(zoom);
    columns.forEach(field => tr.appendChild(jsonThemeCell(row, tabKey, field)));
  });
  if (last < rows.length) {
    const spacer = body.insertRow(); const cell = spacer.insertCell(); cell.colSpan = columns.length + 1; cell.style.height = `${(rows.length - last) * rowHeight}px`; cell.style.padding = '0';
  }
}
let jsonThemeHelpPopover = null;
function jsonThemeHelpContent(tab) {
  const content = document.createElement('div');
  content.className = 'json-help-content';
  const parsed = new DOMParser().parseFromString(tab.help?.content || '', 'text/html');
  const allowed = new Set(['P', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'A', 'BR']);
  const copy = (source, target) => [...source.childNodes].forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) target.appendChild(document.createTextNode(node.textContent));
    else if (allowed.has(node.nodeName)) {
      const element = document.createElement(node.nodeName.toLowerCase());
      if (node.nodeName === 'A') {
        const href = jsonThemeSafeUrl(node.getAttribute('href'));
        if (href) { element.href = href; element.target = '_blank'; element.rel = 'noopener noreferrer'; }
      }
      copy(node, element); target.appendChild(element);
    } else copy(node, target);
  });
  copy(parsed.body, content);
  return content;
}
function positionJsonThemeHelpPopover() {
  const state = jsonThemeHelpPopover;
  if (!state) return;
  const bounds = state.trigger.getBoundingClientRect();
  const popover = state.element;
  const width = Math.min(320, innerWidth - 24);
  const height = popover.getBoundingClientRect().height;
  popover.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - width - 12))}px`;
  const below = bounds.bottom + 8;
  popover.style.top = `${Math.max(12, below + height <= innerHeight - 12 ? below : bounds.top - height - 8)}px`;
}
function showJsonThemeHelp(tab, trigger, pin = false) {
  if (jsonThemeHelpPopover?.trigger === trigger) {
    clearTimeout(jsonThemeHelpPopover.closeTimer);
    jsonThemeHelpPopover.pinned ||= pin;
    return;
  }
  closeJsonThemeHelp();
  const element = document.createElement('section');
  element.className = 'json-help-popover';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-label', tab.help?.title || tab.label);
  element.id = 'jsonThemeHelpPopover';
  const header = document.createElement('header');
  const title = document.createElement('strong'); title.textContent = tab.help?.title || tab.label;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'json-help-close';
  close.textContent = '×'; close.setAttribute('aria-label', 'Close help');
  close.onclick = () => closeJsonThemeHelp(true);
  header.append(title, close);
  element.append(header, jsonThemeHelpContent(tab));
  element.onpointerenter = () => clearTimeout(jsonThemeHelpPopover?.closeTimer);
  element.onpointerleave = scheduleJsonThemeHelpClose;
  element.onfocusin = () => clearTimeout(jsonThemeHelpPopover?.closeTimer);
  element.onfocusout = event => {
    if (!element.contains(event.relatedTarget)) scheduleJsonThemeHelpClose();
  };
  document.body.appendChild(element);
  jsonThemeHelpPopover = { element, trigger, pinned: pin, closeTimer: null };
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', element.id);
  positionJsonThemeHelpPopover();
}
function scheduleJsonThemeHelpClose() {
  const state = jsonThemeHelpPopover;
  if (!state || state.pinned) return;
  clearTimeout(state.closeTimer);
  state.closeTimer = setTimeout(() => closeJsonThemeHelp(), 180);
}
function closeJsonThemeHelp(returnFocus = false) {
  const state = jsonThemeHelpPopover;
  if (!state) return;
  clearTimeout(state.closeTimer);
  state.trigger.setAttribute('aria-expanded', 'false');
  state.trigger.removeAttribute('aria-controls');
  state.element.remove();
  jsonThemeHelpPopover = null;
  if (returnFocus) state.trigger.focus();
}
document.addEventListener('pointerdown', event => {
  if (jsonThemeHelpPopover && !jsonThemeHelpPopover.element.contains(event.target) &&
      !jsonThemeHelpPopover.trigger.contains(event.target)) closeJsonThemeHelp();
});
function clearJsonThemeFilters() {
  activeJsonThemeState.filters.text = {};
  activeJsonThemeState.filters.range = {};
  activeJsonThemeState.filters.dropdown = {};
  activeJsonThemeState.specialFilter = null;
  activeJsonThemeState.sort = {};
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  refreshJsonThemeResults(true);
}
function jsonThemeShareState() {
  const center = map.getCenter();
  const range = {};
  Object.entries(activeJsonThemeState.filters.range).forEach(([tabKey, fields]) => {
    range[tabKey] = {};
    Object.entries(fields).forEach(([field, value]) => {
      if (value !== '' && Number.isFinite(Number(value))) {
        range[tabKey][field] = {
          value: Number(value),
          operator: activeJsonThemeState.filters.operators[tabKey]?.[field] || activeJsonThemeConfig().rangeFilterColumns[field]
        };
      }
    });
    if (!Object.keys(range[tabKey]).length) delete range[tabKey];
  });
  return {
    search: activeJsonThemeState.filters.text,
    range,
    dropdown: activeJsonThemeState.filters.dropdown,
    special: activeJsonThemeState.specialFilter,
    hiddenTabs: [...activeJsonThemeState.hiddenTabs],
    map: {
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch()
    }
  };
}
function decodeShareHash() {
  if (!location.hash || location.hash.length > 10000) return null;
  try {
    const decoded = decodeURIComponent(escape(atob(location.hash.slice(1))));
    return JSON.parse(decoded);
  } catch { return null; }
}
///////////////////////////////////////////////////////////////////////////
// Restores validated JSON theme filters and map position from the URL hash.
///////////////////////////////////////////////////////////////////////////
function restoreJsonThemeState() {
  const saved = decodeShareHash();
  if (!saved || typeof saved !== 'object') return;
  const config = activeJsonThemeConfig();
  const tabKeys = new Set(config.tabs.map(tab => tab.key));
  const knownColumns = new Map(config.tabs.map(tab => [tab.key, new Set(jsonThemeColumns(tab.key))]));
  const filters = saved.filters || {};
  const serialized = {
    text: filters.text || saved.search,
    range: filters.range || saved.range,
    operators: filters.operators || saved.operator,
    dropdown: filters.dropdown || saved.dropdown
  };
  ['text', 'range', 'operators', 'dropdown'].forEach(kind => {
    Object.entries(serialized[kind] || {}).forEach(([tabKey, entries]) => {
      if (!tabKeys.has(tabKey) || !entries || typeof entries !== 'object') return;
      const target = jsonThemeFilterBucket(kind, tabKey);
      Object.entries(entries).forEach(([field, value]) => {
        if (!knownColumns.get(tabKey).has(field)) return;
        if (kind === 'text' && typeof value === 'string') target[field] = value.slice(0, 500);
        else if (kind === 'range' && value !== '' && Number.isFinite(Number(typeof value === 'object' ? value.value : value))) {
          target[field] = Number(typeof value === 'object' ? value.value : value);
          if (typeof value === 'object' && ['gte', 'lte'].includes(value.operator)) jsonThemeFilterBucket('operators', tabKey)[field] = value.operator;
        }
        else if (kind === 'operators' && ['gte', 'lte'].includes(value)) target[field] = value;
        else if (kind === 'dropdown' && Array.isArray(value)) target[field] = value.filter(item => typeof item === 'string').slice(0, 100);
      });
    });
  });
  const special = saved.specialFilter || saved.special;
  if (config.tabs.some(tab => tab.key === special && tab.specialFilter)) activeJsonThemeState.specialFilter = special;
  if (Array.isArray(saved.hiddenTabs)) {
    const hideable = new Set(config.tabs.filter(tab => tab.hideable && !tab.isPrimary).map(tab => tab.key));
    activeJsonThemeState.hiddenTabs = new Set(saved.hiddenTabs.filter(key => hideable.has(key)));
  }
  const center = saved.map?.center || (Number.isFinite(saved.map?.lng) && Number.isFinite(saved.map?.lat) ? [saved.map.lng, saved.map.lat] : null);
  const zoom = saved.map?.zoom;
  const sessionView = startupSessionSnapshot?.view;
  if (sessionView && Array.isArray(sessionView.center) && Number.isFinite(sessionView.zoom)) {
    map.jumpTo({
      center: sessionView.center,
      zoom: sessionView.zoom,
      bearing: Number.isFinite(sessionView.bearing) ? sessionView.bearing : 0,
      pitch: Number.isFinite(sessionView.pitch) ? sessionView.pitch : 0
    });
    return;
  }
  if (Array.isArray(center) && center.length === 2 && center.every(Number.isFinite) &&
      Math.abs(center[0]) <= 180 && Math.abs(center[1]) <= 85.051129 &&
      Number.isFinite(zoom) && zoom >= 0 && zoom <= 28) map.jumpTo({ center, zoom });
}
///////////////////////////////////////////////////////////////////////////
// Copies the current map view, including JSON theme filters when applicable.
///////////////////////////////////////////////////////////////////////////
async function copyMapLink() {
  const url = new URL(location.href);
  const saved = sessionSnapshot();
  const state = {
    ...(activeJsonThemeState.active ? jsonThemeShareState() : {}),
    session: {
      version: saved.version,
      theme: saved.theme,
      view: saved.view,
      vector: Object.fromEntries(Object.entries(saved.vector).map(([id, layer]) =>
        [id, { selected: layer.selected }])),
      overlays: saved.overlays,
      themeOverlayVisibility: saved.theme ? {
        [saved.theme]: saved.themeOverlayVisibility[saved.theme] || {}
      } : {},
      basemaps: saved.basemaps,
      hiddenGroups: saved.hiddenGroups,
      terrain: saved.terrain
    }
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  if (encoded.length + 1 > 10000) {
    toast('Map link is too large to share.');
    return;
  }
  url.hash = encoded;
  if (uiV2 && isMobile() && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: document.title, url: url.href });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url.href);
    toast('Map link copied');
  } catch {
    window.prompt('Copy this map link', url.href);
  }
}
///////////////////////////////////////////////////////////////////////////
// Exports the current JSON theme result sets to a multi-sheet workbook.
///////////////////////////////////////////////////////////////////////////
function exportJsonThemeExcel() {
  ensureXlsx().then(xlsx => {
    const config = activeJsonThemeConfig();
    const workbook = xlsx.utils.book_new();
    config.tabs.forEach(tab => {
      const activeRows = jsonThemeRows(tab.key).filter(row => activeJsonThemeState.finalIds.has(row[config.linkField]));
      const rows = tab.isPrimary || tab.exportRows === 'filtered'
        ? filterJsonThemeRows(tab.key, activeRows)
        : activeRows;
      const clean = rows.map(row => Object.fromEntries(Object.entries(row).filter(([field]) => !config.hiddenColumns.includes(field))));
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(clean), tab.label.slice(0, 31));
    });
    xlsx.writeFile(workbook, `${config.title.replace(/\s+/g, '_')}_filtered.xlsx`);
    toast('Excel export prepared');
  }).catch(error => toast(`Excel export failed: ${error.message}`));
}
$('jsonClearBtn').onclick = clearJsonThemeFilters;
$('shareMapBtn').onclick = copyMapLink;
$('jsonExcelBtn').onclick = exportJsonThemeExcel;
const inViewGroups = [];
function styleLayerKey(layer) {
  return layer.metadata?.['theme-layer'] || layer['source-layer'];
}
function styleLayerLabel(style, key) {
  const layer = style.layers.find(candidate => styleLayerKey(candidate) === key);
  return layer?.metadata?.['legend-label'] || key.replace(/_/g, ' ');
}
function normalizeDatasetBounds(bounds) {
  const extent = Array.isArray(bounds) && bounds.length === 2 && bounds.every(point =>
    Array.isArray(point) && point.length === 2)
    ? [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]]
    : bounds;
  return Array.isArray(extent) && extent.length === 4 && extent.every(Number.isFinite) &&
    extent[0] >= -180 && extent[2] <= 180 && extent[1] >= -90 && extent[3] <= 90 &&
    extent[0] <= extent[2] && extent[1] <= extent[3] ? extent : null;
}
function geojsonBounds(data) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = coordinates => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
      bounds[0] = Math.min(bounds[0], coordinates[0]);
      bounds[1] = Math.min(bounds[1], coordinates[1]);
      bounds[2] = Math.max(bounds[2], coordinates[0]);
      bounds[3] = Math.max(bounds[3], coordinates[1]);
      return;
    }
    coordinates.forEach(visit);
  };
  const visitGeometry = geometry => {
    if (geometry?.type === 'GeometryCollection') geometry.geometries?.forEach(visitGeometry);
    else visit(geometry?.coordinates);
  };
  (data?.features || []).forEach(feature => visitGeometry(feature.geometry));
  return normalizeDatasetBounds(bounds);
}
function zoomToDatasetExtent(getBounds, label, maxZoom) {
  Promise.resolve().then(getBounds).then(bounds => {
    const extent = normalizeDatasetBounds(bounds);
    if (!extent) throw new Error('No valid geographic extent is available for this dataset.');
    const zoomLimit = typeof maxZoom === 'function' ? maxZoom() : maxZoom;
    if (extent[0] === extent[2] || extent[1] === extent[3]) {
      map.flyTo({ center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
        zoom: Number.isFinite(zoomLimit) ? zoomLimit : 14, duration: 700 });
    } else {
      map.fitBounds([[extent[0], extent[1]], [extent[2], extent[3]]], {
        padding: 40, maxZoom: Number.isFinite(zoomLimit) ? zoomLimit : 17, duration: 700
      });
    }
  }).catch(error => {
    const message = `Could not zoom to ${label}: ${error.message}`;
    console.error(message, error);
    toast(message);
  });
}
function zoomButton(label, getBounds, maxZoom) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tbtn dataset-zoom';
  button.innerHTML = ICON_ZOOM;
  button.title = `Zoom to ${label} extent`;
  button.setAttribute('aria-label', button.title);
  button.onclick = event => {
    event.stopPropagation();
    zoomToDatasetExtent(getBounds, label, maxZoom);
  };
  return button;
}
function vectorLayerBounds(layer, style) {
  const source = style.sources[layer.source];
  if (source?.bounds) return normalizeDatasetBounds(source.bounds);
  if (!/^pmtiles:\/\//.test(source?.url || '')) {
    throw new Error('Add bounds to the map source configuration to enable zoom-to-extent.');
  }
  const url = new URL(source.url.replace('pmtiles://', ''), location.href).href;
  return new pmtiles.PMTiles(url).getHeader().then(header =>
    normalizeDatasetBounds([header.minLon, header.minLat, header.maxLon, header.maxLat]));
}
async function overlayBounds(overlay) {
  if (overlay.bounds) return normalizeDatasetBounds(overlay.bounds);
  if (overlay.hillshade || overlay.contours) {
    if (!activeTerrainModel) throw new Error('No DEM is selected.');
    const metadata = await window.MaplibreCOGProtocol.getCogMetadata(
      new URL(activeTerrainModel.cog, location.href).href
    );
    return normalizeDatasetBounds(metadata.bbox);
  }
  if (overlay.cog) {
    const metadata = await window.MaplibreCOGProtocol.getCogMetadata(new URL(overlay.cog, location.href).href);
    return normalizeDatasetBounds(metadata.bbox);
  }
  if (overlay.geojson) {
    await loadGeojsonData(overlay.id);
    const loader = geojsonLoaders.get(overlay.id);
    if (loader?.status !== 'loaded') throw new Error(`Could not load ${overlay.name || overlay.id} to determine its extent.`);
    return geojsonBounds(loader.data);
  }
  throw new Error('Add geographic bounds to this layer configuration to enable zoom-to-extent.');
}
function overlayHasZoomableExtent(overlay) {
  if (arcgisLegendRequest(overlay)) return false;
  return !!normalizeDatasetBounds(overlay.bounds) || !!overlay.cog || !!overlay.geojson ||
    !!overlay.hillshade || !!overlay.contours;
}
///////////////////////////////////////////////////////////////////////////
// Builds vector layer groups and controls from the active MapLibre style.
///////////////////////////////////////////////////////////////////////////
const vectorLegendController = createVectorLegendController({
  map,
  document,
  window,
  config: CONFIG,
  getLegendElement: () => $('legend'),
  addGroup,
  styleLayerKey,
  colorClasses,
  styleLayerLabel,
  layerTools,
  infoFor,
  setTransparency,
  zoomButton,
  vectorLayerBounds,
  collapser,
  categoryController: legendCategoryController,
  swatch,
  formatFilter: fmtFilter,
  escapeHtml: esc,
  registerLayerVisibility,
  setLayerVisibility: setVis,
  setThemeVisibility,
  controls: ctl,
  inViewGroups
});
function buildLegend() {
  vectorLegendController.build();
}

// ---------- Scale visibility ----------
let scaleInfo = {}, archiveMax = null;
///////////////////////////////////////////////////////////////////////////
// Loads PMTiles and style zoom limits used to describe layer scale visibility.
///////////////////////////////////////////////////////////////////////////
async function loadScaleInfo() {
  const st = map.getStyle();
  try {
    const src = Object.values(st.sources).find(s => s.type === 'vector' && /^pmtiles:\/\//.test(s.url || ''));
    if (src) {
      const pm = new pmtiles.PMTiles(new URL(src.url.replace('pmtiles://', ''), location.href).href);
      const [h, md] = await Promise.all([pm.getHeader(), pm.getMetadata()]);
      archiveMax = h.maxZoom;
      let vl = md.vector_layers;
      if (!vl && typeof md.json === 'string') vl = JSON.parse(md.json).vector_layers;
      (vl || []).forEach(v => {
        if (typeof v.minzoom === 'number' || typeof v.maxzoom === 'number') {
          st.layers.filter(layer => layer['source-layer'] === v.id).forEach(layer => {
            scaleInfo[styleLayerKey(layer)] = { tile: true, min: v.minzoom ?? 0, max: v.maxzoom ?? Infinity };
          });
        }
      });
    }
  } catch (e) { console.warn('Could not read PMTiles metadata', e); }
  const bySl = {};
  st.layers.filter(l => l['source-layer']).forEach(l => (bySl[styleLayerKey(l)] ||= []).push(l));
  Object.entries(bySl).forEach(([sl, ls]) => {
    if (ls.some(l => l.minzoom != null || l.maxzoom != null))
      scaleInfo[sl] = { tile: false, min: Math.min(...ls.map(l => l.minzoom ?? 0)), max: Math.max(...ls.map(l => l.maxzoom ?? 24)) };
  });
  Object.entries(CONFIG.layerZooms).forEach(([sl, [a, b]]) => scaleInfo[sl] = { tile: true, min: a, max: b });
  (CONFIG.overlays || []).filter(w => w.geojson && (w.minzoom != null || w.maxzoom != null)).forEach(w => {
    scaleInfo[w.id] = { tile: false, min: w.minzoom ?? 0, max: w.maxzoom ?? 24 };
  });
}
function scaleState(sl) {
  const s = scaleInfo[sl];
  if (!s) return { hidden: false };
  const z = map.getZoom(), tz = Math.floor(z);
  if (s.tile) {
    const top = (archiveMax != null && s.max >= archiveMax) ? Infinity : s.max;
    if (tz < s.min) return { hidden: true, msg: `zoom in to level ${s.min}` };
    if (tz > top) return { hidden: true, msg: `zoom out below level ${s.max + 1}` };
  } else {
    if (z < s.min) return { hidden: true, msg: `zoom in to level ${s.min}` };
    if (z >= s.max) return { hidden: true, msg: `zoom out below level ${s.max}` };
  }
  return { hidden: false };
}
function updateScaleState() {
  if (!map.getStyle()) return;
  const update = (element, id) => {
    const s = scaleState(id);
    element.classList.toggle('offscale', s.hidden);
    const label = element.querySelector('.grp');
    if (label) label.title = s.hidden ? `Not visible at this scale – ${s.msg}` : '';
  };
  document.querySelectorAll('#legend [data-sl]').forEach(element => update(element, element.dataset.sl));
  document.querySelectorAll('#legend [data-scale-id]').forEach(element => update(element, element.dataset.scaleId));
}
map.on('zoom', updateScaleState);
// Per-layer `filterlegend` groups list only categories present in the current view.
///////////////////////////////////////////////////////////////////////////
// Updates data-driven legend classes to reflect features in the current view.
///////////////////////////////////////////////////////////////////////////
const legendInViewController = createLegendInViewController({
  map,
  getGroups: () => [...inViewGroups, ...geojsonInViewGroups],
  getScaleState: scaleState
});
legendInViewController.attach();

// ---------- Overlays (ArcGIS MapServer, WMS or XYZ) ----------
function wmsTileUrl(w) {
  const v = w.version || '1.3.0';
  return w.url + (w.url.includes('?') ? '&' : '?') +
    `service=WMS&version=${v}&request=GetMap&layers=${encodeURIComponent(w.layers)}&styles=${w.styles || ''}` +
    `&format=${w.format || 'image/png'}&transparent=true&${v === '1.3.0' ? 'crs' : 'srs'}=EPSG:3857` +
    `&width=256&height=256&bbox={bbox-epsg-3857}`;
}
function arcgisTileUrl(w) {
  const m = w.url.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
  const base = m ? m[1] : w.url;
  const ids = w.layers || (m && m[2]);
  return `${base}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&dpi=96` +
    `&format=png32&transparent=true&f=image` + (ids ? `&layers=show:${ids}` : '');
}
function arcgisLegendRequest(w) {
  return arcgisLegendController.request(w);
}
const overlayTileUrl = w => w.tiles || (/\/MapServer/i.test(w.url) ? arcgisTileUrl(w) : wmsTileUrl(w));
let originalStyleIds = null;
function validRasterEntries(entries, label, reserved = []) {
  const ids = new Set(reserved);
  return entries.filter(w => {
    if (!w || !w.id || (!w.url && !w.tiles && !w.cog)) { console.warn(`${label} skipped: needs id and url, tiles, or cog`, w); return false; }
    if (ids.has(w.id)) { console.warn(`${label} skipped: duplicate id`, w.id); return false; }
    ids.add(w.id);
    return true;
  });
}
function reservedRasterIds() {
  if (originalStyleIds) return [...originalStyleIds];
  const style = map.getStyle();
  return [...Object.keys(style.sources), ...style.layers.map(l => l.id)];
}
function validOverlays() {
  return validRasterEntries(CONFIG.overlays || [], 'Overlay', reservedRasterIds());
}
function validBasemaps() {
  return validRasterEntries(CONFIG.basemaps || [], 'Basemap', [...reservedRasterIds(), ...validOverlays().map(w => w.id)]);
}
function reverseWithinGroups(entries) {
  const groups = new Map();
  entries.forEach(entry => {
    const key = entry.group || 'Overlays';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  return [...groups.values()].flatMap(group => group.slice().reverse());
}
function overlayInitiallyInTheme(w) {
  return w.global === true || !Array.isArray(CONFIG.themes) || CONFIG.themes.length === 0;
}
const arcgisLegendController = createArcgisLegendController({
  map,
  document,
  getOverlays: validOverlays,
  baseUrl: location.href
});
///////////////////////////////////////////////////////////////////////////
// Adds a configured raster overlay or basemap to the MapLibre style.
///////////////////////////////////////////////////////////////////////////
function reprojectCoords(c, from) {
  return typeof c[0] === 'number' ? proj4(from, 'EPSG:4326', c.slice(0, 2)) : c.map(x => reprojectCoords(x, from));
}
const geojsonLayerController = createGeojsonLayerController({
  map,
  loaders: geojsonLoaders,
  registerLayerVisibility,
  isInitiallyInTheme: overlayInitiallyInTheme
});
const geojsonStyleController = createGeojsonStyleController({
  map,
  document,
  loaders: geojsonLoaders,
  getFieldFromExpression: fieldOf,
  renderLegend: renderGeojsonLegend,
  toast
});
const COG_QUANTILE_CLASS_COUNT = Number.isInteger(CONFIG.cogStyleDefaults?.quantileStops) &&
  CONFIG.cogStyleDefaults.quantileStops >= 2
  ? CONFIG.cogStyleDefaults.quantileStops
  : COG_DEFAULT_QUANTILE_STOPS;
const COG_PERCENTILE_MIN = 0.02;
const COG_PERCENTILE_MAX = 0.98;
const COG_HILLSHADE_TARGET_RANGE = 100;
const COG_HILLSHADE_MAX_VERTICAL_SCALE = 1000;
const COG_HILLSHADE_SLIDER_MAX = 100;
const COG_HILLSHADE_DEFAULTS = {
  direction: 315,
  altitude: 45,
  strength: 0.2,
  shadowColor: '#000000',
  highlightColor: '#ffffff',
  accentColor: '#000000'
};
const COG_CONTOUR_DEFAULTS = {
  intervals: { minor: 10, major: 50 },
  colors: { minor: '#808384', major: '#30383b' }
};
const isHexColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
function cogContourSettings(overlay, saved) {
  const option = overlay.contour_option === true || overlay.contour_option === 'true';
  if (!option) {
    return {
      option: false,
      enabled: false,
      preferenceSet: false,
      intervals: { ...COG_CONTOUR_DEFAULTS.intervals },
      colors: { ...COG_CONTOUR_DEFAULTS.colors }
    };
  }
  const configuredIntervals = saved?.contourIntervals || overlay.contour_intervals || COG_CONTOUR_DEFAULTS.intervals;
  const intervals = { minor: Number(configuredIntervals.minor), major: Number(configuredIntervals.major) };
  if (!(Number.isFinite(intervals.minor) && intervals.minor > 0 &&
        Number.isFinite(intervals.major) && intervals.major > intervals.minor)) {
    const message = `Invalid contour_intervals for ${overlay.name || overlay.id}; use positive minor and larger major intervals.`;
    console.error(message, configuredIntervals);
    toast(message);
    intervals.minor = COG_CONTOUR_DEFAULTS.intervals.minor;
    intervals.major = COG_CONTOUR_DEFAULTS.intervals.major;
  }
  const configuredColors = saved?.contourColors || overlay.contour_colors || COG_CONTOUR_DEFAULTS.colors;
  const colors = { ...COG_CONTOUR_DEFAULTS.colors, ...configuredColors };
  Object.keys(COG_CONTOUR_DEFAULTS.colors).forEach(key => {
    if (!isHexColor(colors[key])) {
      const message = `Invalid ${key} contour color for ${overlay.name || overlay.id}; using the default color.`;
      console.error(message, colors[key]);
      toast(message);
      colors[key] = COG_CONTOUR_DEFAULTS.colors[key];
    }
  });
  const preferenceSet = saved?.contourPreferenceSet === true;
  return {
    option,
    enabled: option && (preferenceSet && typeof saved.contoursEnabled === 'boolean' ? saved.contoursEnabled : true),
    preferenceSet,
    intervals,
    colors
  };
}
async function scaleCogDemTile(bitmap, scale, center) {
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not process a COG hillshade tile.');
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close?.();
  for (let index = 0; index < image.data.length; index += 4) {
    if (!image.data[index + 3]) continue;
    const encoded = image.data[index] * 65536 + image.data[index + 1] * 256 + image.data[index + 2];
    const elevation = encoded * 0.1 - 10000;
    const scaled = Math.max(0, Math.min(0xffffff,
      Math.round((center + (elevation - center) * scale + 10000) * 10)));
    image.data[index] = scaled >> 16;
    image.data[index + 1] = scaled >> 8 & 255;
    image.data[index + 2] = scaled & 255;
  }
  context.putImageData(image, 0, 0);
  return createImageBitmap(image);
}
function cogValueLabel(value) {
  return Number(value.toPrecision(7)).toString();
}
function cogLegendValueLabel(value) {
  return value.toFixed(2);
}
function cogLegendClassLabel(label) {
  return label.replace(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i,
    value => cogLegendValueLabel(Number(value)));
}
function cogHillshadeSliderValue(scale) {
  return Math.round(1 + Math.log10(scale) / Math.log10(COG_HILLSHADE_MAX_VERTICAL_SCALE) *
    (COG_HILLSHADE_SLIDER_MAX - 1));
}
function cogHillshadeScaleFromSlider(value) {
  return Math.round(10 ** ((value - 1) / (COG_HILLSHADE_SLIDER_MAX - 1) *
    Math.log10(COG_HILLSHADE_MAX_VERTICAL_SCALE)));
}
function cogPercentileRange(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = fraction => {
    const index = fraction * (sorted.length - 1);
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);
    return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * (index - lowerIndex);
  };
  const min = percentile(COG_PERCENTILE_MIN);
  const max = percentile(COG_PERCENTILE_MAX);
  if (!(min < max)) return null;
  return { min, max };
}
function cogDisplayRange(state) {
  return state.mode === 'percentile' ? state.percentileRange : { min: state.rangeMin, max: state.rangeMax };
}
function cogQgisColorStops(state) {
  const colors = COG_RAMP_COLORS[state.ramp] || QGIS_TURBO_COLORS;
  const range = state.mode === 'percentile'
    ? state.percentileRange
    : { min: state.rangeMin, max: state.rangeMax };
  return buildCogQgisColorStops({
    colors,
    mode: state.mode,
    classes: state.classes,
    quantileBounds: state.quantileBounds,
    minimum: range?.min,
    maximum: range?.max,
    stopCount: COG_QUANTILE_CLASS_COUNT,
    formatValue: cogValueLabel
  });
}
async function prepareCogQgisStyle(w) {
  const state = w.cogState;
  if (state.bandCount === 1 && Number.isFinite(state.rangeMin) && state.quantileBounds.length > 1) return true;
  const metadata = await window.MaplibreCOGProtocol.getCogMetadata(state.url);
  state.bandCount = metadata.bitsPerSample?.length || 0;
  if (state.bandCount !== 1) return false;
  const range = await sampleCogValueRange(state.url, metadata, window.MaplibreCOGProtocol, () => true);
  state.rangeMin = range.min;
  state.rangeMax = range.max;
  state.quantileBounds = cogQuantileBounds(range.values, COG_QUANTILE_CLASS_COUNT);
  state.percentileRange = cogPercentileRange(range.values);
  return true;
}
function effectiveCogHillshadeStrength(state) {
  return state.hillshadeStrength * state.opacity;
}
const cogRampControlsController = createCogRampControlsController({
  map,
  document,
  window,
  Option,
  quantileClassCount: COG_QUANTILE_CLASS_COUNT,
  hillshadeMaxVerticalScale: COG_HILLSHADE_MAX_VERTICAL_SCALE,
  hillshadeSliderMax: COG_HILLSHADE_SLIDER_MAX,
  hillshadeTargetRange: COG_HILLSHADE_TARGET_RANGE,
  displayRange: cogDisplayRange,
  legendValueLabel: cogLegendValueLabel,
  legendClassLabel: cogLegendClassLabel,
  percentileRange: cogPercentileRange,
  hillshadeSliderValue: cogHillshadeSliderValue,
  hillshadeScaleFromSlider: cogHillshadeScaleFromSlider,
  isOverlayVisible: isCogOverlayVisible,
  updateColorLayers: updateCogColorLayers,
  syncLayerMode: syncCogLayerMode,
  createHillshade: createCogHillshade,
  effectiveHillshadeStrength: effectiveCogHillshadeStrength,
  refreshHillshade: refreshCogHillshade,
  refreshContours: refreshCogContours,
  getCursorPosition: () => cursorPosition,
  scheduleCursorValues: scheduleCogCursorValues,
  toast
});
function initializeCogRampControls(overlay, panel, legend) {
  cogRampControlsController.initialize(overlay, panel, legend);
}
function refreshCogHillshade(w) {
  const state = w.cogState;
  if (!state.hillshadeCreated) return;
  map.removeLayer(state.hillshadeLayerId);
  map.removeSource(state.hillshadeSourceId);
  state.hillshadeCreated = false;
  createCogHillshade(w);
  syncCogLayerMode(w);
}
function setCogDerivedLayerSelected(w, id, selected) {
  const layerState = layerVisibility.get(id);
  const baseState = layerVisibility.get(w.id);
  if (!layerState) {
    layerVisibility.set(id, {
      selected,
      inTheme: baseState?.inTheme ?? true,
      groups: new Set(baseState?.groups || [])
    });
  } else layerState.selected = selected;
  syncLayerVisibility(id);
}
function syncCogLayerMode(w) {
  const state = w.cogState;
  if (!state) return;
  const enabled = state.visible;
  const rampActive = !!state.ramp && state.colorLayerIds.length > 0;
  setCogDerivedLayerSelected(w, w.id, enabled && !rampActive);
  state.colorLayerIds.forEach(id => setCogDerivedLayerSelected(w, id, enabled && rampActive));
  if (state.hillshadeCreated) {
    setCogDerivedLayerSelected(w, state.hillshadeLayerId, enabled && state.hillshadeEnabled);
  }
  if (state.contoursCreated) {
    state.contourLayerIds.forEach(id => setCogDerivedLayerSelected(w, id, enabled && state.contoursEnabled));
  }
}
function isCogOverlayVisible(w) {
  const state = w.cogState;
  if (!state) return false;
  return [w.id, ...state.colorLayerIds, ...(state.hillshadeCreated ? [state.hillshadeLayerId] : [])]
    .some(id => {
      const visibility = layerVisibility.get(id);
      return map.getLayer(id) && visibility?.selected && visibility.inTheme && !visibility.groups.size;
    });
}
function initializeVisibleCogControls() {
  const visible = allOverlays().filter(w => w.cogState && isCogOverlayVisible(w));
  if (!visible.length) return;
  if (!cogProtocolRegistered) {
    ensureCogProtocol()
      .then(initializeVisibleCogControls)
      .catch(error => toast(`Could not load COG support: ${error.message}`));
    return;
  }
  visible.forEach(w => {
    const state = w.cogState;
    if (state.contourOption && state.contoursEnabled) createCogContours(w);
    if (state.controlsPanel && state.controlsLegend) initializeCogRampControls(w, state.controlsPanel, state.controlsLegend);
  });
}
function removeCogColorLayers(w) {
  const state = w.cogState;
  state.colorLayerIds.forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
    const sourceId = `${id}-source`;
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    layerVisibility.delete(id);
    w.groupLayerIds?.delete(id);
    const layerIndex = w.layerIds.indexOf(id);
    if (layerIndex >= 0) w.layerIds.splice(layerIndex, 1);
  });
  state.colorLayerIds = [];
}
function addCogColorLayers(w) {
  const state = w.cogState;
  const range = cogDisplayRange(state);
  const colors = state.mode === 'classes'
    ? cogClassColorLut(COG_RAMP_COLORS[state.ramp], state.classes, range.min, range.max)
    : state.mode === 'quantile'
      ? cogQuantileRampColors(COG_RAMP_COLORS[state.ramp], state.quantileBounds, COG_QUANTILE_CLASS_COUNT)
      : COG_RAMP_COLORS[state.ramp];
  const addLayer = (sourceUrl, index) => {
    const id = `${w.id}__cog_color_${index}`;
    const sourceId = `${id}-source`;
    state.colorLayerIds.push(id);
    const hillshadeIndex = w.layerIds.indexOf(state.hillshadeLayerId);
    w.layerIds.splice(hillshadeIndex < 0 ? w.layerIds.length : hillshadeIndex, 0, id);
    w.groupLayerIds?.add(id);
    map.addSource(sourceId, {
      type: 'raster',
      url: sourceUrl,
      tileSize: w.tileSize || 256,
      ...(Number.isFinite(w.maxzoom) ? { maxzoom: w.maxzoom } : {})
    });
    map.addLayer({
      id,
      type: 'raster',
      source: sourceId,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': state.opacity }
    });
    setCogDerivedLayerSelected(w, id, state.visible);
  };
  const continuous = state.mode === 'classes' ? '' : ',c';
  const sourceUrl = cogResamplingUrl(
    `cog://${state.url}#color=${JSON.stringify(colors)},${cogValueLabel(range.min)},${cogValueLabel(range.max)}${continuous}`,
    state.resampling
  );
  addLayer(sourceUrl, 0);
}
function updateCogColorLayers(w) {
  const state = w.cogState;
  removeCogColorLayers(w);
  if (!state.ramp) {
    syncCogLayerMode(w);
    syncMapLayerOrder();
    return;
  }
  try {
    addCogColorLayers(w);
    syncCogLayerMode(w);
    syncMapLayerOrder();
  } catch (error) {
    removeCogColorLayers(w);
    state.ramp = '';
    syncCogLayerMode(w);
    throw error;
  }
}
function createCogHillshade(w) {
  const state = w.cogState;
  if (!state.hillshadeOption || state.hillshadeCreated) return;
  map.addSource(state.hillshadeSourceId, {
    type: 'raster-dem',
    url: cogResamplingUrl(
      `cog://${state.url}#dem&reliefScale=${state.hillshadeVerticalScale}&reliefCenter=${state.hillshadeVerticalCenter}`,
      state.resampling
    ),
    tileSize: w.tileSize || 256,
    ...(Number.isFinite(w.maxzoom) ? { maxzoom: w.maxzoom } : {})
  });
  map.addLayer({
    id: state.hillshadeLayerId,
    type: 'hillshade',
    source: state.hillshadeSourceId,
    layout: { visibility: 'none' },
    paint: {
      'hillshade-exaggeration': effectiveCogHillshadeStrength(state),
      'hillshade-illumination-direction': COG_HILLSHADE_DEFAULTS.direction,
      'hillshade-illumination-altitude': COG_HILLSHADE_DEFAULTS.altitude,
      'hillshade-illumination-anchor': 'map',
      'hillshade-shadow-color': COG_HILLSHADE_DEFAULTS.shadowColor,
      'hillshade-highlight-color': COG_HILLSHADE_DEFAULTS.highlightColor,
      'hillshade-accent-color': COG_HILLSHADE_DEFAULTS.accentColor
    }
  });
  state.hillshadeCreated = true;
  w.groupLayerIds?.add(state.hillshadeLayerId);
  setCogDerivedLayerSelected(w, state.hillshadeLayerId, state.visible && state.hillshadeEnabled);
  syncMapLayerOrder();
}
function addRasterLayer(w, beforeId, isBasemap = false) {
  if (w.geojson) return geojsonLayerController.add(w, beforeId);
  if (w.cog) return cogOverlayLayerController.addCogLayer(w, beforeId, isBasemap);
  const source = {
    type: 'raster',
    tileSize: w.tileSize || 256,
    tiles: Array.isArray(w.tiles) ? w.tiles : [overlayTileUrl(w)]
  };
  if (w.attribution) source.attribution = w.attribution;
  if (Number.isFinite(w.maxzoom)) source.maxzoom = w.maxzoom;
  map.addSource(w.id, source);
  const layer = {
    id: w.id, type: 'raster', source: w.id,
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': w.opacity ?? 1 }
  };
  if (Number.isFinite(w.minzoom)) layer.minzoom = w.minzoom;
  map.addLayer(layer, beforeId);
  registerLayerVisibility(w.id, w.visible === true, isBasemap || overlayInitiallyInTheme(w));
}

const terrainModels = normalizeTerrainModels(CONFIG.terrain || {});
let activeTerrainModel = null, terrainLayerBeforeId = null;
const terrainRangeValidator = createTerrainRangeValidator({ baseUrl: location.href });
const verifyTerrainRangeSupport = terrainRangeValidator.verify;
function reportTerrainRangeError(model, error) {
  const message = `Could not load ${model.name || model.id} terrain: ${error.message}`;
  console.error(message, error);
  toast(message);
}
function addTerrainModelSource(model, kind) {
  const sourceId = kind === 'hillshade' ? model.hillshadeSourceId : model.sourceId;
  if (map.getSource(sourceId)) return;
  const tc = CONFIG.terrain || {};
  const source = {
    type: 'raster-dem', url: 'cog://' + new URL(model.cog, location.href).href + '#dem',
    tileSize: model.tileSize || 256, attribution: model.attribution || tc.attribution || ''
  };
  if (Number.isFinite(model.maxzoom)) source.maxzoom = model.maxzoom;
  map.addSource(sourceId, source);
}
function addHillshadeLayer(model, beforeId, visible) {
  if (CONFIG.terrain?.hillshade === false || map.getLayer('hillshade')) return;
  addTerrainModelSource(model, 'hillshade');
  const layer = {
    id: 'hillshade', type: 'hillshade', source: model.hillshadeSourceId,
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: hillshadePaint()
  };
  if (beforeId && map.getLayer(beforeId)) map.addLayer(layer, beforeId);
  else map.addLayer(layer);
  if (layerVisibility.has('hillshade')) syncLayerVisibility('hillshade');
}
function ensurePendingCogLayer(w) {
  return cogOverlayLayerController.ensurePendingLayer(w);
}
const CONTOUR_SOURCE_ID = 'dtm-contour-source';
const CONTOUR_LINE_ID = 'dtm-contour-lines';
const CONTOUR_LABEL_ID = 'dtm-contour-labels';
const contourSettings = (CONFIG.terrain || {}).contours;
let contoursVisible = !!contourSettings && contourSettings.visible === true;
let contourDemSource = null, contourGeneration = 0;
const terrainControls = createTerrainControlsController({
  map,
  document,
  terrain: CONFIG.terrain || {},
  escapeHtml: esc,
  contourLineId: CONTOUR_LINE_ID,
  contourLabelId: CONTOUR_LABEL_ID
});
const { hillshadeStyle, contourColors } = terrainControls.state;
const {
  hillshadeMethods: HILLSHADE_METHODS,
  hillshadePaint,
  setHillshadeTransparency,
  setContourTransparency,
  contourLineColor,
  hillshadeControlsMarkup,
  bindHillshadeControls,
  contourControlsMarkup,
  bindContourControls
} = terrainControls;
function allOverlays() {   // configured overlays + the built-in hillshade
  const list = validOverlays(), t = CONFIG.terrain;
  if (t && terrainModels.length && t.contours !== false)
    list.push({ id: CONTOUR_LINE_ID, layerIds: [CONTOUR_LINE_ID, CONTOUR_LABEL_ID], name: contourSettings?.name || 'Contours', group: t.group || 'Terrain', contours: true, builtin: true, global: true, visible: contoursVisible, opacity: terrainControls.state.contourOpacity, info: contourSettings?.info });
  if (t && terrainModels.length && t.hillshade !== false)
    list.push({ id: 'hillshade', name: t.hillshadeName || 'Hillshade', group: t.group || 'Terrain', hillshade: true, builtin: true, global: t.allThemes !== false, visible: !!t.hillshadeVisible, opacity: 1, info: t.info });
  if (t && terrainModels.length)
    list.push({ id: 'terrain3d', name: '3D terrain', group: t.group || 'Terrain', terrain: true, builtin: true, global: true });
  return list;
}
const setOverlayTransparency = (w, v) => {
  if (w.hillshade) {
    setHillshadeTransparency(v);
  } else if (w.cogState) {
    cogOverlayLayerController.setOpacity(w, 1 - v / 100);
  } else if (w.contours) {
    setContourTransparency(v);
  } else if (w.geojson) {
    map.setPaintProperty(`${w.id}-fill`, 'fill-opacity', 1 - v / 100);
    map.setPaintProperty(w.id, 'line-opacity', 1 - v / 100);
    map.setPaintProperty(`${w.id}-points`, 'circle-opacity', 1 - v / 100);
    map.setPaintProperty(`${w.id}-points`, 'circle-stroke-opacity', 1 - v / 100);
  } else map.setPaintProperty(w.id, 'raster-opacity', 1 - v / 100);
};
function removeTerrainContours() {
  [CONTOUR_LABEL_ID, CONTOUR_LINE_ID].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource(CONTOUR_SOURCE_ID)) map.removeSource(CONTOUR_SOURCE_ID);
  contourDemSource = null;
}
const { getSource: getContourDemSource } = createCogContourSourceController({
  maplibregl,
  document
});
const cogOverlayLayerController = createCogOverlayLayerController({
  map,
  config: CONFIG,
  baseUrl: location.href,
  getStartupSnapshot: () => startupSessionSnapshot,
  getContourSettings: cogContourSettings,
  resamplingUrl: cogResamplingUrl,
  hillshadeDefaults: COG_HILLSHADE_DEFAULTS,
  registerLayerVisibility,
  isInitiallyInTheme: overlayInitiallyInTheme,
  layerVisibility,
  isProtocolRegistered: () => cogProtocolRegistered,
  ensureProtocol: ensureCogProtocol,
  syncLayerVisibility,
  initializeVisibleControls: initializeVisibleCogControls,
  effectiveHillshadeStrength: effectiveCogHillshadeStrength,
  notify: toast
});
///////////////////////////////////////////////////////////////////////////
// Creates contour sources and layers for the selected elevation model.
///////////////////////////////////////////////////////////////////////////
async function setupTerrainContours(model, beforeId = terrainLayerBeforeId) {
  const generation = ++contourGeneration;
  removeTerrainContours();
  if (contourSettings === false || !window.mlcontour || !window.MaplibreCOGProtocol) return;
  try {
    const cogUrl = new URL(model.cog, location.href).href;
    const metadata = await window.MaplibreCOGProtocol.getCogMetadata(cogUrl);
    if (generation !== contourGeneration) return;
    const zooms = (metadata.images || []).filter(image => !image.isMask).map(image => Math.round(image.zoom)).filter(Number.isFinite);
    const maxzoom = zooms.length ? Math.max(...zooms) : (model.maxzoom || 14);
    const source = getContourDemSource(cogUrl, maxzoom);
    const thresholds = contourSettings && contourSettings.thresholds || {
      8: [100, 500], 9: [100, 500], 10: [100, 500], 11: [100, 500],
      12: [50, 250], 13: [20, 100], 14: [10, 50], 15: [10, 50], 16: [5, 25]
    };
    map.addSource(CONTOUR_SOURCE_ID, {
      type: 'vector', tiles: [source.contourProtocolUrl({ thresholds })], maxzoom
    });
    const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
    map.addLayer({
      id: CONTOUR_LINE_ID, type: 'line', source: CONTOUR_SOURCE_ID, 'source-layer': 'contours',
      layout: { visibility: contoursVisible ? 'visible' : 'none' },
      paint: { 'line-color': contourLineColor(), 'line-opacity': terrainControls.state.contourOpacity,
        'line-width': ['match', ['get', 'level'], 1, 1.2, 0.7] }
    }, before);
    map.addLayer({
      id: CONTOUR_LABEL_ID, type: 'symbol', source: CONTOUR_SOURCE_ID, 'source-layer': 'contours',
      filter: ['>', ['get', 'level'], 0],
      layout: { visibility: contoursVisible ? 'visible' : 'none', 'symbol-placement': 'line',
        'text-size': 10, 'text-font': ['Noto Sans Regular'],
        'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' m'] },
      paint: { 'text-color': contourColors.major, 'text-opacity': terrainControls.state.contourOpacity,
        'text-halo-color': '#fff', 'text-halo-width': 1.2 }
    }, before);
    contourDemSource = source;
    [CONTOUR_LINE_ID, CONTOUR_LABEL_ID].forEach(id => {
      if (layerVisibility.has(id)) {
        const state = layerVisibility.get(id);
        state.selected = contoursVisible;
        syncLayerVisibility(id);
      } else registerLayerVisibility(id, contoursVisible);
    });
  } catch (error) {
    console.error(`Could not generate contours for ${model.name}:`, error);
  }
}
function cogContourThresholds(intervals, maxzoom) {
  const lastZoom = Math.max(0, Math.floor(maxzoom));
  return Object.fromEntries(Array.from({ length: lastZoom + 1 }, (_, zoom) =>
    [zoom, [intervals.minor, intervals.major]]));
}
function removeCogContours(w) {
  const state = w.cogState;
  if (!state) return;
  state.contourGeneration = (state.contourGeneration || 0) + 1;
  [...state.contourLayerIds].reverse().forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
    layerVisibility.delete(id);
  });
  if (map.getSource(state.contourSourceId)) map.removeSource(state.contourSourceId);
  state.contoursCreated = false;
}
function createCogContours(w) {
  const state = w.cogState;
  if (!state?.contourOption || !state.contoursEnabled || state.contoursCreated ||
      state.contourPromise || !isCogOverlayVisible(w)) return state?.contourPromise;
  if (!window.mlcontour || !window.MaplibreCOGProtocol) {
    state.contoursEnabled = false;
    if (state.contourToggle) state.contourToggle.checked = false;
    const message = `Could not create contours for ${w.name || w.id}: the COG contour protocol is unavailable.`;
    console.error(message);
    toast(message);
    return;
  }
  const generation = (state.contourGeneration || 0) + 1;
  state.contourGeneration = generation;
  const promise = (async () => {
    const metadata = await window.MaplibreCOGProtocol.getCogMetadata(state.url);
    if (generation !== state.contourGeneration || !state.contoursEnabled || !isCogOverlayVisible(w)) return;
    if (metadata.bitsPerSample?.length !== 1) {
      throw new Error('COG contouring requires a readable single-band raster.');
    }
    const zooms = (metadata.images || []).filter(image => !image.isMask)
      .map(image => Math.round(image.zoom)).filter(Number.isFinite);
    const maxzoom = zooms.length ? Math.max(...zooms) : (w.maxzoom || 14);
    const source = getContourDemSource(state.url, maxzoom);
    const thresholds = cogContourThresholds(state.contourIntervals, maxzoom);
    map.addSource(state.contourSourceId, {
      type: 'vector',
      tiles: [source.contourProtocolUrl({ thresholds })],
      maxzoom
    });
    const [lineId, labelId] = state.contourLayerIds;
    const styleLayers = map.getStyle().layers;
    const baseIndex = styleLayers.findIndex(layer => layer.id === w.id);
    const beforeId = baseIndex >= 0 ? styleLayers[baseIndex + 1]?.id : undefined;
    map.addLayer({
      id: lineId,
      type: 'line',
      source: state.contourSourceId,
      'source-layer': 'contours',
      layout: { visibility: 'none' },
      paint: {
        'line-color': ['match', ['get', 'level'], 1, state.contourColors.major, state.contourColors.minor],
        'line-width': ['match', ['get', 'level'], 1, 1.2, 0.7]
      }
    }, beforeId);
    map.addLayer({
      id: labelId,
      type: 'symbol',
      source: state.contourSourceId,
      'source-layer': 'contours',
      filter: ['>', ['get', 'level'], 0],
      layout: {
        visibility: 'none',
        'symbol-placement': 'line',
        'text-size': 10,
        'text-font': ['Noto Sans Regular'],
        'text-field': ['concat', ['number-format', ['get', 'ele'], {}], state.contourUnits ? ` ${state.contourUnits}` : '']
      },
      paint: {
        'text-color': state.contourColors.major,
        'text-halo-color': '#fff',
        'text-halo-width': 1.2
      }
    }, beforeId);
    state.contoursCreated = true;
    state.contourLayerIds.forEach(id => w.groupLayerIds?.add(id));
    syncCogLayerMode(w);
    syncMapLayerOrder();
  })().catch(error => {
    removeCogContours(w);
    state.contoursEnabled = false;
    if (state.contourToggle) state.contourToggle.checked = false;
    const message = `Could not create contours for ${w.name || w.id}: ${error.message}`;
    console.error(message, error);
    toast(message);
  }).finally(() => {
    if (state.contourPromise === promise) state.contourPromise = null;
  });
  state.contourPromise = promise;
  return promise;
}
async function refreshCogContours(w) {
  const state = w.cogState;
  if (state.contourPromise) await state.contourPromise;
  removeCogContours(w);
  if (state.contoursEnabled && isCogOverlayVisible(w)) await createCogContours(w);
  else syncCogLayerMode(w);
}
const {
  render: renderArcgisLegend,
  load: loadArcgisLegend,
  updateInView: updateArcgisLegendInView
} = arcgisLegendController;
const overlayLegendImages = new Map();
const overlayLegendGroups = new Map();
function loadOverlayLegendImage(w) {
  const container = overlayLegendImages.get(w.id);
  if (!container || !w.legendUrl || container.querySelector('img')) return;
  container.querySelector('.legend-image-error')?.remove();
  const image = document.createElement('img');
  image.alt = '';
  image.style.cssText = 'max-width:100%;margin:2px 0 4px 20px';
  image.src = w.legendUrl;
  image.onerror = () => {
    const message = document.createElement('div');
    message.className = 'legend-image-error';
    message.textContent = 'Legend image unavailable. Toggle the layer off and on to retry.';
    container.appendChild(message);
    image.remove();
    console.warn(`Could not load legend image for ${w.name || w.id}: ${w.legendUrl}`);
  };
  container.appendChild(image);
}
function ensureOverlaySymbology(w) {
  const state = layerVisibility.get(w.id);
  const effectivelyVisible = state?.selected && state.inTheme && !state.groups.size;
  if (w.geojson && w.styleUrl && !effectivelyVisible) {
    loadGeojsonStyle(w).catch(error => {
      const message = `Could not load style for ${w.name || w.id}: ${error.message}`;
      console.error(message, error);
      toast(message);
    });
  }
  if (w.legendUrl) loadOverlayLegendImage(w);
  else loadArcgisLegend(w);
}
const overlayVisibilityController = createOverlayVisibilityController({
  isCogProtocolRegistered: () => cogProtocolRegistered,
  ensureCogProtocol,
  notify: toast,
  setContoursVisible: visible => { contoursVisible = visible; },
  addHillshadeLayer,
  getActiveTerrainModel: () => activeTerrainModel,
  getTerrainLayerBeforeId: () => terrainLayerBeforeId,
  setClassFilters,
  setLayerVisibility: setVis,
  syncCogLayerMode,
  ensurePendingCogLayer,
  initializeVisibleCogControls,
  getCursorPosition: () => cursorPosition,
  scheduleCogCursorValues,
  getLayerVisibility: id => layerVisibility.get(id),
  ensureOverlaySymbology,
  setThemeLayerVisibility: setThemeVisibility
});
const overlayDownloadController = createOverlayDownloadController({
  document,
  window,
  navigator,
  URL,
  Blob,
  crypto,
  setTimeout,
  console,
  getBaseUrl: () => location.href,
  toast,
  prepareCogQgisStyle,
  cogQgisColorStops,
  buildQgisLayerDefinition,
  geojsonLegendCategories: geojsonLegendController.categories,
  geojsonFieldStats,
  buildGeojsonQgisLayerDefinition
});
const overlayRowControlsController = createOverlayRowControlsController({
  layerTools,
  infoFor,
  setOverlayTransparency,
  arcgisLegendRequest,
  collapser,
  collapseLayers: CONFIG.collapseLayers,
  overlayHasZoomableExtent,
  overlayBounds,
  zoomButton
});
map.on('idle', updateArcgisLegendInView);
map.on('moveend', updateArcgisLegendInView);
///////////////////////////////////////////////////////////////////////////
// Builds grouped layer controls for configured raster and terrain overlays.
///////////////////////////////////////////////////////////////////////////
function buildOverlayLegend(overlays = allOverlays()) {
  overlayLegendController.build(overlays);
}

///////////////////////////////////////////////////////////////////////////
// Builds the persistent basemap controls from the global configuration.
///////////////////////////////////////////////////////////////////////////
function buildBasemapLegend() {
  const entries = validBasemaps();
  if (!entries.length) return;
  const group = addGroup($('legend'), 'Basemaps');
  entries.forEach(w => {
    const d = document.createElement('div');
    d.dataset.orderKey = `basemap:${w.id}`;
    d.draggable = true;
    d.title = `Drag to reorder ${w.name || w.id}`;
    const visible = w.visible === true;
    d.innerHTML = `<div class="grprow"><label class="lname"><input type="checkbox"${visible ? ' checked' : ''}> <span>${esc(w.name || w.id)}</span></label></div>`;
    const cb = d.querySelector('input');
    cb.onchange = () => setVis([w.id], cb.checked);
    const transp = 100 - Math.round((w.opacity ?? 1) * 100);
    const tools = layerTools(transp, infoFor(w.id, 'Basemaps', w.info), v => setOverlayTransparency(w, v));
    d.querySelector('.grprow').appendChild(tools.btn);
    d.appendChild(tools.panel);
    group.body.appendChild(d);
    group.layerIds.add(w.id);
  });
}

map.once('style.load', async () => {
  const startup = await chooseSessionStartup();
  const savedOverlays = startup.snapshot?.overlays || {};
  const needsCogProtocol = validOverlays().some(overlay => overlay.cog &&
    (typeof savedOverlays[overlay.id] === 'boolean' ? savedOverlays[overlay.id] : overlay.visible === true)) ||
    (terrainModels.length > 0 && CONFIG.terrain?.hillshade !== false &&
      (typeof savedOverlays.hillshade === 'boolean' ? savedOverlays.hillshade : CONFIG.terrain?.hillshadeVisible === true)) ||
    (terrainModels.length > 0 && CONFIG.terrain?.contours?.visible === true) ||
    startup.snapshot?.terrain?.enabled === true ||
    startup.snapshot?.overlays?.['dtm-contour-lines'] === true;
  const cogProtocolStartup = needsCogProtocol
    ? ensureCogProtocol().catch(error => {
      toast(`Could not load COG support: ${error.message}`);
      return null;
    })
    : Promise.resolve(null);
  if (mapHashView) {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--ac').trim() || '#1f2a33';
    new maplibregl.Marker({ color })
      .setLngLat(mapHashView.center)
      .addTo(map);
  }
  startupSessionSnapshot = startup.action === 'reset' ? null : (startup.snapshot || null);
  if (startup.action === 'reset') clearSavedThemeAdditions();
  if (startup.action === 'reset') {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  if (startupSessionSnapshot) {
    prepareSessionSnapshot(startupSessionSnapshot);
  } else if (startup.action !== 'shared') {
    try { localStorage.removeItem(SESSION_STATE_KEY); }
    catch (error) {
      console.warn('Previous map session could not be cleared:', error);
      toast('Previous map session could not be cleared in this browser.');
    }
  }
  const style = map.getStyle();
  originalStyleIds = new Set([...Object.keys(style.sources), ...style.layers.map(l => l.id)]);
  const firstData = style.layers.find(l => l['source-layer']);
  const firstSymbol = style.layers.find(l => l.type === 'symbol');
  validBasemaps().slice().reverse().forEach(w => addRasterLayer(w, (firstData || firstSymbol || {}).id, true));
  const tc = CONFIG.terrain;
  terrainLayerBeforeId = firstData && firstData.id;
  if (tc && terrainModels.length) {
    activeTerrainModel = terrainModels.find(m => m.id === tc.defaultModel) || terrainModels[0];
    const savedHillshadeVisible = startupSessionSnapshot?.overlays?.hillshade;
    const hillshadeVisible = typeof savedHillshadeVisible === 'boolean' ? savedHillshadeVisible : tc.hillshadeVisible === true;
    if (tc.hillshade !== false) registerLayerVisibility('hillshade', hillshadeVisible);
    if (typeof startupSessionSnapshot?.overlays?.[CONTOUR_LINE_ID] === 'boolean')
      contoursVisible = startupSessionSnapshot.overlays[CONTOUR_LINE_ID];
    if (cogProtocolRegistered) {
      if (tc.hillshade !== false && hillshadeVisible)
        addHillshadeLayer(activeTerrainModel, firstData && firstData.id, true);
      setupTerrainContours(activeTerrainModel, firstData && firstData.id);
    } else {
      cogProtocolStartup.then(protocol => {
        if (!protocol) return;
        if (tc.hillshade !== false && hillshadeVisible)
          addHillshadeLayer(activeTerrainModel, firstData && firstData.id, true);
        setupTerrainContours(activeTerrainModel, firstData && firstData.id);
        initializeVisibleCogControls();
      });
    }
  } else $('terrainBtn').style.display = 'none';   // no DTM configured
  reverseWithinGroups(validOverlays()).forEach(w => addRasterLayer(w, firstSymbol && firstSymbol.id));
  buildLegend();
  buildOverlayLegend();
  buildBasemapLegend();
  enableLegendReordering();
  setupThemes(startupSessionSnapshot?.theme || null, startup.action === 'start' || startup.action === 'shared');
  if (startupSessionSnapshot) restoreSessionSnapshot(startupSessionSnapshot);
  initializeWorkspaceControls();
  geojsonLoadingEnabled = true;
  loadVisibleGeojsonLayers();
  initializeVisibleCogControls();
  sessionPersistenceReady = true;
  const onSessionControlChange = event => {
    const target = event.target;
    if (target instanceof Element && (target.closest('#legend') || target.id === 'themeSel')) scheduleSessionSave();
  };
  document.addEventListener('change', onSessionControlChange);
  document.addEventListener('input', onSessionControlChange);
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('#legend')) scheduleSessionSave();
  });
  map.on('moveend', scheduleSessionSave);
  window.addEventListener('pagehide', () => {
    clearTimeout(sessionSaveTimer);
    saveSessionSnapshot();
  });
  scheduleSessionSave();
  updateArcgisLegendInView();
  loadScaleInfo().then(updateScaleState);
  populateSearchLayers();
  if (!isMobile()) {
    if (!uiV2) openTool('legend');   // classic starts with the legend open on desktop only
    else {
      let saved = null;
      try { saved = localStorage.getItem(RAIL_STATE_KEY); } catch { /* storage unavailable */ }
      if (RAIL_TOOLS.includes(saved)) openTool(saved);   // v2 restores the last rail state; first visit starts collapsed
    }
  }
  if (requestedTourId) {
    if (requestedTour) startTour(requestedTour);
    else toast(`Tour "${requestedTourId}" was not found.`);
  }
});

// ---------- Box selection (mouse and touch) ----------
const boxSelectionController = createBoxSelectionController({
  map,
  document,
  boxButton: $('boxBtn'),
  boxTip: $('boxTip'),
  isBoxMode: () => boxMode,
  setBoxMode: on => { boxMode = on; },
  setJustBoxed: on => { justBoxed = on; },
  isNotificationPicking: notificationController.isPicking,
  cancelNotificationPick: notificationController.cancelPick,
  selectNotificationLocation: notificationController.selectLocation,
  getActiveTool: () => tool,
  isMobile,
  openTool,
  arcgisQueryController,
  queryData,
  arcgisBoxPolygon,
  queryArcgisOverlays,
  showTable,
  toast
});
const { setBox } = boxSelectionController;
$('globeBtn').onclick = () => {
  const globe = $('globeBtn');
  const enabled = globe.getAttribute('aria-pressed') !== 'true';
  map.setProjection({ type: enabled ? 'globe' : 'mercator' });
  globe.classList.toggle('active', enabled);
  globe.setAttribute('aria-pressed', String(enabled));
  const label = enabled ? 'Switch to Mercator view' : 'Switch to globe view';
  globe.title = label;
  globe.setAttribute('aria-label', label);
  scheduleSessionSave();
};

// ---------- Results panel ----------
let activeTab = null, ring = null, shown = [], tabRows = [], tabCols = [], tableFilters = {};
function centreOf(g) {
  const pts = [];
  (function walk(c) { typeof c[0] === 'number' ? pts.push(c) : c.forEach(walk); })(g.coordinates);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
///////////////////////////////////////////////////////////////////////////
// Renders vector query results as grouped, selectable feature tables.
///////////////////////////////////////////////////////////////////////////
let tableSeq = 0;
async function showTable(feats, label) {
  const seq = ++tableSeq;
  tableFilters = {};
  const all = await withLinked(feats);
  if (seq === tableSeq) renderTable(all, label);
}
function renderTable(feats, label) {
  shown = feats;
  const groups = {};
  feats.forEach(f => (groups[f.sourceLayer || f.layer.id] ||= []).push(f));
  const names = Object.keys(groups);
  if (!names.includes(activeTab)) activeTab = names[0];
  $('count').textContent = label || `${feats.length} record(s)`;
  const wrap = $('tablewrap');
  if (!feats.length) {
    $('tabs').innerHTML = '';
    wrap.innerHTML = '<p style="padding:10px">No features found. Try a bigger box or zoom in on the area first.</p>';
    $('xlsxBtn').hidden = true;
    tabRows = []; tabCols = [];
  } else {
    $('tabs').innerHTML = names.map(n =>
      `<button type="button" class="tab${n === activeTab ? ' on' : ''}" data-tab="${esc(n)}" aria-pressed="${n === activeTab}">${esc(n.replace(/_/g, ' '))} (${groups[n].length})</button>`).join('');
    document.querySelectorAll('#tabs .tab').forEach(b => b.onclick = () => { activeTab = b.dataset.tab; renderTable(feats, label); });
    const sourceRows = groups[activeTab];
    tabCols = [...new Set(sourceRows.flatMap(f => Object.keys(f.properties)))];
    const searchable = activeThemeName === 'Boreholes' && activeTab === 'Boreholes';
    $('xlsxBtn').hidden = !searchable;
    const filterRow = searchable
      ? `<tr class="vector-filter-row"><th aria-hidden="true"></th>${tabCols.map(field => `<th><input class="vector-filter-input" type="search" data-field="${esc(field)}" aria-label="Search ${esc(field)}" placeholder="Search" value="${esc(tableFilters[field] || '')}"></th>`).join('')}</tr>`
      : '';
    wrap.innerHTML = `<table><thead><tr><th scope="col">Zoom</th>${tabCols.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr>${filterRow}</thead><tbody></tbody></table>`;
    const renderRows = () => {
      const filters = searchable ? Object.entries(tableFilters).filter(([, value]) => value) : [];
      tabRows = sourceRows.filter(feature => filters.every(([field, value]) =>
        String(feature.properties[field] ?? '').toLocaleLowerCase().includes(value.toLocaleLowerCase())
      ));
      const body = wrap.querySelector('tbody');
      body.innerHTML = tabRows.map((feature, index) =>
        `<tr data-i="${index}" title="Click a row to zoom to this record, or use its Zoom button"><td><button type="button" class="json-row-zoom vector-row-zoom" aria-label="Zoom to result ${index + 1}"${feature.geometry ? '' : ' disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4"></circle><path d="m16 16 4.5 4.5"></path></svg></button></td>${tabCols.map(field => `<td>${cell(feature.properties[field])}</td>`).join('')}</tr>`
      ).join('');
      const zoomToFeature = feature => {
        if (!feature.geometry) return;
        const center = centreOf(feature.geometry);
        if (ring) ring.remove();
        const element = document.createElement('div'); element.className = 'ring';
        ring = new maplibregl.Marker({ element }).setLngLat(center).addTo(map);
        map.flyTo({ center, zoom: Math.max(map.getZoom(), 14) });
      };
      body.querySelectorAll('.vector-row-zoom').forEach(button => button.onclick = event => {
        event.stopPropagation();
        zoomToFeature(tabRows[button.closest('tr').dataset.i]);
      });
      body.querySelectorAll('tr').forEach(tr => tr.onclick = event => {
        if (event.target.closest('a, button')) return;
        const feature = tabRows[tr.dataset.i];
        zoomToFeature(feature);
      });
    };
    wrap.querySelectorAll('.vector-filter-input').forEach(input => input.oninput = () => {
      tableFilters[input.dataset.field] = input.value;
      renderRows();
    });
    renderRows();
  }
  setResults(true);
}
// Global results panel switch (rail button); JSON themes keep their legend eye in step.
let resultsOn = false;
function setResults(on) {
  if (!on) boxSelectionController.invalidatePendingSelection();
  resultsOn = on;
  document.body.classList.toggle('has-table', on);
  $('tableBtn').classList.toggle('active', on);
  $('tableBtn').setAttribute('aria-pressed', String(on));
  const group = activeJsonThemeState.active && activeJsonThemeState.linkedGroup;
  if (group && activeJsonThemeState.linkedVisible !== on) group.setVisibility(on);
  if (on && !activeJsonThemeState.active && !shown.length) {
    $('count').textContent = '';
    $('tabs').innerHTML = '';
    $('tablewrap').innerHTML = '<p style="padding:10px">Click the map, draw a box or search to list features here.</p>';
  }
  map.resize();
}
function closeResults() {
  setResults(false);
  if (ring) { ring.remove(); ring = null; }
}
function clearResults() {
  boxSelectionController.clear();
  shown = []; tabRows = []; tabCols = [];
  $('xlsxBtn').hidden = true;
  closeResults();
}
$('closeBtn').onclick = closeResults;
$('tableBtn').onclick = () => setResults(!resultsOn);
$('xlsxBtn').onclick = () => {
  if (!tabRows.length) return;
  ensureXlsx().then(xlsx => {
    const rows = tabRows.map(feature => Object.fromEntries(tabCols.map(field => [field, feature.properties[field] ?? ''])));
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rows), (activeTab || 'Boreholes').slice(0, 31));
    xlsx.writeFile(workbook, 'Boreholes_filtered.xlsx');
    toast('Excel export prepared');
  }).catch(error => toast(`Excel export failed: ${error.message}`));
};
$('csvBtn').onclick = () => {
  if (!tabRows.length) return;
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [tabCols.map(q).join(','), ...tabRows.map(f => tabCols.map(c => q(f.properties[c])).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = (activeTab || 'results') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---------- Feature search ----------
const { populateSearchLayers, updateSearchFields: refreshSearchFields } = createDataSearchController({
  map,
  layerSelect: $('searchLayer'),
  textInput: $('searchText'),
  fieldsElement: $('searchFields'),
  runButton: $('runSearch'),
  getConfig: () => CONFIG,
  geojsonLoaders,
  getActiveThemeAll: () => activeThemeAll,
  getThemeOverlays: () => themeOverlays,
  getThemeLayers: () => themeLayers,
  queryData,
  wholeMap,
  loadGeojsonData,
  styleLayerKey,
  styleLayerLabel,
  escapeHtml: esc,
  toast,
  showTable,
  setActiveTab: tab => { activeTab = tab; },
  isMobile,
  getActiveTool: () => tool,
  openTool
});
updateSearchFields = refreshSearchFields;

createLocationSearchController({
  map,
  maplibregl,
  input: $('geoIn'),
  goButton: $('geoGo'),
  list: $('geoList'),
  status: $('geoStatus'),
  getConfig: () => CONFIG,
  projectGrid: grid => proj4('EPSG:29902', 'EPSG:4326', [grid.E, grid.N]),
  isMobile,
  getActiveTool: () => tool,
  openTool,
  escapeHtml: esc
});


// ---------- 3D terrain ----------
let toastTimer;
function hideToast() {
  const t = $('toast');
  t.style.display = 'none';
  t.classList.remove('toast-confirm');
  t.replaceChildren();
}
function toast(msg, duration = 14000) {
  const t = $('toast');
  clearTimeout(toastTimer);
  t.classList.remove('toast-confirm');
  t.textContent = msg; t.style.display = 'block';
  toastTimer = setTimeout(hideToast, duration);
}
function confirmToast(msg, onConfirm, returnFocus) {
  const t = $('toast');
  clearTimeout(toastTimer);
  const text = document.createElement('span');
  text.textContent = msg;
  const actions = document.createElement('span');
  actions.className = 'toast-actions';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const finish = confirmed => {
    clearTimeout(toastTimer);
    hideToast();
    if (confirmed) {
      onConfirm();
      const nextGroup = [...document.querySelectorAll('#legend .lgroup:not([hidden]) .lgcollapse')]
        .find(button => button.offsetParent !== null);
      (nextGroup || $('legend')).focus();
    } else if (returnFocus?.isConnected && !returnFocus.hidden) returnFocus.focus();
  };
  remove.onclick = () => finish(true);
  cancel.onclick = () => finish(false);
  actions.append(remove, cancel);
  t.replaceChildren(text, actions);
  t.classList.add('toast-confirm');
  t.style.display = 'flex';
  remove.focus();
  toastTimer = setTimeout(() => finish(false), 14000);
}
// Works out why the DTM would not load and says so on the map (details are also in the browser console)
async function diagnoseDtm(model) {
  const url = new URL(model.cog, location.href).href;
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
    if (r.status === 404) return `The file was not found (404): ${url}. Check the selected terrain model in CONFIG.terrain.models.`;
    if (r.status === 200) return 'The server sent the whole file instead of a byte range. COGs need a server that supports HTTP range requests (python -m http.server does not; try "npx http-server", "npx serve", nginx, Apache or IIS).';
    if (r.status !== 206) return `The server answered ${r.status} for ${url}.`;
    const b = new Uint8Array(await r.arrayBuffer());
    if (!((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d))) return 'That file is not a GeoTIFF (no TIFF header).';
    return null;   // file is reachable and is a TIFF: the problem is inside it
  } catch (err) { return 'The file could not be fetched (network or cross-origin problem).'; }
}
let dtmChecking = false;
map.on('error', async e => {
  const msg = (e.error && e.error.message) || '';
  const isTerrainSource = m => m.sourceId === e.sourceId || m.hillshadeSourceId === e.sourceId;
  const model = terrainModels.find(isTerrainSource) || activeTerrainModel;
  if (!model || (!terrainModels.some(isTerrainSource) && !(e.sourceId === undefined && /cog|tiff|geotiff/i.test(msg)))) {
    const overlay = (CONFIG.overlays || []).find(w => w.id === e.sourceId);
    if (overlay) console.error(`Overlay "${overlay.name || overlay.id}" error:`, e.error);
    return;
  }
  console.error('DTM error:', e.error);
  if (dtmChecking) return;
  dtmChecking = true;
  const why = await diagnoseDtm(model);
  const notification = terrainErrorToast(msg, why);
  toast(notification.message, notification.duration);
  setTimeout(() => dtmChecking = false, 15000);
});
let terrainOn = false, terrainCb = null, terrainGroupHidden = false;   // checkbox selection is preserved when its group is hidden
let terrainExaggeration = Math.min(10, Math.max(1, Number((CONFIG.terrain || {}).exaggeration) || 1));
const terrainRuntimeController = createTerrainRuntimeController({
  map,
  terrainConfig: CONFIG.terrain,
  contourLineId: CONTOUR_LINE_ID,
  models: terrainModels,
  verifyTerrainRangeSupport,
  reportTerrainRangeError,
  ensureCogProtocol,
  isCogProtocolRegistered: () => cogProtocolRegistered,
  getActiveModel: () => activeTerrainModel,
  setActiveModel: model => { activeTerrainModel = model; },
  setContoursVisible: visible => { contoursVisible = visible; },
  removeTerrainContours,
  addTerrainModelSource,
  addHillshadeLayer,
  setupTerrainContours,
  getTerrainOn: () => terrainOn,
  setTerrainOn: on => { terrainOn = on; },
  getTerrainCheckbox: () => terrainCb,
  getTerrainGroupHidden: () => terrainGroupHidden,
  getTerrainLayerBeforeId: () => terrainLayerBeforeId,
  getTerrainExaggeration: () => terrainExaggeration,
  setModelPickerValue: id => {
    const picker = $('legend').querySelector('.terrain-model');
    if (picker && id) picker.value = id;
  },
  setTerrainButtonState: on => {
    const button = $('terrainBtn');
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  },
  toast
});
const { setTerrainModel, setTerrain3D } = terrainRuntimeController;
const terrainLegendRowController = createTerrainLegendRowController({
  document,
  map,
  models: terrainModels,
  escapeHtml: esc,
  slidersIcon: ICON_SLIDERS,
  zoomButton,
  getActiveModel: () => activeTerrainModel,
  setTerrainModel,
  getExaggeration: () => terrainExaggeration,
  setExaggeration: value => { terrainExaggeration = value; },
  getTerrainGroupHidden: () => terrainGroupHidden,
  isTerrainOn: () => terrainOn,
  setTerrain3D,
  setTerrainCheckbox: checkbox => { terrainCb = checkbox; },
  getBaseUrl: () => location.href,
  getCogMetadata: url => window.MaplibreCOGProtocol.getCogMetadata(url)
});
const overlayLegendController = createOverlayLegendController({
  getLegendElement: () => $('legend'),
  overlayLegendGroups,
  allOverlays,
  addGroup,
  terrainLegendRowController,
  document,
  escapeHtml: esc,
  geojsonLoaders,
  updateGeojsonLoadStatus,
  renderGeojsonLegend,
  overlayVisibilityController,
  controls: ctl,
  overlayDownloadController,
  overlayRowControlsController,
  hillshadeControlsMarkup,
  contourControlsMarkup,
  colorRampIcon: ICON_COLOR_RAMP,
  geojsonStyleController,
  bindHillshadeControls,
  bindContourControls,
  overlayLegendImages,
  renderArcgisLegend,
  ensureOverlaySymbology,
  onTerrainGroupVisibilityChange(visible) {
    terrainGroupHidden = !visible;
    if (!visible && terrainOn) setTerrain3D(false, false);
    else if (visible && terrainCb && terrainCb.checked && !terrainOn) setTerrain3D(true, false);
  }
});
terrainRuntimeController.attachMapListeners();
$('terrainBtn').onclick = () => {
  if (!terrainGroupHidden) {
    setTerrain3D(!terrainOn);
    scheduleSessionSave();
  }
};

// ---------- Print (map image + key of the layers currently switched on) ----------
function mapImage() {
  return new Promise((resolve, reject) => {
    map.once('render', () => {
      try {
        const src = map.getCanvas(), dpr = src.width / src.clientWidth;
        const c = document.createElement('canvas');
        c.width = src.width; c.height = src.height;
        const g = c.getContext('2d');
        g.drawImage(src, 0, 0);
        // scale bar drawn into the image so it stays correct whatever size the page is printed at
        const mpp = 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom()));   // metres per CSS px
        if (map.getPitch() < 5) {   // a scale bar is only valid looking straight down
        const m = 100 * mpp, base = Math.pow(10, Math.floor(Math.log10(m)));
        const dist = [5, 2, 1].map(f => f * base).find(v => v <= m);
        const len = dist / mpp * dpr, x = 12 * dpr, y = src.height - 16 * dpr;
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.fillRect(x - 6 * dpr, y - 22 * dpr, len + 12 * dpr, 34 * dpr);
        g.strokeStyle = '#000'; g.lineWidth = 2 * dpr; g.beginPath();
        g.moveTo(x, y - 6 * dpr); g.lineTo(x, y); g.lineTo(x + len, y); g.lineTo(x + len, y - 6 * dpr); g.stroke();
        g.fillStyle = '#000'; g.font = `${12 * dpr}px sans-serif`;
        g.fillText(dist >= 1000 ? dist / 1000 + ' km' : dist + ' m', x, y - 10 * dpr);
        }
        resolve(c.toDataURL('image/png'));
      } catch (e) { reject(e); }
    });
    map.triggerRepaint();
  });
}
function buildKey() {
  let html = '';
  document.querySelectorAll('#legend .lgroup').forEach(sec => {
    if (sec.hidden) return;
    let items = '';
    sec.querySelectorAll('.lgbody > div').forEach(el => {
      if (el.hidden || el.dataset.nokey || el.classList.contains('offscale')) return;
      if (el.hidden || el.classList.contains('offscale')) return;
      const name = esc(el.querySelector('.lname span').textContent);
      if (el.dataset.sl) {
        const ents = [...el.querySelectorAll('.ent')].filter(e => e.querySelector('input').checked && !e.classList.contains('nv'));
        if (ents.length) items += `<b>${name}</b>` + ents.map(e => `<div class="pv-ent">${e.querySelector('.sw').outerHTML}<span>${esc(e.lastElementChild.textContent)}</span></div>`).join('');
      } else if (el.querySelector('input').checked) {
        items += `<b>${name}</b>` + (el.querySelector('img') ? el.querySelector('img').outerHTML : '');
      }
    });
    if (items) html += `<h4>${esc(sec.querySelector('.lghead span').textContent)}</h4>${items}`;
  });
  return html;
}
///////////////////////////////////////////////////////////////////////////
// Captures the current map and layer key, then opens the print layout.
///////////////////////////////////////////////////////////////////////////
async function printMap() {
  let url;
  try { url = await mapImage(); } catch (e) { alert('The map could not be captured for printing (a layer may not allow image export).'); return; }
  const cv = map.getCanvas(), portrait = cv.clientHeight > cv.clientWidth;
  const c = map.getCenter(), [x, y] = proj4('EPSG:4326', 'EPSG:29902', [c.lng, c.lat]);
  const attr = (document.querySelector('.maplibregl-ctrl-attrib-inner') || {}).textContent || '';
  $('pageStyle').textContent = `@page { size: A4 ${portrait ? 'portrait' : 'landscape'}; margin: 10mm; }`;
  const pv = $('printView');
  pv.className = portrait ? 'portrait' : '';
  pv.innerHTML = `<div class="pv-head"><h1>${esc(CONFIG.title || document.title)}</h1><span>${new Date().toLocaleDateString()}</span></div>` +
    `<div class="pv-body"><img alt="Map" src="${url}"><div class="pv-key">${buildKey() || '<i>No layers switched on</i>'}</div></div>` +
    `<div class="pv-foot">Map centre: Irish Grid E ${x.toFixed(0)} N ${y.toFixed(0)}. ${esc(attr.trim())}${map.getPitch() >= 5 ? ' Oblique view: scale varies across the image.' : ''}</div>`;    
  const img = pv.querySelector('img');
  img.complete ? window.print() : (img.onload = () => window.print());
}
$('printBtn').onclick = printMap;
