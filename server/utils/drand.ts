// drand "quicknet" beacon (DRAND_BASE: shared/utils/dice.ts): a new public, verifiable random value every 3 s.

export interface DrandBeacon {
  round: number
  randomness: string
  signature: string
}

export function fetchDrand(round: number | 'latest') {
  return $fetch<DrandBeacon>(`${DRAND_BASE}/public/${round}`, { timeout: 4000 })
}
