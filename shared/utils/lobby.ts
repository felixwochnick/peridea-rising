// Lobby of a game: player slots and options. Used by the lobby page (solo and multiplayer)
// and by the multiplayer room on the server.
import type { GamePlayer, NewGameConfig, Side } from './game'
import { MAP_TEMPLATES } from './maps'

/** `human` = the host (seat 1), `open` = a seat for another player (multiplayer). */
export type SlotType = 'human' | 'bot-easy' | 'bot-normal' | 'bot-hard' | 'ai-gemini' | 'ai-claude' | 'ai-gpt' | 'open'

export interface LobbySlot {
  type: SlotType
  side: Side
  color: string
}

export interface LobbyConfig {
  slots: LobbySlot[]
  mapId: string
  victoryPoints: number
  randomStart: boolean
  friendlyPirates: boolean
  citiesKnights: boolean
}

/** A slot as the room sees it: who sits there. */
export interface LobbySeat extends LobbySlot {
  userId: string | null
  name: string | null
  connected: boolean
}

/** What every client gets about the lobby. */
export interface LobbyView {
  code: string
  phase: 'lobby' | 'game'
  hostUserId: string | null
  seats: LobbySeat[]
  config: Omit<LobbyConfig, 'slots'>
  /** Seat index of the receiving client. */
  you: number
}

export const MULTIPLAYER_ROOM = 'galactic'
/** Where the multiplayer server is mounted when it runs together with the app (multiplayer/serve.ts). */
export const MULTIPLAYER_PATH = '/colyseus'
/** Lobby codes: 6 characters without the easily confused 0/O/1/I. */
export const LOBBY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const LOBBY_CODE = /^[A-HJ-NP-Z2-9]{6}$/
export const generateLobbyCode = () => Array.from({ length: 6 }, () => LOBBY_CODE_CHARS[Math.floor(Math.random() * LOBBY_CODE_CHARS.length)]).join('')

export const SLOT_NAMES: Record<SlotType, string> = {
  'human': 'Du',
  'bot-easy': 'Bot (leicht)',
  'bot-normal': 'Bot (normal)',
  'bot-hard': 'Bot (schwer)',
  'ai-gemini': 'Gemini',
  'ai-claude': 'Claude',
  'ai-gpt': 'GPT',
  'open': 'Offen',
}

const SLOT_TYPES = Object.keys(SLOT_NAMES) as SlotType[]
const SIDES: Side[] = ['rebel', 'empire']

/** Player id of a seat. */
export const seatPlayerId = (seat: number) => `p${seat + 1}`

/** Players of a new game; `names` overrides the name per seat (multiplayer: the account names). */
export function playersFromSlots(slots: LobbySlot[], names: (string | null)[] = []): GamePlayer[] {
  return slots.map((slot, i) => ({
    id: seatPlayerId(i),
    name: names[i] ?? SLOT_NAMES[slot.type],
    side: slot.side,
    color: slot.color,
    kind: slot.type === 'human' || slot.type === 'open' ? 'human' : slot.type.startsWith('ai-') ? 'ai' : 'bot',
    difficulty: slot.type === 'bot-hard' ? 'hard' : slot.type === 'bot-normal' ? 'normal' : 'easy',
    fleetStrength: 0,
  }))
}

export function newGameConfig(config: LobbyConfig, names: (string | null)[] = []): NewGameConfig {
  return {
    mapId: config.mapId,
    victoryPoints: config.victoryPoints,
    randomStart: config.randomStart,
    friendlyPirates: config.friendlyPirates,
    citiesKnights: config.citiesKnights,
    players: playersFromSlots(config.slots, names),
  }
}

/** Validates a lobby config from a client (null = invalid). */
export function sanitizeLobbyConfig(input: unknown): LobbyConfig | null {
  const c = input as Partial<LobbyConfig> | null
  if (!c || !Array.isArray(c.slots) || c.slots.length < 2 || c.slots.length > 6) return null
  const slots = c.slots.map(s => ({
    type: SLOT_TYPES.includes(s?.type) ? s.type : 'bot-normal',
    side: SIDES.includes(s?.side) ? s.side : 'rebel',
    color: typeof s?.color === 'string' && /^[a-z]{2,12}$/.test(s.color) ? s.color : 'yellow',
  }))
  // seat 1 is always the host
  slots[0]!.type = 'human'
  for (const s of slots.slice(1)) if (s.type === 'human') s.type = 'open'
  const template = MAP_TEMPLATES.find(t => t.id === c.mapId)
  if (!template) return null
  const vp = Number(c.victoryPoints)
  return {
    slots,
    mapId: template.id,
    victoryPoints: Number.isInteger(vp) && vp >= 5 && vp <= 20 ? vp : template.victoryPoints,
    randomStart: !!c.randomStart,
    friendlyPirates: !!c.friendlyPirates,
    citiesKnights: !!c.citiesKnights,
  }
}
