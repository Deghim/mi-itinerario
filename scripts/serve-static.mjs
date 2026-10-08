import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../out/', import.meta.url)))
const port = Number(process.env.PORT || 3000)
const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '')
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

createServer((request, response) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname)
  } catch {
    response.writeHead(400).end('Bad request')
    return
  }
  if (basePath) {
    if (pathname === basePath) pathname = '/'
    else if (pathname.startsWith(`${basePath}/`)) pathname = pathname.slice(basePath.length)
    else {
      response.writeHead(404).end('Not found')
      return
    }
  }
  const relativePath = normalize(pathname).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '')
  let filePath = resolve(join(root, relativePath))
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html')
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404).end('Not found')
    return
  }
  response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' })
  if (request.method === 'HEAD') response.end()
  else createReadStream(filePath).pipe(response)
}).listen(port, () => {
  console.log(`Sirviendo export estático desde ${root} en http://localhost:${port}${basePath}/`)
})
