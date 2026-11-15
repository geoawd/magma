export function createMapClickController({
  map,
  document,
  maplibregl,
  queryData,
  around,
  arcgisClickEnvelope,
  queryArcgisOverlays,
  withLinked,
  getJsonThemeConfig,
  getJsonThemeState,
  isNotificationPicking,
  selectNotificationLocation,
  isBoxMode,
  isJustBoxed,
  datasetGeometryLayerIds,
  showJsonThemePopup,
  appendArcgisFeaturesToJsonThemePopup,
  escapeHtml,
  renderCell
}) {
  const callbacks = {
    queryData, around, arcgisClickEnvelope, queryArcgisOverlays, withLinked,
    getJsonThemeConfig, getJsonThemeState, isNotificationPicking, selectNotificationLocation,
    isBoxMode, isJustBoxed, datasetGeometryLayerIds, showJsonThemePopup,
    appendArcgisFeaturesToJsonThemePopup, escapeHtml, renderCell
  };
  if (!map || !document || typeof maplibregl?.Popup !== 'function') {
    throw new TypeError('Map, document, and MapLibre Popup are required.');
  }
  for (const [name, callback] of Object.entries(callbacks)) {
    if (typeof callback !== 'function') throw new TypeError(`${name} must be a function.`);
  }

  let generation = 0;
  const isCurrentAndUnblocked = queryGeneration =>
    queryGeneration === generation && !isBoxMode() && !isJustBoxed() && !isNotificationPicking();

  async function handleClick(event) {
    const queryGeneration = ++generation;
    if (isNotificationPicking()) {
      selectNotificationLocation(event.lngLat);
      return;
    }
    if (isBoxMode() || isJustBoxed()) return;

    let features = queryData(around(event.point));
    const geometryConfig = getJsonThemeConfig();
    if (geometryConfig?.geometryDataset) {
      const state = getJsonThemeState();
      const hit = features.find(feature =>
        datasetGeometryLayerIds(geometryConfig).includes(feature.layer.id) &&
        state.featureById.has(String(
          feature.properties?.[geometryConfig.geometryLinkField || geometryConfig.linkField]
        ))
      );
      if (hit) {
        const popupContent = showJsonThemePopup({ features: [hit], lngLat: event.lngLat });
        const arcgisFeatures = await queryArcgisOverlays(arcgisClickEnvelope(event.point));
        if (isCurrentAndUnblocked(queryGeneration)) {
          appendArcgisFeaturesToJsonThemePopup(popupContent, arcgisFeatures);
        }
        return;
      }
    }

    features = [...features, ...await queryArcgisOverlays(arcgisClickEnvelope(event.point))];
    if (!isCurrentAndUnblocked(queryGeneration) || !features.length) return;
    const groups = {};
    (await withLinked(features)).forEach(feature =>
      (groups[feature.sourceLayer || feature.layer.id] ||= []).push(feature)
    );
    const wrap = document.createElement('div');
    wrap.className = 'idwrap';
    const title = document.createElement('div');
    title.className = 'idtitle';
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '2');
    title.textContent = 'Results';
    const layers = document.createElement('div');
    layers.className = 'idlayers';
    wrap.append(title, layers);
    const toggleSection = section => {
      const expand = section.classList.contains('collapsed');
      if (expand) layers.querySelectorAll('.idsec:not(.collapsed)').forEach(active => {
        active.classList.add('collapsed');
        active.querySelector('.idhead').setAttribute('aria-expanded', 'false');
      });
      section.classList.toggle('collapsed', !expand);
      section.querySelector('.idhead').setAttribute('aria-expanded', String(expand));
    };
    const linkedSections = {}, parentSyncs = [];
    Object.entries(groups).forEach(([name, list], groupIndex) => {
      let items = list;
      let index = 0;
      const isLinked = !!list[0].linked;
      const section = document.createElement('section');
      section.className = 'idsec' + (groupIndex ? ' collapsed' : '') + (isLinked ? ' linked' : '');
      section.innerHTML =
        `<button type="button" class="idhead" aria-expanded="${!groupIndex}" aria-controls="result-section-${groupIndex}"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>` +
        `<span class="idname">${escapeHtml(name.replace(/_/g, ' '))}</span><span class="idcount"></span></button>` +
        `<div class="idbody" id="result-section-${groupIndex}"><div class="idtab"></div><div class="pophead"><button class="nav" data-d="-1" aria-label="Previous record">&#8592;</button>` +
        `<span class="pg"></span><button class="nav" data-d="1" aria-label="Next record">&#8594;</button></div></div>`;
      const head = section.querySelector('.idhead');
      head.onclick = () => toggleSection(section);
      const render = () => {
        const count = items.length;
        section.hidden = !count;
        section.querySelector('.idcount').textContent = `(${count})`;
        section.querySelector('.pophead').hidden = count < 2;
        if (!count) return;
        section.querySelector('.pg').textContent = `${index + 1} of ${count}`;
        const entries = Object.entries(items[index].properties || {}).filter(([, value]) =>
          value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '')
        );
        section.querySelector('.idtab').innerHTML = entries.length
          ? entries.map(([key, value]) =>
            `<div class="arow"><div class="akey">${escapeHtml(key)}</div><div class="aval">${renderCell(value)}</div></div>`
          ).join('')
          : '<div class="idempty">No attributes with values.</div>';
        if (!isLinked) (linkedSections[name] || []).forEach(sync => sync(items[index]));
      };
      if (isLinked) {
        (linkedSections[list[0].parentLayer] ||= []).push(parent => {
          items = list.filter(feature => feature.parent === parent);
          index = 0;
          render();
        });
      } else {
        parentSyncs.push(render);
      }
      section.querySelectorAll('.nav').forEach(button => {
        button.onclick = () => {
          index = (index + Number(button.dataset.d) + items.length) % items.length;
          render();
        };
      });
      render();
      layers.appendChild(section);
    });
    parentSyncs.forEach(render => render());
    new maplibregl.Popup({ maxWidth: '360px', className: 'idpop' })
      .setLngLat(event.lngLat).setDOMContent(wrap).addTo(map);
  }

  return { handleClick };
}
