// Action cards (Catan development cards): 25 cards per game.
// knight → Flottenverband (moves the pirates, counts for "Größte Flotte"),
// road building → Hyperraumvermessung, year of plenty → Schmugglerfund,
// monopoly → Handelsembargo, victory point → Siegpunktkarten (hidden until the game is won).

export type DevCardKind = 'fleet' | 'survey' | 'smuggler' | 'embargo' | 'victory'

export interface DevCardInfo {
  name: string
  /** Catan equivalent */
  catan: string
  description: string
  icon: string
  count: number
}

export const DEV_CARDS: Record<DevCardKind, DevCardInfo> = {
  fleet: {
    name: 'Flottenverband',
    catan: 'Ritter',
    description: 'Versetze die Piraten und stiehl eine Karte. Zählt für die Größte Flotte (ab 3: +2 SP).',
    icon: 'i-lucide-swords',
    count: 14,
  },
  survey: {
    name: 'Hyperraumvermessung',
    catan: 'Straßenbau',
    description: 'Baue sofort 2 Hyperraumrouten kostenlos.',
    icon: 'i-lucide-route',
    count: 2,
  },
  smuggler: {
    name: 'Schmugglerfund',
    catan: 'Erfindung',
    description: 'Nimm dir 2 beliebige Rohstoffe aus dem Vorrat.',
    icon: 'i-lucide-package-open',
    count: 2,
  },
  embargo: {
    name: 'Handelsembargo',
    catan: 'Monopol',
    description: 'Wähle einen Rohstoff: alle Mitspieler müssen dir ihre Karten dieser Sorte geben.',
    icon: 'i-lucide-ban',
    count: 2,
  },
  victory: {
    name: 'Siegpunkt',
    catan: 'Siegpunkt',
    description: '1 Siegpunkt. Bleibt verdeckt, bis jemand gewinnt.',
    icon: 'i-lucide-crown',
    count: 5,
  },
}

/** Names of the five victory point cards. */
export const VICTORY_CARD_NAMES = ['Senatssitz', 'Holonet-Sender', 'Kyber-Archiv', 'Werft von Kuat', 'Ehrenmedaille von Yavin']

export const DEV_CARD_ORDER: DevCardKind[] = ['fleet', 'survey', 'smuggler', 'embargo', 'victory']

export interface DevCard {
  id: number
  kind: DevCardKind
  /** Bought this turn: can't be played yet (Catan rule). */
  fresh: boolean
  /** Name of a victory point card. */
  title?: string
}

/** A freshly shuffled deck. */
export function newDevDeck(): DevCard[] {
  let id = 0
  let vp = 0
  const deck: DevCard[] = DEV_CARD_ORDER.flatMap(kind => Array.from({ length: DEV_CARDS[kind].count }, () => ({
    id: id++,
    kind,
    fresh: false,
    ...(kind === 'victory' ? { title: VICTORY_CARD_NAMES[vp++ % VICTORY_CARD_NAMES.length] } : {}),
  })))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}
