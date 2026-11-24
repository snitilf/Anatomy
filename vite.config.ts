import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'
import { anatomyCli } from './scripts/lib/cliBundle.ts'
import { contentSecurityPolicy } from './scripts/lib/csp.ts'

// Anatomy is a local tool. The dev and preview servers listen on loopback only.
export default defineConfig({
  // Every file the built page asks for is relative to the page, so one build runs from the root of a server, from a folder, and from a
  // subpath such as the hosted copy at /Anatomy/. The release zip, the hosted copy, and `e2e/pages.spec.ts` all use this build.
  // The dev server ignores this value and serves from the root.
  base: './',
  // anatomyCli bundles the `anatomy` tool that the app writes into a project as `.anatomy/anatomy.mjs`.
  plugins: [react(), anatomyCli(), contentSecurityPolicy()],
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
  // The first script holds React, Base UI, Zod, the layout and routing code, and React Flow's core, which the sidebar and the
  // Overview also use. The map view, the example boards, the how-to dialog, the text of the files written into `.anatomy/`,
  // the lessons, and the command line tool load on their own scripts. `scripts/firstLoad.test.ts` holds the same line in bytes.
  build: { chunkSizeWarningLimit: 960 },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Tests that solve a sixty part board or drive the whole app are CPU bound. A busy machine must not fail them on the default 5 seconds.
    testTimeout: 30_000,
    setupFiles: ['./src/test/setup.ts'],
  },
})
