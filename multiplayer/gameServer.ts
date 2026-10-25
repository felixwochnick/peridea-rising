// The Colyseus server with its rooms, shared by the standalone server (server.ts) and the combined one (serve.ts).
import { Server, type Transport } from '@colyseus/core'
import { MULTIPLAYER_ROOM } from '../shared/utils/lobby'
import { GalacticRoom } from './GalacticRoom'

export function createGameServer(transport: Transport) {
  const server = new Server({ transport, greet: false })
  server.define(MULTIPLAYER_ROOM, GalacticRoom)
  return server
}
