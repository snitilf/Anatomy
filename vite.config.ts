/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { anatomyCli } from './scripts/lib/cliBundle.ts'

// Anatomy is a local tool. The dev and preview servers listen on loopback only.
export default defineConfig({
  // anatomyCli bundles the `anatomy` tool that the app writes into a project as `.anatomy/anatomy.mjs`.
  plugins: [react(), anatomyCli()],
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
  // The app loads from the local machine, so one main chunk of React, React Flow, and Zod is fine.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Tests that solve a sixty part board or drive the whole app are CPU bound. A busy machine must not fail them on the default 5 seconds.
    testTimeout: 30_000,
    setupFiles: ['./src/test/setup.ts'],
  },
})
