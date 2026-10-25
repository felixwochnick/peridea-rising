// Single local save slot (browser localStorage) for the Galactic Colonization game state.
const SAVE_KEY = 'gc-save'
/** Transient state of the running game: not saved. */
const TRANSIENT = ['gc-dice-roll', 'gc-trade', 'gc-yield']
/** useState keys that make up a game. */
const STATE_KEYS = GAME_STATE_KEYS.filter(k => !TRANSIENT.includes(k))

interface SaveFile {
  version: 1
  savedAt: string
  state: Record<string, unknown>
}

/** Saves from before multiplayer: open decisions belonged to the one human player. */
function migrate(state: Record<string, unknown>) {
  const human = (state['gc-players'] as GamePlayer[] | undefined)?.find(p => p.kind === 'human')?.id ?? 'p1'
  for (const key of ['gc-gold-picks', 'gc-progress-discard']) {
    if (typeof state[key] === 'number') state[key] = state[key] ? { [human]: state[key] } : {}
  }
  const pirates = state['gc-pirates'] as (PirateState & { discard?: number }) | null | undefined
  if (pirates && !pirates.discards) {
    const { discard, ...rest } = pirates
    state['gc-pirates'] = { ...rest, discards: discard ? { [human]: discard } : {} }
  }
}

export function useGameSave() {
  const savedAt = useState<string | null>('gc-save-at', () => null)

  function readSave(): SaveFile | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      return raw ? JSON.parse(raw) as SaveFile : null
    }
    catch { return null }
  }

  function refresh() {
    savedAt.value = readSave()?.savedAt ?? null
  }

  function save() {
    const state = Object.fromEntries(STATE_KEYS.map(k => [k, useState(k).value]))
    const file: SaveFile = { version: 1, savedAt: new Date().toISOString(), state }
    localStorage.setItem(SAVE_KEY, JSON.stringify(file))
    savedAt.value = file.savedAt
  }

  function load(): boolean {
    const file = readSave()
    if (!file) return false
    migrate(file.state)
    for (const k of STATE_KEYS) {
      if (k in file.state) useState(k).value = file.state[k]
    }
    // saves from before trade stations existed, or with stations from before the corner fix
    if (!('gc-harbors' in file.state)) {
      useState('gc-harbors').value = generateHarbors(useState<BoardTile[]>('gc-tiles').value, templateById(useState<string>('gc-map').value).harbors)
    }
    useGalacticGame().repairHarbors()
    // transient state from the running game
    for (const k of TRANSIENT) useState(k).value = null
    useState('gc-build').value = null
    useState('gc-yield-flights').value = []
    return true
  }

  /** Forget the running game (next visit starts fresh). */
  function resetGame() {
    disposeGalacticGame()
    clearNuxtState([...STATE_KEYS, ...TRANSIENT, 'gc-build', 'gc-yield-flights', 'gc-notices'])
  }

  return { savedAt, refresh, save, load, resetGame }
}
