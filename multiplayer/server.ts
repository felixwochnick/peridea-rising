// Standalone multiplayer server (Colyseus). Start: `pnpm dev:mp` (watch mode) or `pnpm start:mp`.
// In production the app and the multiplayer server usually run together on one port (serve.ts).
// Env: PORT (default 2567), NUXT_MULTIPLAYER_SECRET (shared with the Nuxt app, signs the player tokens),
// MULTIPLAYER_DICE=local (no drand, e.g. offline).
import { WebSocketTransport } from '@colyseus/ws-transport'
import { createGameServer } from './gameServer'

const port = Number(process.env.PORT ?? 2567)
await createGameServer(new WebSocketTransport()).listen(port)
console.log(`[multiplayer] listening on ws://localhost:${port}`)
