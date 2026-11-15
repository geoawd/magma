export function createTerraDrawController({
  map,
  window,
  loadStylesheet,
  loadScript
}) {
  let controlPromise = null;

  function ensureLoaded() {
    if (!controlPromise) {
      controlPromise = (async () => {
        const css = 'https://cdn.jsdelivr.net/npm/@watergis/maplibre-gl-terradraw@1.0.1/dist/maplibre-gl-terradraw.css';
        const script = 'https://cdn.jsdelivr.net/npm/@watergis/maplibre-gl-terradraw@1.0.1/dist/maplibre-gl-terradraw.umd.js';
        await Promise.all([
          loadStylesheet(css, 'sha384-kWhXkxsLl6DODYRUoNdPQrEwAFVzLoegtEL9WR3Xybrqmi+2HSENt8VyRofcRDUG'),
          loadScript(script, 'sha384-yhep21kwwLZCV1aZfqjNeKXP6znnkpri9p4oBTDjwidlfwiFuxVEDfhTtTaEi1Ag')
        ]);
        const Control = window.MaplibreTerradrawControl?.MaplibreTerradrawControl;
        if (typeof Control !== 'function') throw new Error('The drawing tools did not initialize.');
        const control = new Control({
          modes: ['linestring', 'freehand', 'select', 'delete-selection', 'delete', 'download'],
          open: true
        });
        const onAdd = control.onAdd.bind(control);
        control.onAdd = mapInstance => {
          const container = onAdd(mapInstance);
          container.classList.add('advanced-drawing-tools');
          return container;
        };
        map.addControl(control, 'top-right');
        const mapContainer = map.getContainer();
        const locationControl = mapContainer
          .querySelector('.maplibregl-ctrl-geolocate')?.closest('.maplibregl-ctrl');
        const drawingControl = mapContainer
          .querySelector('.advanced-drawing-tools')?.closest('.maplibregl-ctrl');
        if (locationControl && drawingControl) locationControl.after(drawingControl);
        return control;
      })().catch(error => {
        controlPromise = null;
        throw error;
      });
    }
    return controlPromise;
  }

  return { ensureLoaded };
}
