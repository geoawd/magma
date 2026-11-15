export function createBoxSelectionController({
  map,
  document,
  boxButton,
  boxTip,
  isBoxMode,
  setBoxMode,
  setJustBoxed,
  isNotificationPicking,
  cancelNotificationPick,
  selectNotificationLocation,
  getActiveTool,
  isMobile,
  openTool,
  arcgisQueryController,
  queryData,
  arcgisBoxPolygon,
  queryArcgisOverlays,
  showTable,
  toast
}) {
  let start = null;
  let selectionGeneration = 0;
  let selected = [];
  let keyboardStart = null;
  const boxElement = document.createElement('div');
  boxElement.id = 'selbox';
  const mapBox = map.getCanvasContainer();
  mapBox.appendChild(boxElement);

  function setBox(on) {
    if (on) cancelNotificationPick();
    if (on) {
      selectionGeneration++;
      arcgisQueryController.cancel();
    }
    setBoxMode(on);
    boxButton.classList.toggle('active', on);
    boxButton.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('box-on', on);
    map.getCanvas().style.cursor = on ? 'crosshair' : '';
    mapBox.style.touchAction = on ? 'none' : '';
    keyboardStart = null;
    boxTip.textContent = 'Drag a box on the map, or focus the map and press Enter to set the first corner';
    on ? (map.dragPan.disable(), map.touchZoomRotate.disable()) : (map.dragPan.enable(), map.touchZoomRotate.enable());
    if (on) map.getCanvas().focus();
  }

  async function runSelection(firstCorner, secondCorner) {
    setBox(false);
    setJustBoxed(true);
    setTimeout(() => setJustBoxed(false), 50);
    if (Math.abs(firstCorner.x - secondCorner.x) < 3 &&
        Math.abs(firstCorner.y - secondCorner.y) < 3) return;
    const generation = ++selectionGeneration;
    const bounds = [
      [Math.min(firstCorner.x, secondCorner.x), Math.min(firstCorner.y, secondCorner.y)],
      [Math.max(firstCorner.x, secondCorner.x), Math.max(firstCorner.y, secondCorner.y)]
    ];
    const vectorFeatures = queryData(bounds);
    let arcgisFeatures = [];
    try {
      arcgisFeatures = await queryArcgisOverlays(
        arcgisBoxPolygon(firstCorner, secondCorner), 'esriGeometryPolygon', true
      );
    } catch (error) {
      toast(`Could not query ArcGIS layers: ${error.message}`);
    }
    if (generation !== selectionGeneration) return;
    selected = [...vectorFeatures, ...arcgisFeatures];
    showTable(selected, `${selected.length} record(s) selected`);
  }

  boxButton.onclick = () => {
    if (!isBoxMode() && getActiveTool() && isMobile()) openTool(getActiveTool());
    setBox(!isBoxMode());
  };

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (isNotificationPicking()) cancelNotificationPick();
    if (isBoxMode()) setBox(false);
  });

  map.getCanvas().addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (isNotificationPicking()) {
      event.preventDefault();
      selectNotificationLocation(map.getCenter());
      return;
    }
    if (!isBoxMode()) return;
    event.preventDefault();
    if (!keyboardStart) {
      keyboardStart = map.getCenter();
      boxTip.textContent = 'First corner set. Pan with the arrow keys, then press Enter again to select the box.';
      return;
    }
    const first = map.project(keyboardStart);
    const second = map.project(map.getCenter());
    if (Math.hypot(first.x - second.x, first.y - second.y) < 3) {
      boxTip.textContent = 'Pan the map with the arrow keys to the opposite corner, then press Enter again.';
      return;
    }
    keyboardStart = null;
    runSelection(first, second);
  });

  const position = event => {
    const rect = mapBox.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const drawBox = current => Object.assign(boxElement.style, {
    display: 'block',
    left: Math.min(start.x, current.x) + 'px',
    top: Math.min(start.y, current.y) + 'px',
    width: Math.abs(current.x - start.x) + 'px',
    height: Math.abs(current.y - start.y) + 'px'
  });

  mapBox.addEventListener('pointerdown', event => {
    if (!isBoxMode() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    start = position(event);
    const first = start;
    const move = current => drawBox(position(current));
    const up = current => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      boxElement.style.display = 'none';
      runSelection(first, position(current));
      start = null;
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });

  return {
    setBox,
    runSelection,
    invalidatePendingSelection: () => { selectionGeneration++; },
    clear: () => { selected = []; },
    getSelected: () => selected
  };
}
