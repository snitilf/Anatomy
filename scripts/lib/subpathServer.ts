import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join } from 'node:path'
import { fileForUrl } from './subpath.ts'

export interface Served {
  address: AddressInfo
  close: () => Promise<void>
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

/**
 * Serves a build folder under `base` on the loopback interface, the way GitHub Pages serves a project page.
 * Everything outside `base` is a 404, so a page that assumes the site root breaks here and not only after the deploy.
 */
export async function serveUnderSubpath(folder: string, base: string): Promise<Served> {
  const server: Server = createServer((req, res) => {
    const file = fileForUrl(base, req.url ?? '/')
    if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404).end('Not found')
      return
    }
    readFile(join(folder, file)).then(
      (body) => {
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(req.method === 'HEAD' ? undefined : body)
      },
      () => res.writeHead(404).end('Not found'),
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    address: server.address() as AddressInfo,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() }),
  }
}
