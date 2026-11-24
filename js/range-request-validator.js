export function createRangeRequestValidator({
  fetchImpl = fetch,
  baseUrl = globalThis.location?.href,
  resourceName = 'file'
} = {}) {
  const checks = new Map();
  const verified = new Set();

  function verify(inputUrl) {
    const url = new URL(inputUrl, baseUrl).href;
    if (!checks.has(url)) {
      let tracked;
      const pending = (async () => {
        const controller = new AbortController();
        try {
          const response = await fetchImpl(url, {
            headers: { Range: 'bytes=0-0' },
            signal: controller.signal
          });
          if (response.status !== 206) {
            controller.abort();
            throw new Error(`The server ignored byte-range requests (HTTP ${response.status}); refusing to download the full ${resourceName}.`);
          }
          await response.body?.cancel();
          verified.add(url);
        } catch (error) {
          controller.abort();
          throw error;
        }
      })();
      tracked = pending.catch(error => {
        if (checks.get(url) === tracked) checks.delete(url);
        throw error;
      });
      checks.set(url, tracked);
    }
    return checks.get(url);
  }

  return { verify, verified };
}
