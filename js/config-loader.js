(() => {
  const profileConfigs = {
    public: 'config/config.js',
    internal: 'config/config.internal.js'
  };
  const profile = new URLSearchParams(window.location.search).get('profile') || 'public';

  const showError = message => {
    console.error(message);
    const panel = document.createElement('div');
    panel.setAttribute('role', 'alert');
    Object.assign(panel.style, {
      position: 'fixed',
      zIndex: '10000',
      inset: '1rem 1rem auto',
      padding: '1rem',
      border: '1px solid #b00020',
      background: '#fff',
      color: '#b00020',
      fontFamily: 'sans-serif'
    });
    panel.textContent = message;
    document.body.prepend(panel);
  };

  if (!Object.prototype.hasOwnProperty.call(profileConfigs, profile)) {
    showError(`Unknown configuration profile "${profile}". Choose ${Object.keys(profileConfigs).join(' or ')}.`);
    return;
  }

  window.CONFIG_PROFILE = profile;
  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}.`));
    document.body.appendChild(script);
  });
  const encodeCogUrls = config => {
    const encode = value => typeof value === 'string' ? encodeURI(value) : value;
    (config.overlays || []).forEach(overlay => {
      if (overlay && typeof overlay === 'object' && typeof overlay.cog === 'string') {
        overlay.cog = encode(overlay.cog);
      }
    });
    if (typeof config.terrain?.cog === 'string') config.terrain.cog = encode(config.terrain.cog);
    (config.terrain?.models || []).forEach(model => {
      if (model && typeof model === 'object' && typeof model.cog === 'string') {
        model.cog = encode(model.cog);
      }
    });
  };
  const validateTours = tours => {
    const ids = new Set();
    tours.forEach((tour, index) => {
      if (!tour || typeof tour.id !== 'string' || !tour.id ||
          typeof tour.name !== 'string' || !tour.name || !Array.isArray(tour.stops)) {
        throw new Error(`Invalid tour at index ${index}.`);
      }
      if (ids.has(tour.id)) throw new Error(`Duplicate tour id "${tour.id}".`);
      ids.add(tour.id);
      tour.stops.forEach((stop, stopIndex) => {
        if (!stop || typeof stop.title !== 'string' || !stop.title ||
            typeof stop.description !== 'string') {
          throw new Error(`Invalid stop ${stopIndex} in tour "${tour.id}".`);
        }
        if (stop.center !== undefined &&
            (!Array.isArray(stop.center) || stop.center.length !== 2 || !stop.center.every(Number.isFinite))) {
          throw new Error(`Invalid center in stop ${stopIndex} of tour "${tour.id}".`);
        }
        ['zoom', 'bearing', 'pitch', 'duration'].forEach(key => {
          if (stop[key] !== undefined && !Number.isFinite(stop[key])) {
            throw new Error(`Invalid ${key} in stop ${stopIndex} of tour "${tour.id}".`);
          }
        });
        if (stop.terrain !== undefined && typeof stop.terrain !== 'boolean') {
          throw new Error(`Invalid terrain in stop ${stopIndex} of tour "${tour.id}".`);
        }
        if (stop.popup !== undefined && (!stop.popup || typeof stop.popup.html !== 'string')) {
          throw new Error(`Invalid popup in stop ${stopIndex} of tour "${tour.id}".`);
        }
      });
    });
  };
  loadScript(profileConfigs[profile])
    .then(async () => {
      if (!window.CONFIG) throw new Error(`${profileConfigs[profile]} did not define window.CONFIG.`);
      encodeCogUrls(window.CONFIG);
      if (!Array.isArray(window.TOURS)) throw new Error('config/tours.js did not define window.TOURS.');
      validateTours(window.TOURS);
      await loadScript('js/styles.js');
    })
    .catch(error => showError(`Could not start the ${profile} profile: ${error.message}`));
})();
