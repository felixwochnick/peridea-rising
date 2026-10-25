// Dice on the server: drand (public, verifiable – same derivation as in solo games), local randomness as fallback.
import { DRAND_BASE, diceFromSeed, localRoll, splitDice, type RollResult } from '../shared/utils/dice'

interface Beacon { round: number, randomness: string, signature: string }

async function fetchBeacon(round: number | 'latest'): Promise<Beacon> {
  const res = await fetch(`${DRAND_BASE}/public/${round}`, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) throw new Error(`drand ${res.status}`)
  return await res.json() as Beacon
}

/** Commits to the round after the current one, so the result didn't exist when the roll was requested. */
export async function rollDrand(gameId: string, index: number, count: number): Promise<RollResult> {
  try {
    const latest = await fetchBeacon('latest')
    const target = latest.round + 1
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      try {
        const b = await fetchBeacon(target)
        const seed = `${b.randomness}:${gameId}:${index}`
        const all = await diceFromSeed(seed, count)
        return {
          ...splitDice(all, count),
          source: 'drand',
          fallback: false,
          proof: { type: 'drand', ...b, requestedAtRound: latest.round, url: `${DRAND_BASE}/public/${target}`, derivation: `sha256("${seed}")` },
        }
      }
      catch {
        await new Promise(r => setTimeout(r, 600))
      }
    }
    throw new Error('drand round not published in time')
  }
  catch (e) {
    console.warn('[dice] drand failed, using local randomness:', (e as Error).message)
    return localRoll(count, 'drand', true)
  }
}
