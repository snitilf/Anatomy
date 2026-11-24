import { defineConfig } from '@playwright/test'

const PORT = 4175

// The journey in WebKit and Firefox, by hand before a release. CI runs Chrome only.
// The build uses the "e2e" mode, as in playwright.config.ts. Both browsers come from `npx playwright install webkit firefox`.
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'journey.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  projects: [
    { name: 'webkit', use: { browserName: 'webkit' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  webServer: {
    command: `npm run build -- --mode e2e && npx vite preview --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
})
