const scriptPromises = new Map();
const stylesheetPromises = new Map();

export function loadOptionalScript(src, integrity) {
  if (scriptPromises.has(src)) return scriptPromises.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = 'anonymous';
    }
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptPromises.delete(src);
      reject(new Error(`Could not load optional script ${src}.`));
    };
    document.head.appendChild(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}

export function loadOptionalStylesheet(href, integrity) {
  if (stylesheetPromises.has(href)) return stylesheetPromises.get(href);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (integrity) {
      link.integrity = integrity;
      link.crossOrigin = 'anonymous';
    }
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      stylesheetPromises.delete(href);
      reject(new Error(`Could not load optional stylesheet ${href}.`));
    };
    document.head.appendChild(link);
  });
  stylesheetPromises.set(href, promise);
  return promise;
}
