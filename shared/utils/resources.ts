// The five resources of Galactic Colonization and their Catan counterparts.
// Planet textures are baked in blender/ships.blend into public/textures/planets/<id>/.
export type ResourceId = 'food' | 'wood' | 'tibanna' | 'kyber' | 'durasteel'

export interface ResourceDef {
  id: ResourceId
  name: string
  /** Catan resource this one replaces. */
  catan: string
  /** Where the resource is harvested. */
  source: string
  /** Planet surface or asteroid field. */
  kind: 'planet' | 'asteroids'
  /** Atmosphere / UI accent color. */
  color: string
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  food: { id: 'food', name: 'Nahrung', catan: 'Getreide', source: 'Agrarwelt', kind: 'planet', color: '#6fb7ff' },
  wood: { id: 'wood', name: 'Holz', catan: 'Holz', source: 'Waldmond', kind: 'planet', color: '#9be37a' },
  tibanna: { id: 'tibanna', name: 'Tibanna-Gas', catan: 'Wolle', source: 'Gasriese', kind: 'planet', color: '#ffb36b' },
  kyber: { id: 'kyber', name: 'Kyberkristalle', catan: 'Lehm', source: 'Eiswelt', kind: 'planet', color: '#7ff3ff' },
  durasteel: { id: 'durasteel', name: 'Durastahl', catan: 'Erz', source: 'Asteroidenfeld', kind: 'asteroids', color: '#c9d3dd' },
}

// --- Städte & Ritter: commodities (Catan paper / cloth / coin) ---------------------------
// A city on a Waldmond / Gasriese / Asteroidenfeld yields 1 resource + 1 commodity.
export type CommodityId = 'bacta' | 'fuel' | 'beskar'
export type ImprovementTrack = 'science' | 'trade' | 'politics'

export interface CommodityDef {
  id: CommodityId
  name: string
  catan: string
  /** Resource tile type a city turns into this commodity. */
  from: ResourceId
  /** City improvement track it pays for. */
  track: ImprovementTrack
  color: string
}

export const COMMODITIES: Record<CommodityId, CommodityDef> = {
  bacta: { id: 'bacta', name: 'Bacta', catan: 'Papier', from: 'wood', track: 'science', color: '#5be08a' },
  fuel: { id: 'fuel', name: 'Treibstoff', catan: 'Tuch', from: 'tibanna', track: 'trade', color: '#ffd23f' },
  beskar: { id: 'beskar', name: 'Beskar', catan: 'Münze', from: 'durasteel', track: 'politics', color: '#6aa8ff' },
}
export const COMMODITY_ORDER: CommodityId[] = ['bacta', 'fuel', 'beskar']

/** Any card in a hand: resource or commodity. */
export type CardId = ResourceId | CommodityId

/** Display info for any card (name, accent color, icon). */
export const CARD_INFO: Record<CardId, { name: string, color: string, image: string }> = {
  ...Object.fromEntries(Object.values(RESOURCES).map(r => [r.id, { name: r.name, color: r.color, image: `/images/resources/${r.id}.png` }])),
  ...Object.fromEntries(Object.values(COMMODITIES).map(c => [c.id, { name: c.name, color: c.color, image: `/images/resources/${c.id}.png` }])),
} as Record<CardId, { name: string, color: string, image: string }>

export const RESOURCE_ORDER: ResourceId[] = ['wood', 'kyber', 'tibanna', 'food', 'durasteel']
/** All card kinds that can be in a hand. */
export const CARD_ORDER: CardId[] = [...RESOURCE_ORDER, ...COMMODITY_ORDER]
