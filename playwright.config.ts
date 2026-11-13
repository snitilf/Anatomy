import { defineConfig } from '@playwright/test'

const PORT = 4174

// One Chromium-family project, run against the production build served on loopback.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  reporter: 'list',
  projects: [{ name: 'chrome', use: { channel: 'chrome' } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
})
