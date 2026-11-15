export function createJsonThemePopupController({
  document,
  map,
  maplibregl,
  getConfig,
  getState,
  renderCell
}) {
  if (!document || !map || !maplibregl?.Popup ||
      typeof getConfig !== 'function' || typeof getState !== 'function' ||
      typeof renderCell !== 'function') {
    throw new TypeError('JSON theme popup dependencies are required.');
  }

  function createSection(label, collapsed, accordionRoot) {
    const section = document.createElement('section');
    section.className = `idsec${collapsed ? ' collapsed' : ''}`;
    const heading = document.createElement('div');
    heading.className = 'idhead';
    heading.tabIndex = 0;
    heading.setAttribute('role', 'button');
    heading.setAttribute('aria-expanded', String(!collapsed));
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm6 9 6 6 6-6');
    arrow.appendChild(path);
    const text = document.createElement('span');
    text.className = 'idname';
    text.textContent = label;
    heading.append(arrow, text);
    const body = document.createElement('div');
    body.className = 'idbody';
    const records = document.createElement('div');
    records.className = 'idtab';
    body.appendChild(records);
    const toggle = () => {
      const expand = section.classList.contains('collapsed');
      if (expand) accordionRoot.querySelectorAll('.idsec:not(.collapsed)').forEach(open => {
        if (open === section) return;
        open.classList.add('collapsed');
        open.querySelector('.idhead')?.setAttribute('aria-expanded', 'false');
      });
      section.classList.toggle('collapsed', !expand);
      heading.setAttribute('aria-expanded', String(expand));
    };
    heading.onclick = toggle;
    heading.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    };
    section.append(heading, body);
    return { section, body, records };
  }

  function showJsonThemePopup(event) {
    let feature = event.features?.[0];
    if (!feature) return;
    const config = getConfig();
    const state = getState();
    if (config.geometryDataset) {
      feature = state.featureById.get(String(feature.properties[config.geometryLinkField || config.linkField]));
      if (!feature) return;
    }
    const primary = config.tabs.find(tab => tab.isPrimary);
    const id = feature.properties[config.linkField];
    const clickedAt = [event.lngLat.lng, event.lngLat.lat];
    const content = document.createElement('div');
    content.className = 'idwrap';
    const title = document.createElement('div');
    title.className = 'idtitle';
    title.textContent = String(feature.properties[config.labelField] || id || 'Borehole');
    content.appendChild(title);

    const details = createSection('Borehole details', false, content);
    (config.popupFields || []).forEach(field => {
      if (field.type === 'zoomLink') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'json-popup-zoom';
        button.textContent = field.label || 'Zoom to site';
        button.onclick = () => map.flyTo({ center: clickedAt, zoom: Math.max(map.getZoom(), 14) });
        details.records.appendChild(button);
        return;
      }
      const value = feature.properties[field.field];
      if (value == null || value === '') return;
      const line = document.createElement('div');
      line.className = 'arow';
      const key = document.createElement('div');
      key.className = 'akey';
      key.textContent = field.label || field.field;
      const valueCell = renderCell(feature.properties, primary.key, field.field);
      valueCell.className = 'aval';
      if (field.bold) {
        const strong = document.createElement('strong');
        while (valueCell.firstChild) strong.appendChild(valueCell.firstChild);
        valueCell.appendChild(strong);
      }
      if (field.suffix) valueCell.append(` ${field.suffix.trim()}`);
      line.append(key, valueCell);
      details.records.appendChild(line);
    });
    content.appendChild(details.section);

    config.tabs.filter(tab => !tab.isPrimary).forEach(tab => {
      const rows = (state.visibleRows[tab.key] || []).filter(row =>
        String(row[config.linkField]) === String(id)
      );
      if (!rows.length) return;
      const section = createSection(`${tab.label} (${rows.length})`, true, content);
      section.section.classList.add('linked');
      let current = 0;
      let pageLabel = null;
      if (rows.length > 1) {
        const pager = document.createElement('div');
        pager.className = 'pophead';
        const previous = document.createElement('button');
        previous.type = 'button';
        previous.className = 'nav';
        previous.textContent = '\u25c0';
        previous.setAttribute('aria-label', `Previous ${tab.label} result`);
        pageLabel = document.createElement('span');
        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'nav';
        next.textContent = '\u25b6';
        next.setAttribute('aria-label', `Next ${tab.label} result`);
        previous.onclick = () => { current = (current + rows.length - 1) % rows.length; renderPage(); };
        next.onclick = () => { current = (current + 1) % rows.length; renderPage(); };
        pager.append(previous, pageLabel, next);
        section.body.appendChild(pager);
      }
      const renderPage = () => {
        const row = rows[current];
        section.records.replaceChildren();
        if (pageLabel) pageLabel.textContent = `${current + 1} of ${rows.length}`;
        Object.entries(row).filter(([field, value]) =>
          !config.hiddenColumns.includes(field) && value !== null && value !== undefined && value !== ''
        ).forEach(([field]) => {
          const line = document.createElement('div');
          line.className = 'arow';
          const key = document.createElement('div');
          key.className = 'akey';
          key.textContent = field;
          const value = renderCell(row, tab.key, field);
          value.className = 'aval';
          line.append(key, value);
          section.records.appendChild(line);
        });
      };
      renderPage();
      content.appendChild(section.section);
    });
    new maplibregl.Popup({ maxWidth: '360px', className: 'idpop' })
      .setLngLat(clickedAt).setDOMContent(content).addTo(map);
    return content;
  }

  function appendArcgisFeaturesToJsonThemePopup(content, features) {
    if (!content || !features.length) return;
    const grouped = new Map();
    features.forEach(feature => {
      const name = feature.sourceLayer || feature.layer.id;
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(feature);
    });
    grouped.forEach((items, name) => {
      const section = createSection(`${name} (${items.length})`, true, content);
      let current = 0;
      let pageLabel = null;
      if (items.length > 1) {
        const pager = document.createElement('div');
        pager.className = 'pophead';
        const previous = document.createElement('button');
        previous.type = 'button';
        previous.className = 'nav';
        previous.textContent = '\u2190';
        previous.setAttribute('aria-label', `Previous ${name} result`);
        const page = document.createElement('span');
        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'nav';
        next.textContent = '\u2192';
        next.setAttribute('aria-label', `Next ${name} result`);
        previous.onclick = () => { current = (current + items.length - 1) % items.length; render(); };
        next.onclick = () => { current = (current + 1) % items.length; render(); };
        pageLabel = page;
        pager.append(previous, pageLabel, next);
        section.body.appendChild(pager);
      }
      const render = () => {
        const properties = items[current].properties || {};
        section.records.replaceChildren();
        if (pageLabel) pageLabel.textContent = `${current + 1} of ${items.length}`;
        Object.entries(properties).filter(([, value]) =>
          value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '')
        ).forEach(([field, value]) => {
          const line = document.createElement('div');
          line.className = 'arow';
          const key = document.createElement('div');
          key.className = 'akey';
          key.textContent = field;
          const cell = document.createElement('div');
          cell.className = 'aval';
          cell.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value);
          line.append(key, cell);
          section.records.appendChild(line);
        });
      };
      render();
      content.appendChild(section.section);
    });
  }

  return { showJsonThemePopup, appendArcgisFeaturesToJsonThemePopup };
}
