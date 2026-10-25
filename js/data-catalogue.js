import { buildGeojsonQgisLayerDefinition, buildQgisLayerDefinition } from './qgis-layer.js';
import { validateCogClasses } from './cog-classes.js';
import {
  COG_DEFAULT_QUANTILE_STOPS,
  COG_DEFAULT_RAMP,
  COG_RAMP_COLORS,
  cogQgisColorStops,
  cogQuantileBounds,
  sampleCogValueRange
} from './cog-style.js';

const catalogue = document.querySelector('#catalogue');
const search = document.querySelector('#catalogueSearch');
const status = document.querySelector('#catalogueStatus');
const profile = new URLSearchParams(location.search).get('profile') || 'public';
const profileConfigs = {
  public: 'config/config.js',
  internal: 'config/config.internal.js'
};
let cogProtocolPromise;
document.querySelector('#backToMap').href = profile === 'public'
  ? 'index.html'
  : `index.html?profile=${encodeURIComponent(profile)}`;

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${source}.`));
    document.head.appendChild(script);
  });
}

function encodeCogUrls(config) {
  const encode = value => typeof value === 'string' ? encodeURI(value) : value;
  (config.overlays || []).forEach(overlay => {
    if (typeof overlay?.cog === 'string') overlay.cog = encode(overlay.cog);
  });
  (config.terrain?.models || []).forEach(model => {
    if (typeof model?.cog === 'string') model.cog = encode(model.cog);
  });
}

async function loadGeojsonStyles(config) {
  const overlays = (config.overlays || []).filter(overlay =>
    overlay?.geojson === true && typeof overlay.styleUrl === 'string');
  await Promise.all(overlays.map(async overlay => {
    const url = new URL(overlay.styleUrl, document.baseURI);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${overlay.styleUrl}: HTTP ${response.status}.`);
    const definition = await response.json();
    if (!definition?.style || typeof definition.style !== 'object' || Array.isArray(definition.style)) {
      throw new Error(`GeoJSON style ${overlay.styleUrl} must contain a style object.`);
    }
    overlay.style = definition.style;
    if (definition.legend && typeof definition.legend === 'object') overlay.legend = definition.legend;
  }));
}

function resolveSource(source) {
  return new URL(source, location.href).href;
}

function fieldOf(expression) {
  if (!Array.isArray(expression)) return null;
  if (expression[0] === 'get') return expression[1];
  if (['to-number', 'to-string', 'coalesce'].includes(expression[0])) {
    return expression.slice(1).map(fieldOf).find(Boolean) || null;
  }
  return null;
}

function geojsonCategories(layer) {
  const configured = layer.legend?.entries;
  const expression = layer.style?.color ?? layer.style?.fill;
  const field = fieldOf(Array.isArray(expression) ? expression[1] : null);
  if (Array.isArray(expression) && expression[0] === 'match') {
    const categories = [];
    for (let index = 2; index < expression.length - 1; index += 2) {
      const values = Array.isArray(expression[index]) ? expression[index] : [expression[index]];
      const fallbackLegend = configured?.[categories.length];
      categories.push({
        labels: values,
        text: fallbackLegend?.label || values.join(', '),
        color: fallbackLegend?.color || expression[index + 1],
        field
      });
    }
    const fallbackColor = expression.at(-1);
    if (typeof fallbackColor === 'string') categories.push({
      text: 'Other', color: fallbackColor, field, other: true
    });
    return categories;
  }
  if (Array.isArray(expression) && expression[0] === 'step') {
    const categories = [{
      text: 'All values',
      color: expression[2],
      lo: -Infinity,
      hi: Infinity,
      field
    }];
    for (let index = 3; index < expression.length - 1; index += 2) {
      categories[categories.length - 1].text = categories[categories.length - 1].lo === -Infinity
        ? `< ${expression[index]}`
        : `≥ ${categories[categories.length - 1].lo} – < ${expression[index]}`;
      categories[categories.length - 1].hi = expression[index];
      categories.push({
        text: `≥ ${expression[index]}`,
        color: expression[index + 1],
        lo: expression[index],
        hi: Infinity,
        field
      });
    }
    return categories;
  }
  return Array.isArray(configured)
    ? configured.filter(entry => typeof entry?.label === 'string' && typeof entry?.color === 'string')
      .map(entry => ({ text: entry.label, color: entry.color }))
    : [];
}

function catalogEntries(config) {
  const entries = (config.overlays || []).flatMap(overlay => {
    if (overlay?.geojson === true && typeof overlay.url === 'string') {
      return [{
        ...overlay,
        kind: 'GeoJSON',
        source: overlay.url,
        group: overlay.group || 'Ungrouped'
      }];
    }
    if (typeof overlay?.cog === 'string') {
      return [{
        ...overlay,
        kind: 'COG',
        source: overlay.cog,
        group: overlay.group || 'Ungrouped'
      }];
    }
    return [];
  });

  if (typeof config.terrain?.cog === 'string') entries.push({
    id: 'terrain-default',
    name: config.terrain.name || 'Default terrain model',
    kind: 'COG',
    source: config.terrain.cog,
    group: 'Terrain COGs',
    projection: config.terrain.projection || 'EPSG:29902',
    opacity: 1,
    tileSize: config.terrain.tileSize
  });
  (config.terrain?.models || []).filter(model => typeof model?.cog === 'string').forEach(model => entries.push({
    ...model,
    id: model.id || model.name,
    name: model.name || model.id || 'Terrain model',
    kind: 'COG',
    source: model.cog,
    group: 'Terrain COGs',
    projection: model.projection || config.terrain?.projection || 'EPSG:29902',
    opacity: 1
  }));
  return entries;
}

function makeButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function downloadDefinition(content, name) {
  const blobUrl = URL.createObjectURL(new Blob([content], { type: 'application/xml;charset=utf-8' }));
  const link = document.createElement('a');
  const filename = String(name).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'dataset';
  link.href = blobUrl;
  link.download = `${filename}.qlr`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

async function getCogProtocol() {
  if (window.MaplibreCOGProtocol) return window.MaplibreCOGProtocol;
  if (!cogProtocolPromise) {
    cogProtocolPromise = loadScript('js/maplibre-cog-protocol.js').then(() => {
      if (!window.MaplibreCOGProtocol) throw new Error('The COG protocol script did not initialize.');
      return window.MaplibreCOGProtocol;
    }).catch(error => {
      cogProtocolPromise = null;
      throw error;
    });
  }
  return cogProtocolPromise;
}

function cogStyleSettings(entry, config) {
  const defaults = config.cogStyleDefaults || {};
  const style = { ...defaults, ...entry.cogStyle };
  const ramp = style.ramp ?? COG_DEFAULT_RAMP;
  if (typeof ramp !== 'string' || !Array.isArray(COG_RAMP_COLORS[ramp])) {
    throw new Error(`Unknown COG color ramp "${ramp}".`);
  }
  const mode = style.mode ?? 'quantile';
  if (!['continuous', 'quantile'].includes(mode)) {
    throw new Error(`Unsupported COG export style mode "${mode}".`);
  }
  const stopCount = style.quantileStops ?? COG_DEFAULT_QUANTILE_STOPS;
  if (!Number.isInteger(stopCount) || stopCount < 2) {
    throw new Error('COG quantileStops must be an integer of at least 2.');
  }
  return { ramp, mode, stopCount };
}

async function qgisDefinition(entry, url, config) {
  const id = `${entry.id || entry.name}_${crypto.randomUUID().replace(/-/g, '_')}`;
  const opacity = Number.isFinite(entry.opacity) ? entry.opacity : 1;
  if (entry.kind === 'GeoJSON') {
    return buildGeojsonQgisLayerDefinition({
      id,
      name: entry.name || entry.id,
      url,
      opacity,
      crsAuthId: entry.qgisCrs || entry.projection || 'EPSG:4326',
      geometryType: entry.geometryType,
      style: entry.style || {},
      categories: geojsonCategories(entry)
    });
  }
  const protocol = await getCogProtocol();
  if (typeof protocol.getCogMetadata !== 'function') {
    throw new Error('The COG protocol cannot inspect raster metadata.');
  }
  const metadata = await protocol.getCogMetadata(url);
  const bandCount = metadata.bitsPerSample?.length || 0;
  if (bandCount !== 1) {
    return buildQgisLayerDefinition({
      id,
      name: entry.name || entry.id,
      url,
      opacity,
      crsAuthId: entry.qgisCrs || entry.projection || 'EPSG:29902',
      renderer: 'none'
    });
  }

  const { ramp, mode, stopCount } = cogStyleSettings(entry, config);
  const range = await sampleCogValueRange(url, metadata, protocol);
  const classes = entry.classes === undefined ? [] : validateCogClasses(entry.classes);
  const effectiveMode = classes.length ? 'classes' : mode;
  const style = cogQgisColorStops({
    colors: COG_RAMP_COLORS[ramp],
    mode: effectiveMode,
    classes,
    quantileBounds: effectiveMode === 'quantile'
      ? cogQuantileBounds(range.values, stopCount)
      : [],
    minimum: range.min,
    maximum: range.max,
    stopCount
  });
  return buildQgisLayerDefinition({
    id,
    name: entry.name || entry.id,
    url,
    opacity,
    crsAuthId: entry.qgisCrs || entry.projection || 'EPSG:29902',
    minimum: style.minimum,
    maximum: style.maximum,
    colorStops: style.colorStops,
    discrete: style.discrete
  });
}

function cogStyleLabel(entry, config) {
  if (entry.kind !== 'COG') return null;
  const { ramp, mode, stopCount } = cogStyleSettings(entry, config);
  const classes = entry.classes === undefined ? [] : validateCogClasses(entry.classes);
  return classes.length
    ? `Style: configured classes, ${ramp}`
    : `Style: ${mode === 'quantile' ? `Quantile (${stopCount} stops, smooth)` : 'Continuous'}, ${ramp}`;
}

const metadataCache = new Map();
const getPath = (object, path) => typeof path === 'string'
  ? (path.match(/[^.\[\]]+/g) || []).reduce((value, key) => value == null ? undefined : value[key], object)
  : undefined;
const metadataStrings = value => value == null
  ? []
  : Array.isArray(value)
    ? value.flatMap(metadataStrings)
    : typeof value === 'object'
      ? ('default' in value ? metadataStrings(value.default) : [])
      : [String(value).trim()].filter(Boolean);

function metadataConfig(entry, config) {
  return entry.info ?? config.layerInfo?.[entry.id] ?? config.groupInfo?.[entry.group] ?? null;
}

function metadataUrls(info) {
  const recordUrl = info && typeof info === 'object' && typeof info.metadata === 'string'
    ? info.metadata
    : null;
  if (!recordUrl) return null;
  const json = new URL(recordUrl, document.baseURI);
  json.searchParams.set('f', 'json');
  const page = new URL(typeof info.page === 'string' ? info.page : recordUrl, document.baseURI);
  page.searchParams.delete('f');
  return { json: json.href, page: page.href };
}

function formatMetadata(value, format, record) {
  if (typeof format === 'function') value = format(value, record);
  const values = metadataStrings(value);
  if (!values.length) return null;
  if (format === 'date') {
    const date = new Date(values[0]);
    return Number.isNaN(date.getTime())
      ? values[0]
      : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (format === 'daterange') {
    return values.map(item => item === '..' ? 'present' : formatMetadata(item, 'date', record)).join(' – ');
  }
  if (format === 'scale') {
    const scale = Number(values[0]);
    return `1:${Number.isFinite(scale) ? scale.toLocaleString('en-GB') : values[0]}`;
  }
  return format === 'lines' ? values : values.join(', ');
}

function appendLinkedText(container, text) {
  const source = String(text);
  const pattern = /https?:\/\/[^\s<>"']+/g;
  let offset = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const trailing = (match[0].match(/[.,;:)]+$/) || [''])[0];
    const url = match[0].slice(0, match[0].length - trailing.length);
    container.append(document.createTextNode(source.slice(offset, match.index)));
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = url;
    container.append(link, document.createTextNode(trailing));
    offset = match.index + match[0].length;
  }
  container.append(document.createTextNode(source.slice(offset)));
}

function appendMetadataValue(container, value, format) {
  if (format === 'email') {
    const link = document.createElement('a');
    link.href = `mailto:${value}`;
    link.textContent = value;
    container.append(link);
  } else if (format === 'link') {
    let url = null;
    try { url = new URL(value, document.baseURI); } catch {}
    if (url && (url.protocol === 'http:' || url.protocol === 'https:')) {
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = value;
      container.append(link);
    } else container.textContent = value;
  } else if (Array.isArray(value)) {
    value.forEach((line, index) => {
      if (index) container.append(document.createElement('br'));
      appendLinkedText(container, line);
    });
  } else {
    appendLinkedText(container, value);
  }
}

function renderMetadataRecord(details, record, info, config, urls) {
  const fields = Array.isArray(info.fields) ? info.fields : config.infoFields || [];
  let shown = 0;
  fields.forEach(field => {
    const value = formatMetadata(getPath(record, field.path), field.format, record);
    if (value === null || value === '') return;
    shown += 1;
    if (field.format === 'title') {
      const title = document.createElement('h4');
      title.className = 'metadata-record-title';
      appendMetadataValue(title, value, field.format);
      details.append(title);
      return;
    }
    const row = document.createElement('div');
    row.className = 'metadata-row';
    const term = document.createElement('span');
    term.className = 'metadata-label';
    term.textContent = field.label || '';
    const description = document.createElement('span');
    description.className = 'metadata-value';
    appendMetadataValue(description, value, field.format);
    row.append(term, description);
    details.append(row);
  });
  if (!shown) {
    const empty = document.createElement('p');
    empty.className = 'metadata-state';
    empty.textContent = 'No information found in the metadata record.';
    details.append(empty);
  }
  const footer = document.createElement('p');
  footer.className = 'metadata-record-link';
  const link = document.createElement('a');
  link.href = info.link || urls.page;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = info.linkText || 'View full metadata record';
  footer.append(link);
  details.append(footer);
}

async function fetchMetadata(url) {
  if (!metadataCache.has(url)) {
    metadataCache.set(url, fetch(url).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).catch(error => {
      metadataCache.delete(url);
      throw error;
    }));
  }
  return metadataCache.get(url);
}

function renderMetadata(entry, config) {
  const details = document.createElement('details');
  details.className = 'dataset-metadata';
  const summary = document.createElement('summary');
  summary.textContent = 'Metadata';
  details.append(summary);
  const info = metadataConfig(entry, config);
  const urls = metadataUrls(info);
  const aboutUrl = typeof info === 'string'
    ? info
    : typeof info?.link === 'string'
      ? info.link
      : null;
  let state = 'idle';
  details.addEventListener('toggle', async () => {
    if (!details.open || state !== 'idle') return;
    state = 'loading';
    const loading = document.createElement('p');
    loading.className = 'metadata-state';
    loading.textContent = 'Loading metadata…';
    details.append(loading);
    if (!urls) {
      loading.textContent = aboutUrl
        ? 'No metadata record is configured for this layer.'
        : 'No external metadata record is configured for this layer.';
      if (aboutUrl) {
        const link = document.createElement('a');
        link.href = aboutUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'About this layer';
        loading.append(document.createElement('br'), link);
      }
      state = 'loaded';
      return;
    }
    try {
      const content = document.createElement('div');
      content.className = 'metadata-record';
      renderMetadataRecord(content, await fetchMetadata(urls.json), info, config, urls);
      loading.replaceWith(content);
      state = 'loaded';
    } catch (error) {
      loading.textContent = `Metadata could not be loaded (${error.message}).`;
      const link = document.createElement('a');
      link.href = urls.page;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = info.linkText || 'Open metadata record';
      loading.append(document.createElement('br'), link);
      state = 'idle';
    }
  });
  return details;
}

function renderEntry(entry, config) {
  const card = document.createElement('article');
  card.className = 'dataset-card';
  const sourceUrl = resolveSource(entry.source);
  card.dataset.search = `${entry.name} ${entry.id} ${entry.group} ${entry.kind} ${sourceUrl}`.toLocaleLowerCase();

  const description = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'dataset-title';
  title.append(document.createTextNode(entry.name || entry.id));
  const type = document.createElement('span');
  type.className = 'dataset-type';
  type.textContent = entry.kind;
  title.append(type);
  description.append(title);

  const metadata = document.createElement('p');
  metadata.className = 'dataset-meta';
  metadata.textContent = [
    `CRS: ${entry.qgisCrs || entry.projection || (entry.kind === 'GeoJSON' ? 'EPSG:4326' : 'EPSG:29902')}`,
    cogStyleLabel(entry, config)
  ].filter(Boolean).join(' · ');
  description.append(metadata);

  const sourceLink = document.createElement('a');
  sourceLink.className = 'dataset-url';
  sourceLink.href = sourceUrl;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  sourceLink.textContent = sourceUrl;
  description.append(sourceLink);
  description.append(renderMetadata(entry, config));

  const actions = document.createElement('div');
  actions.className = 'dataset-actions';
  const qgisButton = makeButton('QGIS .qlr', async () => {
    qgisButton.disabled = true;
    message.classList.remove('error');
    message.textContent = entry.kind === 'COG'
      ? 'Preparing QGIS layer definition and sampling COG values…'
      : 'Preparing QGIS layer definition…';
    try {
      downloadDefinition(await qgisDefinition(entry, sourceUrl, config), entry.name || entry.id);
      message.textContent = entry.kind === 'COG'
        ? 'QGIS layer definition downloaded with the configured COG style.'
        : 'QGIS layer definition downloaded with the configured GeoJSON style.';
    } catch (error) {
      message.classList.add('error');
      message.textContent = `Could not create QGIS layer definition: ${error.message}`;
    } finally {
      qgisButton.disabled = false;
    }
  });
  const copyButton = makeButton('Copy URL', async () => {
    message.classList.remove('error');
    try {
      await navigator.clipboard.writeText(sourceUrl);
      message.textContent = 'Source URL copied to clipboard.';
    } catch {
      message.textContent = 'Clipboard unavailable; copy the URL from the prompt.';
      window.prompt('Copy this source URL', sourceUrl);
    }
  });
  actions.append(qgisButton, copyButton);

  const message = document.createElement('p');
  message.className = 'dataset-message';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  card.append(description, actions, message);
  return card;
}

function render(config) {
  const groups = new Map();
  catalogEntries(config).forEach(entry => {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  });
  const sortedGroups = [...groups].sort(([left], [right]) =>
    left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true }));
  let totalEntries = 0;
  sortedGroups.forEach(([groupName, entries]) => {
    entries.sort((left, right) =>
      String(left.name || left.id).localeCompare(String(right.name || right.id), undefined, { sensitivity: 'base', numeric: true }));
    const section = document.createElement('details');
    section.className = 'dataset-group';
    section.open = true;
    const summary = document.createElement('summary');
    const heading = document.createElement('span');
    heading.textContent = groupName;
    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = `${entries.length} dataset${entries.length === 1 ? '' : 's'}`;
    summary.append(heading, count);
    const list = document.createElement('div');
    list.className = 'group-items';
    entries.forEach(entry => list.append(renderEntry(entry, config)));
    totalEntries += entries.length;
    section.append(summary, list);
    catalogue.append(section);
  });
  if (!totalEntries) throw new Error('No GeoJSON or COG datasets are configured for this profile.');
  status.textContent = `${totalEntries} datasets across ${sortedGroups.length} groups.`;

  search.addEventListener('input', () => {
    const term = search.value.trim().toLocaleLowerCase();
    catalogue.querySelectorAll('.dataset-group').forEach(group => {
      const cards = [...group.querySelectorAll('.dataset-card')];
      let visible = 0;
      cards.forEach(card => {
        card.hidden = term !== '' && !card.dataset.search.includes(term);
        if (!card.hidden) visible += 1;
      });
      group.hidden = visible === 0;
    });
  });
}

async function start() {
  const configPath = profileConfigs[profile];
  if (!configPath) throw new Error(`Unknown profile "${profile}".`);
  await loadScript(configPath);
  if (!window.CONFIG) throw new Error(`${configPath} did not define window.CONFIG.`);
  encodeCogUrls(window.CONFIG);
  await loadGeojsonStyles(window.CONFIG);
  render(window.CONFIG);
}

start().catch(error => {
  status.classList.add('error');
  status.textContent = `Could not load the data catalogue: ${error.message}`;
});
