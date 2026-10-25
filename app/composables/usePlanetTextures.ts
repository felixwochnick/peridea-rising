import * as THREE from 'three'

export interface PlanetTextures {
  color: THREE.Texture
  height: THREE.Texture
  clouds?: THREE.Texture
  emission?: THREE.Texture
}

// Which optional maps were baked for which planet.
const EXTRA_MAPS: Partial<Record<ResourceId, ('clouds' | 'emission')[]>> = {
  food: ['clouds'],
  wood: ['clouds'],
  kyber: ['emission'],
}

const cache = new Map<ResourceId, Promise<PlanetTextures>>()
const loader = new THREE.TextureLoader()

function load(url: string, srgb: boolean): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((tex: THREE.Texture) => {
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    tex.anisotropy = 8
    return tex
  })
}

function loadPlanet(id: ResourceId): Promise<PlanetTextures> {
  const base = `/textures/planets/${id}`
  const extras = EXTRA_MAPS[id] ?? []
  return Promise.all([
    load(`${base}/color.jpg`, true),
    load(`${base}/height.jpg`, false),
    ...extras.map(name => load(`${base}/${name}.jpg`, name === 'emission')),
  ]).then(([color, height, ...rest]) => {
    const textures: PlanetTextures = { color: color!, height: height! }
    extras.forEach((name, i) => { textures[name] = rest[i] })
    return textures
  })
}

/** Loads (and caches) the baked textures of a planet. */
export function usePlanetTextures(id: MaybeRefOrGetter<ResourceId>) {
  const textures = shallowRef<PlanetTextures | null>(null)
  watchEffect(() => {
    const key = toValue(id)
    if (!cache.has(key)) cache.set(key, loadPlanet(key))
    cache.get(key)!.then((t) => { if (toValue(id) === key) textures.value = t })
  })
  return textures
}
