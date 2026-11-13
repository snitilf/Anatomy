/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Anatomy is a local tool. The dev and preview servers listen on loopback only.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
  // The app loads from the local machine, so one main chunk of React, React Flow, and Zod is fine.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
