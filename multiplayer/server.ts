// Multiplayer server (Colyseus). Start: `pnpm dev:mp` (watch mode) or `pnpm start:mp`.
// Env: PORT (default 2567), NUXT_MULTIPLAYER_SECRET (shared with the Nuxt app, signs the player tokens),
// MULTIPLAYER_DICE=local (no drand, e.g. offline).
import { Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { MULTIPLAYER_ROOM } from '../shared/utils/lobby'
import { GalacticRoom } from './GalacticRoom'

const port = Number(process.env.PORT ?? 2567)
const server = new Server({ transport: new WebSocketTransport(), greet: false })
server.define(MULTIPLAYER_ROOM, GalacticRoom)
await server.listen(port)
console.log(`[multiplayer] listening on ws://localhost:${port}`)
