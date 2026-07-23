import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT || 4173);

export default defineConfig({
  testDir: './tests',
  testMatch: 'keyboard.spec.mjs',
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'node tests/static-server.mjs',
    url: `http://127.0.0.1:${port}/login.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
    env: { PORT: String(port) },
  },
});
