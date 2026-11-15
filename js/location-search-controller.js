const IRISH_GRID_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

export function parseIrishGridReference(query) {
  const normalized = query.trim().toUpperCase();
  let match = normalized.match(/^([A-HJ-Z])\s*(\d[\d\s]*)$/);
  if (match) {
    const parts = match[2].trim().split(/\s+/);
    let easting, northing;
    if (parts.length === 2 && parts[0].length === parts[1].length) [easting, northing] = parts;
    else if (parts.length === 1 && parts[0].length % 2 === 0) {
      [easting, northing] = [
        parts[0].slice(0, parts[0].length / 2),
        parts[0].slice(parts[0].length / 2)
      ];
    }
    if (easting && easting.length <= 5) {
      const index = IRISH_GRID_LETTERS.indexOf(match[1]);
      return {
        E: (index % 5) * 100000 + Number(easting.padEnd(5, '0')),
        N: (4 - Math.floor(index / 5)) * 100000 + Number(northing.padEnd(5, '0'))
      };
    }
  }
  match = normalized.match(/^(?:E\s*)?(\d{5,6})\s*(?:,|N|\s)\s*(?:N\s*)?(\d{5,6})$/);
  return match ? { E: Number(match[1]), N: Number(match[2]) } : null;
}

export function createLocationSearchController({
  map,
  maplibregl,
  input,
  goButton,
  list,
  status,
  getConfig,
  projectGrid,
  isMobile,
  getActiveTool,
  openTool,
  escapeHtml,
  fetchImpl = globalThis.fetch
}) {
  let marker = null;

  function showMessage(text) {
    status.textContent = text;
    list.innerHTML = `<li class="msg">${escapeHtml(text)}</li>`;
    list.hidden = false;
  }

  function goTo(lngLat, label, bbox) {
    list.hidden = true;
    status.textContent = `Location selected: ${label}.`;
    if (marker) marker.remove();
    marker = new maplibregl.Marker({ color: '#e8590c' }).setLngLat(lngLat)
      .setPopup(new maplibregl.Popup({ offset: 24 }).setText(label)).addTo(map);
    marker.togglePopup();
    if (bbox) map.fitBounds(bbox, { padding: 40, maxZoom: 17 });
    else map.flyTo({ center: lngLat, zoom: 16 });
    const activeTool = getActiveTool();
    if (isMobile() && activeTool) openTool(activeTool);
    input.focus();
  }

  async function search() {
    const query = input.value.trim();
    if (!query) {
      list.hidden = true;
      status.textContent = '';
      return;
    }
    const gridReference = parseIrishGridReference(query);
    if (gridReference) {
      const lngLat = projectGrid(gridReference);
      if (lngLat[0] < -11 || lngLat[0] > -5 || lngLat[1] < 51 || lngLat[1] > 56) {
        return showMessage('That grid reference is outside Ireland.');
      }
      return goTo(lngLat, `Irish Grid E ${gridReference.E} N ${gridReference.N}`);
    }
    const coordinates = query.includes('.') &&
      query.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (coordinates && Math.abs(coordinates[1]) <= 90 && Math.abs(coordinates[2]) <= 180) {
      return goTo([Number(coordinates[2]), Number(coordinates[1])], `${coordinates[1]}, ${coordinates[2]}`);
    }
    showMessage('Searching…');
    try {
      const searchConfig = getConfig().search || {};
      const response = await fetchImpl('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=' +
        (searchConfig.limit || 5) +
        (searchConfig.countrycodes ? '&countrycodes=' + searchConfig.countrycodes : '') +
        '&q=' + encodeURIComponent(query));
      const results = await response.json();
      if (!results.length) {
        return showMessage('No places found. Try a town name, a postcode or a grid reference such as J 3374 7396.');
      }
      const pick = result => goTo(
        [Number(result.lon), Number(result.lat)],
        result.display_name,
        result.boundingbox && [
          [Number(result.boundingbox[2]), Number(result.boundingbox[0])],
          [Number(result.boundingbox[3]), Number(result.boundingbox[1])]
        ]
      );
      if (results.length === 1) return pick(results[0]);
      status.textContent = `${results.length} locations found. Choose a result.`;
      list.innerHTML = results.map((result, index) =>
        `<li><button type="button" class="geo-result" data-i="${index}">${escapeHtml(result.display_name)}</button></li>`
      ).join('');
      list.querySelectorAll('.geo-result').forEach(button => {
        button.onclick = () => pick(results[button.dataset.i]);
      });
    } catch {
      showMessage('Search failed. Check your connection and try again.');
    }
  }

  goButton.onclick = search;
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') search();
    if (event.key === 'Escape') {
      list.hidden = true;
      status.textContent = '';
    }
  });
  input.addEventListener('search', () => {
    if (!input.value) {
      list.hidden = true;
      if (marker) {
        marker.remove();
        marker = null;
      }
    }
  });
  map.on('click', () => { list.hidden = true; });

  return { search, goTo };
}
