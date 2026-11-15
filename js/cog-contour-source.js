export function decodeContourDemPixels(pixels, width, height) {
  const data = new Float32Array(width * height);
  for (let index = 0; index < data.length; index++) {
    const offset = index * 4;
    const encoded = pixels[offset] * 65536 + pixels[offset + 1] * 256 + pixels[offset + 2];
    // The COG protocol uses opaque encoded 100000 as its zero-metre no-data sentinel.
    data[index] = pixels[offset + 3] < 255 || encoded === 100000
      ? NaN
      : encoded * 0.1 - 10000;
  }
  return { width, height, data };
}

export function createCogContourSourceController({
  maplibregl,
  contourLibrary = () => globalThis.window?.mlcontour,
  getCogProtocol = () => globalThis.window?.MaplibreCOGProtocol?.cogProtocol,
  createCanvas = (width, height) => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    return Object.assign(document.createElement('canvas'), { width, height });
  }
}) {
  const sources = new Map();

  function getSource(cogUrl, maxzoom) {
    if (sources.has(cogUrl)) return sources.get(cogUrl);
    const DemSource = contourLibrary().DemSource;
    const source = new DemSource({
      url: `cog://${cogUrl}#dem/{z}/{x}/{y}`,
      encoding: 'mapbox',
      maxzoom,
      worker: false,
      cacheSize: 128
    });
    source.manager.getTile = async (url, abortController) => {
      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { data: bitmap } = await getCogProtocol()({ url, type: 'image' });
      if (abortController.signal.aborted) {
        bitmap.close();
        throw new DOMException('Aborted', 'AbortError');
      }
      return { data: bitmap };
    };
    source.manager.decodeImage = async bitmap => {
      const { width, height } = bitmap;
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      return decodeContourDemPixels(context.getImageData(0, 0, width, height).data, width, height);
    };
    source.setupMaplibre(maplibregl);
    sources.set(cogUrl, source);
    return source;
  }

  return { getSource };
}
