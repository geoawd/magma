export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function safeExternalUrl(value, baseUrl = globalThis.location?.href) {
  if (typeof value !== 'string' || !baseUrl) return null;
  try {
    const base = new URL(baseUrl);
    const url = new URL(value, base);
    if (url.username || url.password) return null;
    return url.protocol === 'https:' || url.origin === base.origin ? url.href : null;
  } catch {
    return null;
  }
}

export function parseServiceUrl(value, hostname = globalThis.location?.hostname || '') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a complete service URL.');
  }
  const isLocalHost = host => ['localhost', '127.0.0.1'].includes(host.toLowerCase());
  const localDevelopment = isLocalHost(hostname) && isLocalHost(url.hostname);
  const allowedProtocol = url.protocol === 'https:' || (localDevelopment && url.protocol === 'http:');
  if (!allowedProtocol || url.username || url.password) {
    throw new Error('Service URLs must use HTTPS, except for localhost development, and must not contain embedded credentials.');
  }
  return url;
}
