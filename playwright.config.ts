import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    channel: 'chrome',
    timezoneId: 'Asia/Kolkata',
    locale: 'en-GB',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 860 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' }, testMatch: /mobile/ },
  ],
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: true,
  },
})
