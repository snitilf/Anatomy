// Serves the built app in the `dist` folder next to this file, on this computer only.
// Start it with `node serve.mjs`, or `node serve.mjs 4200` for another port.
// It has no packages to install and makes no request of its own.
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const DEFAULT_PORT = 4173
const folder = join(dirname(fileURLToPath(import.meta.url)), 'dist')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

/** The file inside `dist` for a request path, or `undefined` when the path is not valid or leaves the folder. */
function fileFor(rawUrl) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://host').pathname)
  } catch {
    return undefined
  }
  const rest = pathname.slice(1)
  if (rest.startsWith('/') || rest.includes('\0') || rest.includes('\\')) return undefined
  if (rest.split('/').some((part) => part === '..')) return undefined
  return rest === '' || rest.endsWith('/') ? `${rest}index.html` : rest
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed')
    return
  }
  const file = fileFor(req.url ?? '/')
  if (!file) {
    res.writeHead(404).end('Not found')
    return
  }
  readFile(join(folder, file)).then(
    (body) => {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff' })
      res.end(req.method === 'HEAD' ? undefined : body)
    },
    () => res.writeHead(404).end('Not found'),
  )
})

const requested = process.argv[2]
const port = requested === undefined ? DEFAULT_PORT : Number(requested)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`"${requested}" is not a port. Use a number from 0 to 65535, for example: node serve.mjs 4200`)
  process.exit(1)
}

server.once('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Try another one, for example: node serve.mjs ${port + 1}` : error.message)
  process.exit(1)
})
server.listen(port, HOST, () => {
  const { port: bound } = server.address()
  console.log(`Anatomy is running at http://${HOST}:${bound}`)
  console.log('Press Ctrl+C to stop.')
})
