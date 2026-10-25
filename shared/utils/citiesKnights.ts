import type { CommodityId, ImprovementTrack } from './resources'

// Städte & Ritter (Catan: Cities & Knights) – rules data.
// Dorf / Stadt / Metropole = Light / Medium / Warship Dockyard, knights = fleets in three strengths.

export const CK_VICTORY_BONUS = 3 // C&K plays to 13 instead of 10 (map goal + 3)

// --- city improvements -------------------------------------------------------------
export interface TrackDef {
  id: ImprovementTrack
  name: string
  /** Paid with this commodity: level n costs n of it. */
  commodity: CommodityId
  color: string
  /** Event die gate of this color. */
  gate: string
  /** Names of the five levels. */
  levels: [string, string, string, string, string]
  /** Ability unlocked at level 3. */
  ability: string
}

export const TRACKS: Record<ImprovementTrack, TrackDef> = {
  trade: {
    id: 'trade',
    name: 'Handel',
    commodity: 'fuel',
    color: '#ffd23f',
    gate: 'Handelstor',
    levels: ['Markt', 'Handelskontor', 'Handelsgilde', 'Bank', 'Handelsbörse'],
    ability: 'Handelsgilde: Waren 2:1 mit der Bank tauschen',
  },
  politics: {
    id: 'politics',
    name: 'Politik',
    commodity: 'beskar',
    color: '#6aa8ff',
    gate: 'Senatstor',
    levels: ['Stadtwache', 'Garnison', 'Festung', 'Senat', 'Hohes Kommando'],
    ability: 'Festung: Flotten zu Großkampfschiffen (Stufe 3) ausbauen',
  },
  science: {
    id: 'science',
    name: 'Wissenschaft',
    commodity: 'bacta',
    color: '#5be08a',
    gate: 'Forschungstor',
    levels: ['Labor', 'Bibliothek', 'Bacta-Klinik', 'Akademie', 'Holonet-Archiv'],
    ability: 'Bacta-Klinik: bekommst du bei einem Wurf nichts, wählst du 1 Rohstoff',
  },
}
export const TRACK_ORDER: ImprovementTrack[] = ['trade', 'politics', 'science']
export type Improvements = Record<ImprovementTrack, number>
export const emptyImprovements = (): Improvements => ({ trade: 0, politics: 0, science: 0 })

// --- event die -------------------------------------------------------------------------
/** Event die faces 1–3 = barbarian ship, 4–6 = gates (Catan: 3 ship faces + yellow/blue/green gate). */
export type EventFace = 'ship' | ImprovementTrack
export const eventFace = (value: number): EventFace =>
  value <= 3 ? 'ship' : value === 4 ? 'trade' : value === 5 ? 'politics' : 'science'

/** Barbarians attack when the ship reaches this step. */
export const BARBARIAN_STEPS = 7

// --- knights ---------------------------------------------------------------------------
export type KnightLevel = 1 | 2 | 3
export interface Knight {
  owner: string
  level: KnightLevel
  active: boolean
  /** Built, promoted or activated this turn: can't act until the next turn. */
  fresh: boolean
}
export const KNIGHT_NAMES: Record<KnightLevel, string> = { 1: 'Jägerstaffel', 2: 'Korvette', 3: 'Großkampfschiff' }
/** Pieces per player and level (Catan: 2 basic, 2 strong, 2 mighty). */
export const KNIGHT_PIECES = 2

export const CK_COSTS = {
  /** Knight (Catan: wool + ore). */
  knight: { tibanna: 1, durasteel: 1 },
  /** Activate (Catan: grain). */
  activate: { food: 1 },
  /** Promote (Catan: wool + ore). */
  promote: { tibanna: 1, durasteel: 1 },
  /** City wall (Catan: 2 brick). */
  wall: { kyber: 2 },
} as const
export const MAX_WALLS = 3
