// Dice from the configured random source, with a proof for the roll log (types and seed derivation: shared/utils/dice.ts).

export function useDiceSource() {
  const { settings } = useUserSettings()
  const { offline } = useConnectivity()
  const gameId = useState('gc-game-id', () => crypto.randomUUID())

  async function roll(rollIndex: number, count = 2): Promise<RollResult> {
    const source = settings.value.randomSource
    // offline the external sources can't be reached: local randomness, marked as fallback in the roll log
    if (offline.value) return localRoll(count, source, source !== 'local')
    try {
      if (source === 'drand') {
        const b = await $fetch<{ round: number, requestedAtRound: number, randomness: string, signature: string, url: string }>('/api/random/drand')
        const derivation = `sha256("${b.randomness}:${gameId.value}:${rollIndex}")`
        const all = await diceFromSeed(`${b.randomness}:${gameId.value}:${rollIndex}`, count)
        return { ...splitDice(all, count), source, fallback: false, proof: { type: 'drand', ...b, derivation } }
      }
      if (source === 'random-org') {
        const r = await $fetch<{ data: number[], random: unknown, signature: string, serialNumber: number }>('/api/random/random-org', {
          method: 'POST',
          body: { apiKey: settings.value.randomOrgApiKey, n: count },
        })
        return { ...splitDice(r.data, count), source, fallback: false, proof: { type: 'random-org', serialNumber: r.serialNumber, random: r.random, signature: r.signature } }
      }
    }
    catch (e) {
      console.warn(`[dice] ${source} failed, using local randomness`, e)
      return localRoll(count, source, true)
    }
    return localRoll(count)
  }

  return { roll, gameId }
}
