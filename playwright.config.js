import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:8123',
    // Returning-visitor state: the rail remembers the legend as open. Tests that cover a first visit override this.
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://127.0.0.1:8123', localStorage: [{ name: 'mapviewer.rail.v1', value: 'legend' }] }]
    },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'python3 serve.py --no-browser --port 8123',
    url: 'http://127.0.0.1:8123',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
