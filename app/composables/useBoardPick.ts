// Picking something on the board for a card effect (systems, corners or routes).
// The game page shows markers for `current.targets`; `pick()` resolves with the chosen ids
// once `count` targets are picked, or null when cancelled.
export interface BoardPick {
  prompt: string
  kind: 'tile' | 'corner' | 'edge'
  targets: (string | number)[]
  count: number
  picked: (string | number)[]
  resolve: (value: (string | number)[] | null) => void
}

// client-side UI state only (holds a callback, so not in useState / not saved)
const current = shallowRef<BoardPick | null>(null)

export function useBoardPick() {
  function pick(opts: { prompt: string, kind: BoardPick['kind'], targets: (string | number)[], count?: number }) {
    current.value?.resolve(null)
    return new Promise<(string | number)[] | null>((resolve) => {
      current.value = { ...opts, count: opts.count ?? 1, picked: [], resolve }
    })
  }

  function choose(target: string | number) {
    const p = current.value
    if (!p || !p.targets.includes(target) || p.picked.includes(target)) return
    const picked = [...p.picked, target]
    if (picked.length >= p.count) {
      current.value = null
      p.resolve(picked)
    }
    else current.value = { ...p, picked, targets: p.targets.filter(t => t !== target) }
  }

  /** Finish early with what was picked so far (e.g. 1 of up to 2 fleets). */
  function finish() {
    const p = current.value
    if (!p) return
    current.value = null
    p.resolve(p.picked.length ? p.picked : null)
  }

  function cancel() {
    const p = current.value
    current.value = null
    p?.resolve(null)
  }

  return { current, pick, choose, finish, cancel }
}
