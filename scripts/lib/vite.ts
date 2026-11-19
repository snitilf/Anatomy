// Loads app modules the way Vite does, so a script can import files that use `?raw` imports.
import { createServer } from 'vite'

const root = new URL('../../', import.meta.url).pathname

/** Loads the given modules (paths from the repository root), runs the callback, and closes the loader. */
export async function withAppModules<T>(
  paths: readonly string[],
  run: (modules: Record<string, unknown>[]) => T | Promise<T>,
): Promise<T> {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true },
  })
  try {
    const modules = await Promise.all(paths.map((path) => server.ssrLoadModule(path)))
    return await run(modules)
  } finally {
    await server.close()
  }
}
