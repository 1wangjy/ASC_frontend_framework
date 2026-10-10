import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Local UI integration helper; keep the same Vite proxies without opening a browser.
const root = fileURLToPath(new URL('../../', import.meta.url))
process.chdir(root)
const server = await createServer({ root, server: { host: '127.0.0.1', open: false } })
await server.listen()
server.printUrls()
