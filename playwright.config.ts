import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// On most dev machines Playwright finds Chromium automatically. The override
// is only used when PW_CHROMIUM_PATH is set (e.g. a CI sandbox with a
// pre-installed browser at a known location).
const CHROMIUM_OVERRIDE = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: BASE_URL,
    trace:   'retain-on-failure',
    screenshot: 'only-on-failure',
    video:   'retain-on-failure',
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(CHROMIUM_OVERRIDE ? { launchOptions: { executablePath: CHROMIUM_OVERRIDE } } : {}),
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        ...(CHROMIUM_OVERRIDE ? { launchOptions: { executablePath: CHROMIUM_OVERRIDE } } : {}),
      },
    },
  ],

  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      // Prefer an explicit MONGODB_URI if the operator provides one (Atlas or
      // a local docker mongo). Otherwise mongodb-memory-server spins up a
      // fresh single-test database — needs internet access on first run to
      // fetch the mongod binary.
      ...(process.env.MONGODB_URI
        ? { MONGODB_URI: process.env.MONGODB_URI }
        : { USE_IN_MEMORY_MONGO: 'true' }),
      JWT_SECRET: 'e2e-secret-very-long-and-not-for-production-use-only',
      NODE_ENV:   'development',
    },
  },
});
