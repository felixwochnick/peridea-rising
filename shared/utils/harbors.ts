import { buildBoard, HEX_SIZE, type Board, type BoardEdge, type BoardTile } from './board'
import { RESOURCE_ORDER, type ResourceId } from './resources'

// Trade stations (Catan harbors): XQ platforms on coastal edges.
// An outpost/base on one of the two corners of the edge trades 3:1 (any resource)
// or 2:1 (the station's resource) instead of 4:1 with the bank.

export interface Harbor {
  /** Edge id the station docks at. */
  edge: string
  /** 2:1 for this resource, null = 3:1 for any resource. */
  resource: ResourceId | null
  /** Station position (x, z), just off the coast. */
  pos: [number, number]
  corners: [string, string]
}

export const harborRate = (h: Harbor) => (h.resource ? 2 : 3)

/** Edges between explored land and open space (sea, empty tile or the map border). */
function coastalEdges(board: Board) {
  return Object.values(board.edges).flatMap((edge) => {
    const a = board.corners[edge.a]!
    const b = board.corners[edge.b]!
    const tiles = a.tiles.filter(t => b.tiles.includes(t))
    const land = tiles.filter(t => board.tiles[t]!.land && !board.tiles[t]!.fog)
    const other = tiles.filter(t => !land.includes(t))
    if (land.length !== 1 || other.some(t => board.tiles[t]!.fog)) return []
    return [{ edge, land: board.tiles[land[0]!]! }]
  })
}

/** True if all stations still sit on coastal edges of this board (stale saves / older map versions may not). */
export function harborsValid(board: Board, harbors: Harbor[]) {
  const coast = new Set(coastalEdges(board).map(c => c.edge.id))
  return harbors.every(h => coast.has(h.edge))
}

/** Coastal edges in walking order: one chain per coastline (closed loops around islands / the map). */
function coastlines<T extends { edge: BoardEdge }>(coast: T[]): T[][] {
  const byCorner = new Map<string, T[]>()
  for (const c of coast) {
    for (const id of [c.edge.a, c.edge.b]) byCorner.set(id, [...(byCorner.get(id) ?? []), c])
  }
  const seen = new Set<T>()
  const lines: T[][] = []
  for (const first of coast) {
    if (seen.has(first)) continue
    const line = [first]
    seen.add(first)
    let corner = first.edge.b
    for (;;) {
      const next = byCorner.get(corner)?.find(c => !seen.has(c))
      if (!next) break
      line.push(next)
      seen.add(next)
      corner = next.edge.a === corner ? next.edge.b : next.edge.a
    }
    lines.push(line)
  }
  return lines
}

/**
 * Places `count` stations evenly along the coasts, like the harbors around the Catan board:
 * every coastline gets stations in proportion to its length, at equal steps along it
 * (random start). 5× 2:1 (one per resource), the rest 3:1.
 */
export function generateHarbors(tiles: BoardTile[], count = 9): Harbor[] {
  const board = buildBoard(tiles)
  const coast = coastalEdges(board).map(({ edge, land }) => {
    const a = board.corners[edge.a]!.pos
    const b = board.corners[edge.b]!.pos
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const out = [mid[0] - land.center[0], mid[1] - land.center[1]]
    const len = Math.hypot(out[0]!, out[1]!) || 1
    const pos: [number, number] = [mid[0] + (out[0]! / len) * 0.5 * HEX_SIZE, mid[1] + (out[1]! / len) * 0.5 * HEX_SIZE]
    return { edge, pos }
  })
  if (!coast.length) return []

  // stations per coastline: proportional to its length (largest remainder), at most every 2nd edge
  const lines = coastlines(coast)
  const total = coast.length
  // closed loops: every 2nd edge at most; open coast pieces (next to fog) may use both ends
  const cap = (n: number) => Math.ceil(n / 2)
  const share = lines.map(l => Math.min(cap(l.length), Math.floor((count * l.length) / total)))
  const byRemainder = lines.map((l, i) => i).sort((a, b) =>
    ((count * lines[b]!.length) / total % 1) - ((count * lines[a]!.length) / total % 1))
  for (let left = count - share.reduce((a, b) => a + b, 0); left > 0;) {
    const i = byRemainder.find(k => share[k]! < cap(lines[k]!.length))
    if (i === undefined) break
    share[i]!++
    left--
    byRemainder.push(byRemainder.splice(byRemainder.indexOf(i), 1)[0]!) // spread extras over coastlines
  }

  const chosen: typeof coast = []
  const used = new Set<string>()
  lines.forEach((line, i) => {
    const k = share[i]!
    if (!k) return
    const step = line.length / k
    const offset = Math.random() * step
    for (let j = 0; j < k; j++) {
      const c = line[Math.floor(offset + j * step) % line.length]!
      if (used.has(c.edge.a) || used.has(c.edge.b)) continue // never two stations on one corner
      chosen.push(c)
      used.add(c.edge.a)
      used.add(c.edge.b)
    }
  })

  const kinds: (ResourceId | null)[] = [...RESOURCE_ORDER, ...Array<null>(Math.max(0, chosen.length - 5)).fill(null)]
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!]
  }
  return chosen.map((c, i) => ({ edge: c.edge.id, resource: kinds[i] ?? null, pos: c.pos, corners: [c.edge.a, c.edge.b] }))
}
