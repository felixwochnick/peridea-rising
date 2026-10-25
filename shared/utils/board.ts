import * as THREE from 'three'
import type { ResourceId } from './resources'

// Board geometry: hex tiles (invisible), their corners (build sites for outposts/bases)
// and edges (hyperlanes = Catan roads), plus adjacency for the build rules.

export const HEX_SIZE = 1.2

export interface BoardTile {
  /** null = empty space (Catan desert / sea) or a gold field */
  resource: ResourceId | null
  number: number | null
  center: [number, number] // x, z
  /** Seafarers gold field: produces a resource of the owner's choice. */
  gold?: boolean
  /** Part of an island (land or desert); sea is empty space between islands. */
  land?: boolean
  /** Unexplored fog tile and its hidden content. */
  fog?: { resource: ResourceId | null, number: number | null, gold: boolean, land: boolean } | null
}

export interface BoardCorner {
  id: string
  pos: [number, number]
  tiles: number[]
  edges: string[]
  neighbors: string[]
}

export interface BoardEdge {
  id: string
  a: string
  b: string
}

export interface Board {
  tiles: BoardTile[]
  /** Island id per tile (null for sea / fog). */
  islands: (number | null)[]
  corners: Record<string, BoardCorner>
  edges: Record<string, BoardEdge>
}

const key = (x: number, z: number) => `${x.toFixed(3)}|${z.toFixed(3)}`

export function buildBoard(tiles: BoardTile[], size = HEX_SIZE): Board {
  const corners: Record<string, BoardCorner> = {}
  const edges: Record<string, BoardEdge> = {}

  // Corners shared by neighboring tiles are computed from different centers, so their
  // coordinates differ by float noise: merge points within a small tolerance (a plain
  // rounded key can split one corner in two at a rounding boundary).
  const grid = new Map<string, BoardCorner[]>()
  const cell = (x: number, z: number) => `${Math.round(x * 10)}|${Math.round(z * 10)}`
  const corner = (x: number, z: number) => {
    const gx = Math.round(x * 10)
    const gz = Math.round(z * 10)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const hit = grid.get(`${gx + dx}|${gz + dz}`)?.find(c => Math.abs(c.pos[0] - x) < 1e-3 && Math.abs(c.pos[1] - z) < 1e-3)
        if (hit) return hit
      }
    }
    const id = key(x, z)
    const c: BoardCorner = { id, pos: [x, z], tiles: [], edges: [], neighbors: [] }
    corners[id] = c
    const k = cell(x, z)
    grid.set(k, [...(grid.get(k) ?? []), c])
    return c
  }

  tiles.forEach((tile, t) => {
    const ids = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i
      const c = corner(tile.center[0] + Math.cos(angle) * size, tile.center[1] + Math.sin(angle) * size)
      if (!c.tiles.includes(t)) c.tiles.push(t)
      return c.id
    })
    ids.forEach((a, i) => {
      const b = ids[(i + 1) % 6]!
      const id = [a, b].sort().join('/')
      if (edges[id]) return
      edges[id] = { id, a, b }
      corners[a]!.edges.push(id)
      corners[b]!.edges.push(id)
      corners[a]!.neighbors.push(b)
      corners[b]!.neighbors.push(a)
    })
  })
  // Islands: land tiles connected through shared edges (two shared corners).
  const tileCorners = tiles.map(() => new Set<string>())
  for (const c of Object.values(corners)) for (const t of c.tiles) tileCorners[t]!.add(c.id)
  const islands: (number | null)[] = tiles.map(() => null)
  let next = 0
  tiles.forEach((tile, i) => {
    if (!tile.land || islands[i] !== null) return
    const stack = [i]
    islands[i] = next
    while (stack.length) {
      const a = stack.pop()!
      tiles.forEach((other, b) => {
        if (!other.land || islands[b] !== null) return
        let shared = 0
        for (const id of tileCorners[a]!) if (tileCorners[b]!.has(id)) shared++
        if (shared >= 2) {
          islands[b] = next
          stack.push(b)
        }
      })
    }
    next++
  })

  return { tiles, islands, corners, edges }
}

/** Islands a corner belongs to. */
export function cornerIslands(board: Board, cornerId: string): number[] {
  return [...new Set(board.corners[cornerId]!.tiles.map(t => board.islands[t]).filter((i): i is number => i !== null))]
}

/** Distance from the board center to its outermost corner. */
export function boardRadius(board: Board) {
  return Math.max(HEX_SIZE, ...Object.values(board.corners).map(c => Math.hypot(c.pos[0], c.pos[1])))
}

/** Position/rotation/length for a Y-aligned cylinder lying along an edge at height `y`. */
export function edgeTransform(board: Board, edgeId: string, y = 0) {
  const edge = board.edges[edgeId]!
  const a = board.corners[edge.a]!.pos
  const b = board.corners[edge.b]!.pos
  const dir = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1])
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  const e = new THREE.Euler().setFromQuaternion(q)
  return {
    position: [(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2] as [number, number, number],
    rotation: [e.x, e.y, e.z] as [number, number, number],
    length: dir.length(),
  }
}

/** Heading (rotation around Y) that points a ship at a corner away from the board center. */
export function cornerHeading(board: Board, cornerId: string) {
  const [x, z] = board.corners[cornerId]!.pos
  return -Math.atan2(z, x)
}
