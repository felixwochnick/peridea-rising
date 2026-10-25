import { HEX_SIZE, type BoardTile } from './board'
import type { ResourceId } from './resources'

// Map templates (base game + Seafarers scenarios) and the random map generator.
// Sea / desert are empty space: hyperlanes run through them like everywhere else.
// Every game shuffles resources and numbers anew.

type Axial = [q: number, r: number]
type CellKind = 'land' | 'gold' | 'fog' | 'sea'
type TileKind = ResourceId | 'empty'

interface TileSpec {
  /** Fixed counts per tile kind; missing tiles are filled with a balanced resource mix. */
  counts?: Partial<Record<TileKind, number>>
}

export interface MapTemplate {
  id: string
  name: string
  /** Seafarers scenario this map is based on */
  scenario?: string
  description: string
  players: [min: number, max: number]
  victoryPoints: number
  cells: { axial: Axial, kind: CellKind }[]
  land: TileSpec
  /** Fog tiles: share of land among them, and how many of those are gold. */
  fog?: { landShare: number, gold: number }
  /** Seafarers: +2 VP for the first outpost on each island that isn't a home island. */
  islandBonus: boolean
  /** Trade stations (Catan harbors), default 9. */
  harbors?: number
}

// --- shapes -----------------------------------------------------------------

function hexagon(radius: number): Axial[] {
  const out: Axial[] = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) out.push([q, r])
  }
  return out
}

/** Columns of the given lengths, vertically centered (flat-top hexes). */
function columns(lengths: number[]): Axial[] {
  const out: Axial[] = []
  const mid = Math.floor((lengths.length - 1) / 2)
  lengths.forEach((len, i) => {
    const q = i - mid
    const start = Math.floor(-q / 2 - (len - 1) / 2)
    for (let k = 0; k < len; k++) out.push([q, start + k])
  })
  return out
}

/**
 * ASCII layout in odd-q offset rows: `.` sea, `L` land, `G` gold field, `?` fog.
 * Odd columns sit half a hex lower.
 */
function ascii(rows: string[]): MapTemplate['cells'] {
  const kinds: Record<string, CellKind> = { '.': 'sea', 'L': 'land', 'G': 'gold', '?': 'fog' }
  const cells: MapTemplate['cells'] = []
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    cells.push({ axial: [c, r - (c - (c & 1)) / 2], kind: kinds[ch] ?? 'sea' })
  }))
  return cells
}

const all = (kind: CellKind) => (axial: Axial) => ({ axial, kind })

// --- templates ----------------------------------------------------------------

const CLASSIC = { wood: 4, tibanna: 4, food: 4, kyber: 3, durasteel: 3 }

export const MAP_TEMPLATES: MapTemplate[] = [
  {
    id: 'cluster',
    name: 'Großer Sternenhaufen',
    description: 'Das Basisspiel: 19 Systeme in einem Haufen, ein leeres Feld.',
    players: [3, 4],
    victoryPoints: 10,
    cells: hexagon(2).map(all('land')),
    land: { counts: { ...CLASSIC, empty: 1 } },
    islandBonus: false,
  },
  {
    id: 'new-horizons',
    name: 'Neue Horizonte',
    scenario: 'Seefahrer: Neue Ufer',
    description: 'Ein großes Heimatsystem und kleine Inseln im Leerraum. Goldfelder liefern jeden Rohstoff, jede neue Insel +2 SP.',
    players: [3, 4],
    victoryPoints: 14,
    cells: ascii([
      '.LLL...GL..',
      '.LLLL...L..',
      'LLLLL..G..L',
      '.LLLL.L...L',
      '.LLL..L.GL.',
    ]),
    land: { counts: { ...CLASSIC, empty: 1 } },
    islandBonus: true,
  },
  {
    id: 'four-sectors',
    name: 'Vier Sektoren',
    scenario: 'Seefahrer: Die vier Inseln',
    description: 'Vier gleich große Inseln. Man startet auf höchstens zwei – jede weitere Insel bringt +2 SP.',
    players: [3, 4],
    victoryPoints: 13,
    cells: ascii([
      '.LLL..LLL.',
      '.LLL..LL..',
      '..........',
      '.LL...LLL.',
      '.LLL..LLL.',
    ]),
    land: {},
    islandBonus: true,
  },
  {
    id: 'fog',
    name: 'Unerforschte Nebel',
    scenario: 'Seefahrer: Die Nebelinseln',
    description: 'Um das Heimatsystem liegen Nebel. Wer daneben baut, deckt sie auf – neues Land bringt einen Rohstoff als Fund.',
    players: [3, 4],
    victoryPoints: 12,
    cells: ascii([
      '????????',
      '?LLL????',
      'LLLLL???',
      'LLLLL.??',
      '.LLL.???',
      '???????.',
    ]),
    land: { counts: { wood: 3, tibanna: 3, food: 3, kyber: 3, durasteel: 3, empty: 1 } },
    fog: { landShare: 0.5, gold: 2 },
    islandBonus: true,
  },
  {
    id: 'outer-rim',
    name: 'Äußerer Rand',
    description: 'Große Karte für 5–6 Spieler wie in der Catan-Erweiterung.',
    players: [5, 6],
    victoryPoints: 10,
    cells: columns([3, 4, 5, 6, 5, 4, 3]).map(all('land')),
    land: { counts: { wood: 6, tibanna: 6, food: 6, kyber: 5, durasteel: 5, empty: 2 } },
    islandBonus: false,
    harbors: 11,
  },
]

export const DEFAULT_MAP = 'cluster'

// --- generator ------------------------------------------------------------------

const AXIAL_DIRS: Axial[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
const RESOURCE_IDS: ResourceId[] = ['wood', 'tibanna', 'food', 'kyber', 'durasteel']
const CLASSIC_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** n resources, as evenly spread over the five types as possible. */
function balanced(n: number): ResourceId[] {
  return shuffle(Array.from({ length: n }, (_, i) => RESOURCE_IDS[i % 5]!))
}

/** n number tokens with the classic distribution (repeated for big maps). */
function numberPool(n: number): number[] {
  const out: number[] = []
  while (out.length < n) out.push(...shuffle(CLASSIC_NUMBERS))
  return shuffle(out.slice(0, n))
}

/** World position (x, z) of an axial hex with flat-top orientation. */
export function axialToWorld([q, r]: Axial, size = HEX_SIZE): [number, number] {
  return [size * 1.5 * q, size * Math.sqrt(3) * (r + q / 2)]
}

export function templateById(id: string) {
  return MAP_TEMPLATES.find(t => t.id === id) ?? MAP_TEMPLATES.find(t => t.id === DEFAULT_MAP)!
}

/** Generates a random board: shuffled resources and numbers, no adjacent 6/8. */
export function generateMap(templateId: string): BoardTile[] {
  const template = templateById(templateId)
  const index = new Map(template.cells.map((c, i) => [`${c.axial[0]},${c.axial[1]}`, i]))
  const neighbors = (i: number) => {
    const [q, r] = template.cells[i]!.axial
    return AXIAL_DIRS.map(([dq, dr]) => index.get(`${q + dq},${r + dr}`)).filter((n): n is number => n !== undefined)
  }

  const landCells = template.cells.flatMap((c, i) => (c.kind === 'land' ? [i] : []))
  const fogCells = template.cells.flatMap((c, i) => (c.kind === 'fog' ? [i] : []))

  // land pool: fixed counts, rest balanced
  const landPool: TileKind[] = []
  for (const [kind, n] of Object.entries(template.land.counts ?? {}) as [TileKind, number][]) {
    for (let i = 0; i < n; i++) landPool.push(kind)
  }
  landPool.push(...balanced(Math.max(0, landCells.length - landPool.length)))

  // fog pool: share of land (some of it gold), rest sea
  const fogLand = Math.round(fogCells.length * (template.fog?.landShare ?? 0))
  const fogGold = Math.min(template.fog?.gold ?? 0, fogLand)
  const fogPool: (TileKind | 'gold')[] = [
    ...Array<'gold'>(fogGold).fill('gold'),
    ...balanced(fogLand - fogGold),
    ...Array<TileKind>(fogCells.length - fogLand).fill('empty'),
  ]

  type Content = { resource: ResourceId | null, gold: boolean, number: number | null }
  let best: Content[] = []
  for (let attempt = 0; attempt < 300; attempt++) {
    const content: Content[] = template.cells.map(c => ({ resource: null, gold: c.kind === 'gold', number: null }))
    shuffle(landPool).forEach((kind, k) => { content[landCells[k]!]!.resource = kind === 'empty' ? null : kind })
    shuffle(fogPool).forEach((kind, k) => {
      const c = content[fogCells[k]!]!
      c.gold = kind === 'gold'
      c.resource = kind === 'gold' || kind === 'empty' ? null : kind
    })
    const numbered = content.flatMap((c, i) => (c.resource || c.gold ? [i] : []))
    const tokens = numberPool(numbered.length)
    numbered.forEach((i, k) => { content[i]!.number = tokens[k]! })

    const hot = (i: number) => content[i]!.number === 6 || content[i]!.number === 8
    best = content
    if (!numbered.some(i => hot(i) && neighbors(i).some(hot))) break
  }

  // center the map in world space
  const centers = template.cells.map(c => axialToWorld(c.axial))
  const cx = centers.reduce((a, c) => a + c[0], 0) / centers.length
  const cz = centers.reduce((a, c) => a + c[1], 0) / centers.length

  return template.cells.map((cell, i) => {
    const c = best[i]!
    const center: [number, number] = [centers[i]![0] - cx, centers[i]![1] - cz]
    if (cell.kind === 'fog') {
      // Fog hides the real content until explored.
      const land = !!(c.resource || c.gold)
      return { resource: null, number: null, gold: false, land: false, center, fog: { resource: c.resource, number: c.number, gold: c.gold, land } }
    }
    return { resource: c.resource, number: c.number, gold: c.gold, land: cell.kind !== 'sea', center }
  })
}
