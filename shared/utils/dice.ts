// Dice: verifiable sources (drand / random.org) or local randomness, with a proof for the roll log.
// Shared by the browser (solo games) and the multiplayer server.

export type RandomSource = 'local' | 'drand' | 'random-org'

export type RollProof
  = | { type: 'local' }
    | { type: 'drand', round: number, requestedAtRound: number, randomness: string, signature: string, url: string, derivation: string }
    | { type: 'random-org', serialNumber: number, random: unknown, signature: string }

export interface RollLogEntry {
  index: number
  turn: number
  playerId: string
  playerName: string
  values: [number, number]
  /** Städte & Ritter: the event die (1–3 barbarian ship, 4 trade, 5 politics, 6 science). */
  event?: number
  /** Production dice chosen with a progress card (Wahrscheinlichkeitsdroide), not rolled. */
  forced?: boolean
  source: RandomSource
  /** true when the chosen source failed and local randomness was used instead */
  fallback: boolean
  at: string
  proof: RollProof
}

export interface RollResult {
  values: [number, number]
  event?: number
  source: RandomSource
  fallback: boolean
  proof: RollProof
}

// drand "quicknet" beacon of the League of Entropy: a new public, verifiable random value every 3 s.
export const DRAND_CHAIN = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'
export const DRAND_BASE = `https://api.drand.sh/${DRAND_CHAIN}`

export function localDie() {
  const buf = new Uint8Array(1)
  // rejection sampling: 252 = 6 * 42 keeps all faces equally likely
  do crypto.getRandomValues(buf)
  while (buf[0]! >= 252)
  return 1 + (buf[0]! % 6)
}

/** Dice from a hex seed: sha256(`${randomness}:${gameId}:${rollIndex}`), unbiased byte sampling (first bytes < 252). */
export async function diceFromSeed(seed: string, count = 2): Promise<number[]> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)))
  const out: number[] = []
  for (const b of bytes) {
    if (b < 252) out.push(1 + (b % 6))
    if (out.length === count) break
  }
  while (out.length < count) out.push(1)
  return out
}

/** `count` = 3 adds the event die (Städte & Ritter), from the same source. */
export const splitDice = (all: number[], count: number): Pick<RollResult, 'values' | 'event'> =>
  ({ values: [all[0]!, all[1]!], ...(count > 2 ? { event: all[2]! } : {}) })

export function localRoll(count = 2, source: RandomSource = 'local', fallback = false): RollResult {
  return { ...splitDice(Array.from({ length: count }, localDie), count), source, fallback, proof: { type: 'local' } }
}
