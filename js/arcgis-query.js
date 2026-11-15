export function arcgisLayerIds(layers, serviceUrl) {
  const match = typeof serviceUrl === 'string'
    ? new URL(serviceUrl, globalThis.location?.href || 'http://localhost').pathname.match(/\/MapServer(?:\/(\d+))?\/?$/i)
    : null;
  const configured = layers == null || layers === '' ? match?.[1] : String(layers);
  if (configured == null || configured === '') {
    throw new Error('No ArcGIS layer IDs are configured.');
  }
  const ids = configured.replace(/^show:/i, '').split(',').map(id => id.trim());
  if (ids.some(id => !/^\d+$/.test(id))) {
    throw new Error(`Invalid ArcGIS layer IDs: ${configured}`);
  }
  return ids;
}

export function buildArcgisQueryUrl(
  serviceUrl, layerId, geometry, geometryType = 'esriGeometryEnvelope', returnGeometry = false
) {
  if (!/^\d+$/.test(String(layerId))) throw new Error(`Invalid ArcGIS layer ID: ${layerId}`);
  const url = new URL(serviceUrl);
  const match = url.pathname.match(/^(.*\/MapServer)(?:\/\d+)?\/?$/i);
  if (!match) throw new Error(`Not an ArcGIS MapServer URL: ${serviceUrl}`);
  if (geometryType === 'esriGeometryEnvelope') {
    if (![geometry?.xmin, geometry?.ymin, geometry?.xmax, geometry?.ymax].every(Number.isFinite) ||
        geometry.xmin > geometry.xmax || geometry.ymin > geometry.ymax) {
      throw new Error('Invalid ArcGIS query envelope.');
    }
    geometry = { ...geometry, spatialReference: { wkid: 4326 } };
  } else if (geometryType === 'esriGeometryPolygon') {
    if (!Array.isArray(geometry?.rings) || !geometry.rings.length ||
        geometry.rings.some(ring => !Array.isArray(ring) || ring.length < 4 ||
          ring.some(point => !Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite)))) {
      throw new Error('Invalid ArcGIS query polygon.');
    }
    geometry = { ...geometry, spatialReference: { wkid: 4326 } };
  } else {
    throw new Error(`Unsupported ArcGIS geometry type: ${geometryType}`);
  }

  url.pathname = `${match[1]}/${layerId}/query`;
  url.searchParams.set('geometry', JSON.stringify(geometry));
  url.searchParams.set('geometryType', geometryType);
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', String(returnGeometry));
  url.searchParams.set('resultRecordCount', '500');
  if (returnGeometry) url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'json');
  return url.href;
}

function arcgisGeometryZoomPoint(geometry) {
  if (!geometry) return null;
  const coordinates = [];
  const collect = value => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      coordinates.push([value[0], value[1]]);
      return;
    }
    value.forEach(collect);
  };
  if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    coordinates.push([geometry.x, geometry.y]);
  } else if (Number.isFinite(geometry.xmin) && Number.isFinite(geometry.ymin) &&
      Number.isFinite(geometry.xmax) && Number.isFinite(geometry.ymax)) {
    coordinates.push(
      [geometry.xmin, geometry.ymin],
      [geometry.xmax, geometry.ymax]
    );
  } else if (Array.isArray(geometry.points)) {
    collect(geometry.points);
  } else if (Array.isArray(geometry.paths)) {
    collect(geometry.paths);
  } else if (Array.isArray(geometry.rings)) {
    collect(geometry.rings);
  } else {
    throw new Error('Unsupported ArcGIS feature geometry.');
  }
  if (!coordinates.length) throw new Error('ArcGIS feature geometry has no valid coordinates.');
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return {
    type: 'Point',
    coordinates: [
      (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      (Math.min(...latitudes) + Math.max(...latitudes)) / 2
    ]
  };
}

export function parseArcgisQueryResponse(response, { includeGeometry = false } = {}) {
  if (response?.error) {
    const details = Array.isArray(response.error.details) ? response.error.details.join('; ') : '';
    const message = response.error.message || 'Unknown ArcGIS query error';
    throw new Error([response.error.code && `code ${response.error.code}`, message, details]
      .filter(Boolean).join(': '));
  }
  if (!Array.isArray(response?.features)) {
    throw new Error('Invalid ArcGIS query response: expected a features array.');
  }
  if (response.exceededTransferLimit === true) {
    throw new Error('ArcGIS query result exceeded the record limit; zoom in or draw a smaller box.');
  }
  return response.features.map(feature => {
    if (!feature?.attributes || typeof feature.attributes !== 'object' || Array.isArray(feature.attributes)) {
      throw new Error('Invalid ArcGIS query response: feature is missing attributes.');
    }
    return includeGeometry
      ? { attributes: feature.attributes, geometry: arcgisGeometryZoomPoint(feature.geometry) }
      : feature.attributes;
  });
}
