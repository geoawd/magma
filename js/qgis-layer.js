export const QGIS_TURBO_COLORS = [
  '#30123b', '#466be3', '#29bbec', '#32f298', '#a4fc3c',
  '#f9ba38', '#f66b19', '#ca2518', '#7a0403'
];

const IRISH_GRID_SRS = `<spatialrefsys nativeFormat="Wkt">
  <wkt>PROJCRS["TM65 / Irish Grid",BASEGEOGCRS["TM65",DATUM["TM65",ELLIPSOID["Airy Modified 1849",6377340.189,299.3249646,LENGTHUNIT["metre",1]]],PRIMEM["Greenwich",0,ANGLEUNIT["degree",0.0174532925199433]],ID["EPSG",4299]],CONVERSION["Irish Grid",METHOD["Transverse Mercator",ID["EPSG",9807]],PARAMETER["Latitude of natural origin",53.5,ANGLEUNIT["degree",0.0174532925199433],ID["EPSG",8801]],PARAMETER["Longitude of natural origin",-8,ANGLEUNIT["degree",0.0174532925199433],ID["EPSG",8802]],PARAMETER["Scale factor at natural origin",1.000035,SCALEUNIT["unity",1],ID["EPSG",8805]],PARAMETER["False easting",200000,LENGTHUNIT["metre",1],ID["EPSG",8806]],PARAMETER["False northing",250000,LENGTHUNIT["metre",1],ID["EPSG",8807]]],CS[Cartesian,2],AXIS["(E)",east,ORDER[1],LENGTHUNIT["metre",1]],AXIS["(N)",north,ORDER[2],LENGTHUNIT["metre",1]],USAGE[SCOPE["Engineering survey, topographic mapping."],AREA["Ireland - onshore."],BBOX[51.39,-10.56,55.43,-5.93]],ID["EPSG",29902]]</wkt>
  <proj4>+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +a=6377340.189 +rf=299.3249646 +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs</proj4>
  <srsid>2564</srsid>
  <srid>29902</srid>
  <authid>EPSG:29902</authid>
  <description>TM65 / Irish Grid</description>
  <projectionacronym>tmerc</projectionacronym>
  <ellipsoidacronym>EPSG:7002</ellipsoidacronym>
  <geographicflag>false</geographicflag>
</spatialrefsys>`;

const WGS84_SRS = `<spatialrefsys nativeFormat="Wkt">
  <wkt>GEOGCRS["WGS 84",DATUM["World Geodetic System 1984",ELLIPSOID["WGS 84",6378137,298.257223563,LENGTHUNIT["metre",1]]],PRIMEM["Greenwich",0,ANGLEUNIT["degree",0.0174532925199433]],CS[ellipsoidal,2],AXIS["geodetic latitude (Lat)",north,ORDER[1],ANGLEUNIT["degree",0.0174532925199433]],AXIS["geodetic longitude (Lon)",east,ORDER[2],ANGLEUNIT["degree",0.0174532925199433]],ANGLEUNIT["degree",0.0174532925199433],ID["EPSG",4326]]</wkt>
  <proj4>+proj=longlat +datum=WGS84 +no_defs</proj4>
  <srsid>3452</srsid>
  <srid>4326</srid>
  <authid>EPSG:4326</authid>
  <description>WGS 84</description>
  <projectionacronym>longlat</projectionacronym>
  <ellipsoidacronym>EPSG:7030</ellipsoidacronym>
  <geographicflag>true</geographicflag>
</spatialrefsys>`;

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  })[character]);
}

function qgisValue(value) {
  return Number(value.toPrecision(10)).toString();
}

function grayRenderer(opacity, minimum, maximum) {
  const hasRange = Number.isFinite(minimum) && Number.isFinite(maximum) && minimum < maximum;
  const rangeAttributes = hasRange
    ? ` classificationMin="${qgisValue(minimum)}" classificationMax="${qgisValue(maximum)}"`
    : '';
  const enhancement = hasRange
    ? `<contrastEnhancement>
            <minValue>${qgisValue(minimum)}</minValue>
            <maxValue>${qgisValue(maximum)}</maxValue>
            <algorithm>StretchToMinimumMaximum</algorithm>
          </contrastEnhancement>`
    : `<contrastEnhancement><algorithm>NoEnhancement</algorithm></contrastEnhancement>`;
  return `        <rasterrenderer alphaBand="-1" grayBand="1" nodataColor="" opacity="${qgisValue(opacity)}" type="singlebandgray"${rangeAttributes}>
          <rasterTransparency/>
          <minMaxOrigin>
            <limits>${hasRange ? 'MinMax' : 'None'}</limits>
            <extent>WholeRaster</extent>
            <statAccuracy>Estimated</statAccuracy>
            <cumulativeCutLower>0.02</cumulativeCutLower>
            <cumulativeCutUpper>0.98</cumulativeCutUpper>
            <stdDevFactor>2</stdDevFactor>
          </minMaxOrigin>
          ${enhancement}
        </rasterrenderer>
`;
}

export function buildQgisLayerDefinition({
  id,
  name,
  url,
  opacity = 1,
  minimum,
  maximum,
  colorStops = [],
  discrete = false,
  renderer = 'gray',
  crsAuthId = 'EPSG:29902'
}) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('A valid HTTP or HTTPS raster URL is required.');
  }
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('Raster opacity must be between 0 and 1.');
  }

  const layerId = String(id || 'raster-layer').replace(/[^A-Za-z0-9_-]+/g, '_');
  const layerName = String(name || layerId);
  const source = `/vsicurl/${url}`;
  const spatialRef = crsAuthId === 'EPSG:29902'
    ? IRISH_GRID_SRS
    : `<spatialrefsys nativeFormat="Wkt"><authid>${escapeXml(crsAuthId)}</authid></spatialrefsys>`;
  let rendererXml = '';

  if (renderer === 'none') {
    rendererXml = '';
  } else if (!colorStops.length) {
    rendererXml = grayRenderer(opacity, minimum, maximum);
  } else {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
      throw new Error('A varying finite raster value range is required for the color style.');
    }
    let previousValue = -Infinity;
    const items = colorStops.map(stop => {
      if (!Number.isFinite(stop.value) || stop.value <= previousValue
        || !/^#[\da-f]{6}$/i.test(stop.color)) {
        throw new Error('Raster color stops must have increasing values and six-digit hex colors.');
      }
      previousValue = stop.value;
      const value = qgisValue(stop.value);
      const label = stop.label || value;
      return `              <item alpha="255" color="${stop.color.toLowerCase()}" label="${escapeXml(label)}" value="${value}"/>`;
    }).join('\n');
    const styleMaximum = Math.max(maximum, previousValue);
    rendererXml = `        <rasterrenderer alphaBand="-1" band="1" classificationMax="${qgisValue(styleMaximum)}" classificationMin="${qgisValue(minimum)}" nodataColor="" opacity="${qgisValue(opacity)}" type="singlebandpseudocolor">
          <rasterTransparency/>
          <minMaxOrigin>
            <limits>MinMax</limits>
            <extent>WholeRaster</extent>
            <statAccuracy>Estimated</statAccuracy>
            <cumulativeCutLower>0.02</cumulativeCutLower>
            <cumulativeCutUpper>0.98</cumulativeCutUpper>
            <stdDevFactor>2</stdDevFactor>
          </minMaxOrigin>
          <rastershader>
            <colorrampshader classificationMode="${discrete ? '1' : '3'}" clip="0" colorRampType="${discrete ? 'DISCRETE' : 'INTERPOLATED'}" labelPrecision="6" maximumValue="${qgisValue(styleMaximum)}" minimumValue="${qgisValue(minimum)}">
${items}
            </colorrampshader>
          </rastershader>
        </rasterrenderer>
`;
  }

  return `<!DOCTYPE qgis-layer-definition>
<qlr>
  <layer-tree-group checked="Qt::Checked" expanded="1" groupLayer="" name="" wms-group-request-mode="Normal">
    <customproperties>
      <Option/>
    </customproperties>
    <layer-tree-layer checked="Qt::Checked" expanded="1" id="${escapeXml(layerId)}" legend_exp="" legend_split_behavior="0" name="${escapeXml(layerName)}" patch_size="-1,-1" providerKey="gdal" source="${escapeXml(source)}">
      <customproperties>
        <Option/>
      </customproperties>
    </layer-tree-layer>
  </layer-tree-group>
  <maplayers>
    <maplayer autoRefreshMode="Disabled" autoRefreshTime="0" hasScaleBasedVisibilityFlag="0" layerType="Raster" legendPlaceholderImage="" maxScale="0" minScale="1e+08" refreshOnNotifyEnabled="0" refreshOnNotifyMessage="" styleCategories="AllStyleCategories" type="raster">
      <id>${escapeXml(layerId)}</id>
      <datasource>${escapeXml(source)}</datasource>
      <layername>${escapeXml(layerName)}</layername>
      <srs>
        ${spatialRef}
      </srs>
      <provider>gdal</provider>
      <noData>
        <noDataList bandNo="1" useSrcNoData="1"/>
      </noData>
      <pipe>
        <provider>
          <resampling enabled="false" maxOversampling="2" zoomedInResamplingMethod="nearestNeighbour" zoomedOutResamplingMethod="nearestNeighbour"/>
        </provider>
${rendererXml}        <brightnesscontrast brightness="0" contrast="0" gamma="1"/>
        <huesaturation colorizeBlue="128" colorizeGreen="128" colorizeOn="0" colorizeRed="255" colorizeStrength="100" grayscaleMode="0" invertColors="0" saturation="0"/>
        <rasterresampler maxOversampling="2" zoomedInResampler="bilinear" zoomedOutResampler="bilinear"/>
        <resamplingStage>resamplingFilter</resamplingStage>
      </pipe>
      <blendMode>0</blendMode>
      <legend/>
    </maplayer>
  </maplayers>
</qlr>
`;
}

function qgisColor(color) {
  if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) {
    throw new Error('GeoJSON QGIS styles require six-digit hex colors.');
  }
  const hex = color.slice(1);
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const normalized = channels.map(channel => (channel / 255).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''));
  return `${channels.join(',')},255,rgb:${normalized.join(',')},1`;
}

function geojsonSymbol(name, geometryType, color, style) {
  const rgb = qgisColor(color);
  const width = Number.isFinite(style?.width) && style.width >= 0 ? style.width : 0.5;
  let symbolType;
  let symbolLayer;

  if (geometryType === 'point') {
    symbolType = 'marker';
    symbolLayer = `<layer class="SimpleMarker" enabled="1" locked="0" pass="0">
          <Option type="Map">
            <Option name="name" type="QString" value="circle"/>
            <Option name="size" type="QString" value="${qgisValue(Number.isFinite(style?.radius) ? Math.max(0.1, style.radius * 2) : 3)}"/>
            <Option name="size_unit" type="QString" value="MM"/>
            <Option name="color" type="QString" value="${rgb}"/>
            <Option name="outline_color" type="QString" value="${rgb}"/>
            <Option name="outline_width" type="QString" value="${qgisValue(Math.max(0.1, width))}"/>
            <Option name="outline_width_unit" type="QString" value="MM"/>
          </Option>
          <prop k="name" v="circle"/>
        </layer>`;
  } else if (geometryType === 'line') {
    symbolType = 'line';
    symbolLayer = `<layer class="SimpleLine" enabled="1" locked="0" pass="0">
          <Option type="Map">
            <Option name="line_color" type="QString" value="${rgb}"/>
            <Option name="line_width" type="QString" value="${qgisValue(width)}"/>
            <Option name="line_width_unit" type="QString" value="MM"/>
            <Option name="line_style" type="QString" value="${style?.dasharray ? 'dash' : 'solid'}"/>
          </Option>
          <prop k="line_color" v="${rgb}"/>
          <prop k="line_width" v="${qgisValue(width)}"/>
          <prop k="line_style" v="${style?.dasharray ? 'dash' : 'solid'}"/>
        </layer>`;
  } else {
    symbolType = 'fill';
    symbolLayer = `<layer class="SimpleFill" enabled="1" locked="0" pass="0">
          <Option type="Map">
            <Option name="color" type="QString" value="${rgb}"/>
            <Option name="outline_color" type="QString" value="${rgb}"/>
            <Option name="outline_width" type="QString" value="${qgisValue(width)}"/>
            <Option name="outline_width_unit" type="QString" value="MM"/>
            <Option name="style" type="QString" value="solid"/>
          </Option>
          <prop k="color" v="${rgb}"/>
          <prop k="outline_color" v="${rgb}"/>
          <prop k="outline_width" v="${qgisValue(width)}"/>
        </layer>`;
  }

  return `<symbol alpha="1" clip_to_extent="1" force_rhr="0" name="${escapeXml(name)}" type="${symbolType}">
        ${symbolLayer}
      </symbol>`;
}

function geojsonGeometryType(geometryTypes = [], hint) {
  const values = [...geometryTypes, ...(Array.isArray(hint) ? hint : [hint])]
    .filter(value => typeof value === 'string')
    .map(value => value.toLowerCase());
  if (values.some(value => value.includes('polygon'))) return 'polygon';
  if (values.some(value => value.includes('line'))) return 'line';
  return 'point';
}

function geojsonSpatialRef(crsAuthId) {
  const authId = String(crsAuthId || 'EPSG:4326').trim().toUpperCase();
  if (authId === 'EPSG:4326') return WGS84_SRS;
  if (authId === 'EPSG:29902') return IRISH_GRID_SRS;
  return `<spatialrefsys nativeFormat="Wkt"><authid>${escapeXml(authId)}</authid></spatialrefsys>`;
}

export function buildGeojsonQgisLayerDefinition({
  id,
  name,
  url,
  opacity = 1,
  crsAuthId = 'EPSG:4326',
  geometryTypes = [],
  geometryType,
  style = {},
  categories = [],
  minimum,
  maximum
}) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('A valid HTTP or HTTPS GeoJSON URL is required.');
  }
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('GeoJSON opacity must be between 0 and 1.');
  }

  const layerId = String(id || 'geojson-layer').replace(/[^A-Za-z0-9_-]+/g, '_');
  const layerName = String(name || layerId);
  const source = `/vsicurl/${url}`;
  const geometry = geojsonGeometryType(geometryTypes, geometryType);
  const fallbackColor = typeof style.fill === 'string'
    ? style.fill
    : typeof style.color === 'string'
      ? style.color
      : categories.find(category => category?.other && /^#[\da-f]{6}$/i.test(category.color || ''))?.color
        || categories.find(category => /^#[\da-f]{6}$/i.test(category?.color || ''))?.color
        || '#808080';
  const matchCategories = categories.flatMap(category => {
    if (category?.other || !Array.isArray(category?.labels) || !/^#[\da-f]{6}$/i.test(category.color || '')) return [];
    return category.labels.map(value => ({ value, label: category.text, color: category.color }));
  });
  const rangeCategories = categories.filter(category =>
    Number.isFinite(category?.lo) || Number.isFinite(category?.hi));

  let renderer;
  if (matchCategories.length) {
    const field = categories.find(category => Array.isArray(category?.labels))?.field || '';
    const symbols = matchCategories.map((category, index) =>
      geojsonSymbol(String(index), geometry, category.color, style)).join('\n');
    const categoryXml = matchCategories.map((category, index) =>
      `<category value="${escapeXml(category.value)}" label="${escapeXml(category.label)}" symbol="${index}" render="true"/>`).join('\n');
    renderer = `<renderer-v2 attr="${escapeXml(field)}" enableorderby="0" symbollevels="0" type="categorizedSymbol">
        <categories>${categoryXml}</categories>
        <symbols>${symbols}</symbols>
        <source-symbol>${geojsonSymbol('source', geometry, fallbackColor, style)}</source-symbol>
      </renderer-v2>`;
  } else if (rangeCategories.length) {
    const minValue = Number.isFinite(minimum) ? minimum : -1e300;
    const maxValue = Number.isFinite(maximum) ? maximum : 1e300;
    const ranges = rangeCategories.map((category, index) => {
      const lower = Number.isFinite(category.lo) ? category.lo : minValue;
      const upper = Number.isFinite(category.hi) ? category.hi : maxValue;
      return `<range lower="${qgisValue(lower)}" upper="${qgisValue(upper)}" label="${escapeXml(category.text)}" symbol="${index}" render="true"/>`;
    }).join('\n');
    const symbols = rangeCategories.map((category, index) =>
      geojsonSymbol(String(index), geometry, category.color, style)).join('\n');
    const field = categories.find(category => Number.isFinite(category?.lo) || Number.isFinite(category?.hi))?.field || '';
    renderer = `<renderer-v2 attr="${escapeXml(field)}" enableorderby="0" symbollevels="0" type="graduatedSymbol">
        <ranges>${ranges}</ranges>
        <symbols>${symbols}</symbols>
        <source-symbol>${geojsonSymbol('source', geometry, fallbackColor, style)}</source-symbol>
        <mode>equal</mode>
      </renderer-v2>`;
  } else {
    renderer = `<renderer-v2 enableorderby="0" symbollevels="0" type="singleSymbol">
        <symbols>${geojsonSymbol('0', geometry, fallbackColor, style)}</symbols>
      </renderer-v2>`;
  }

  const spatialRef = geojsonSpatialRef(crsAuthId);
  return `<!DOCTYPE qgis-layer-definition>
<qlr>
  <layer-tree-group checked="Qt::Checked" expanded="1" groupLayer="" name="" wms-group-request-mode="Normal">
    <customproperties><Option/></customproperties>
    <layer-tree-layer checked="Qt::Checked" expanded="1" id="${escapeXml(layerId)}" legend_exp="" legend_split_behavior="0" name="${escapeXml(layerName)}" patch_size="-1,-1" providerKey="ogr" source="${escapeXml(source)}">
      <customproperties><Option/></customproperties>
    </layer-tree-layer>
  </layer-tree-group>
  <maplayers>
    <maplayer autoRefreshMode="Disabled" autoRefreshTime="0" hasScaleBasedVisibilityFlag="0" layerType="Vector" legendPlaceholderImage="" maxScale="0" minScale="1e+08" refreshOnNotifyEnabled="0" refreshOnNotifyMessage="" styleCategories="AllStyleCategories" type="vector">
      <id>${escapeXml(layerId)}</id>
      <datasource>${escapeXml(source)}</datasource>
      <layername>${escapeXml(layerName)}</layername>
      <srs>${spatialRef}</srs>
      <provider>ogr</provider>
      ${renderer}
      <blendMode>0</blendMode>
      <featureBlendMode>0</featureBlendMode>
      <layerOpacity>${qgisValue(opacity)}</layerOpacity>
      <labeling type="no"/>
      <customproperties><Option/></customproperties>
      <geometryOptions><removeDuplicateNodes>0</removeDuplicateNodes><geometryPrecision>0</geometryPrecision></geometryOptions>
      <legend/>
    </maplayer>
  </maplayers>
</qlr>
`;
}
