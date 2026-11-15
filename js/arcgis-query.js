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

export function buildArcgisQueryUrl(serviceUrl, layerId, envelope) {
  if (!/^\d+$/.test(String(layerId))) throw new Error(`Invalid ArcGIS layer ID: ${layerId}`);
  const url = new URL(serviceUrl);
  const match = url.pathname.match(/^(.*\/MapServer)(?:\/\d+)?\/?$/i);
  if (!match) throw new Error(`Not an ArcGIS MapServer URL: ${serviceUrl}`);
  if (![envelope?.xmin, envelope?.ymin, envelope?.xmax, envelope?.ymax].every(Number.isFinite) ||
      envelope.xmin > envelope.xmax || envelope.ymin > envelope.ymax) {
    throw new Error('Invalid ArcGIS query envelope.');
  }

  url.pathname = `${match[1]}/${layerId}/query`;
  url.searchParams.set('geometry', JSON.stringify({
    xmin: envelope.xmin,
    ymin: envelope.ymin,
    xmax: envelope.xmax,
    ymax: envelope.ymax,
    spatialReference: { wkid: 4326 }
  }));
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');
  return url.href;
}

export function parseArcgisQueryResponse(response) {
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
    throw new Error('ArcGIS query result exceeded the service record limit.');
  }
  return response.features.map(feature => {
    if (!feature?.attributes || typeof feature.attributes !== 'object' || Array.isArray(feature.attributes)) {
      throw new Error('Invalid ArcGIS query response: feature is missing attributes.');
    }
    return feature.attributes;
  });
}
