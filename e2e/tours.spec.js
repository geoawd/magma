import { expect, test } from '@playwright/test';

test('Garron Point tour config embeds the responsive YouTube video', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#themeSel option').first()).toBeAttached({ timeout: 20_000 });

  const popup = await page.evaluate(() => {
    const tour = window.TOURS.find(item => item.id === 'geology-introduction');
    const stop = tour.stops.find(item => item.title === 'Video explanation');
    return stop.popup;
  });
  expect(popup.html).toContain('https://www.youtube.com/embed/7nMXtsZty6g?si=-UqeOfDjA5qcX6i0');
  expect(popup.html).toContain('allowfullscreen');
  expect(popup.maxWidth).toBe('min(560px, calc(100vw - 32px))');

  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("frame-src 'self' blob: https://www.youtube.com");
});
