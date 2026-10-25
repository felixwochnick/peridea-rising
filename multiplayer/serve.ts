// Production entry: the Nuxt app and the multiplayer server on one HTTP server and port, so both work
// behind the same http(s) address. Requests and WebSocket upgrades under MULTIPLAYER_PATH go to Colyseus
// (prefix stripped), everything else to Nitro (built with the node-listener preset, see nuxt.config).
// Start: `node dist/server.mjs` from the directory that contains `.output`.
// Env: PORT (default 3000), HOST, plus everything the app and the multiplayer server need.
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { MULTIPLAYER_PATH } from '../shared/utils/lobby'
import { createGameServer } from './gameServer'

type NodeListener = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST || undefined
const nitroEntry = resolve(process.env.NITRO_ENTRY ?? '.output/server/index.mjs')

// Colyseus gets its own, never listening HTTP server: its routes (/, /matchmake/…) must not shadow the app's
const colyseusHttp = createServer()
const gameServer = createGameServer(new WebSocketTransport({ server: colyseusHttp }))
await gameServer.serverless()

const { listener } = await import(pathToFileURL(nitroEntry).href) as { listener: NodeListener }

/** `/colyseus/matchmake/…` → `/matchmake/…`, null outside the prefix. */
function stripPrefix(url = '/') {
  if (url === MULTIPLAYER_PATH || url.startsWith(`${MULTIPLAYER_PATH}?`)) return `/${url.slice(MULTIPLAYER_PATH.length)}`
  return url.startsWith(`${MULTIPLAYER_PATH}/`) ? url.slice(MULTIPLAYER_PATH.length) : null
}

const server = createServer((req, res) => {
  const url = stripPrefix(req.url)
  if (url === null) return listener(req, res)
  req.url = url
  colyseusHttp.emit('request', req, res)
})

server.on('upgrade', (req, socket, head) => {
  const url = stripPrefix(req.url)
  if (url === null) return socket.destroy()
  req.url = url
  colyseusHttp.emit('upgrade', req, socket, head)
})

server.listen(port, host, () => {
  // starts the transport's heartbeat (it waits for its server to listen)
  colyseusHttp.emit('listening')
  console.log(`[server] app and multiplayer (${MULTIPLAYER_PATH}) listening on http://${host ?? 'localhost'}:${port}`)
})
