<script setup lang="ts">
import * as THREE from 'three'

// Models are built in blender/ships.blend and exported to public/models.
// Catan mapping: dockyards = Siedlung / Stadt / Metropole, warships = Ritter (Städte & Ritter),
// pirate = Räuber, XQ1 platform = Hafen.
export type ShipType =
  | 'rebel-dock-1' | 'rebel-dock-2' | 'rebel-dock-3' // Alliance Light / Medium / Warship Dockyard
  | 'empire-dock-1' | 'empire-dock-2' | 'empire-dock-3' // Imperial Light / Medium / Warship Dockyard
  | 'rebel-xwing' // X-Wing squadron (knight 1)
  | 'rebel-corvette' // CR90 Corellian Corvette (knight 2)
  | 'rebel-cruiser' // MC80 Mon Calamari Cruiser (knight 3)
  | 'empire-tie' // TIE fighter squadron (knight 1)
  | 'empire-gozanti' // Gozanti-class cruiser (knight 2)
  | 'empire-corvette' // Tartan Patrol Cruiser (unused)
  | 'empire-destroyer' // Imperial Star Destroyer (knight 3)
  | 'pirate-frigate' // IPV-1 style pirate frigate
  | 'trade-station' // XQ1 platform (Catan harbor)

/** Fighters are shown as a squadron of three. */
const SQUADRONS: ShipType[] = ['rebel-xwing', 'empire-tie']

const props = withDefaults(defineProps<{
  type: ShipType
  position?: [number, number, number]
  /** Heading around the Y axis in radians (0 = bow points to +X). */
  heading?: number
  /** Length of the ship (bow to stern) in scene units; for docks the largest footprint extent. */
  length?: number
  /** Player color (Tailwind name or hex), applied to the "TeamColor" material. */
  color?: string
  /** Gentle hover animation. */
  bob?: boolean
  /** Slow rotation around the Y axis (radians per second), e.g. for stations. */
  spin?: number
  /** Dimmed look, e.g. an inactive knight. */
  dim?: boolean
  /** Fly a circular orbit around `center` (overrides position and heading). */
  orbit?: { center: [number, number, number], radius: number, speed?: number }
}>(), {
  position: () => [0, 0, 0],
  heading: 0,
  length: 0.5,
  color: undefined,
  bob: true,
  spin: 0,
  dim: false,
  orbit: undefined,
})

const { state } = useGLTF(computed(() => `/models/${props.type}.glb`))

const model = computed(() => {
  const gltf = state.value
  if (!gltf) return null

  const root = gltf.scene.clone(true)
  const teamColor = props.color ? new THREE.Color(playerColorHex(props.color)) : null

  root.traverse((obj: THREE.Object3D) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.castShadow = true
    if (!teamColor) return
    const recolor = (m: THREE.Material) => {
      // Per-ship materials are named "<ship>__TeamColor"; their baked map is a grey
      // plating texture, so multiplying with the player color keeps the panel detail.
      if (!m.name.endsWith('TeamColor')) return m
      const clone = (m as THREE.MeshStandardMaterial).clone()
      clone.color.copy(teamColor)
      clone.emissive.copy(teamColor)
      // bright enough to tell the owner at a glance
      clone.emissiveIntensity = 0.45
      return clone
    }
    obj.material = Array.isArray(obj.material) ? obj.material.map(recolor) : recolor(obj.material)
  })

  // Center the model and scale it to the requested length.
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  // stations stand on their lowest point (nothing reaches below the hyperlane plane),
  // ships are centered (they float)
  if (props.type.includes('-dock-')) root.position.set(-center.x, -box.min.y, -center.z)
  else root.position.sub(center)
  const wrapper = new THREE.Group()
  // ships: length = bow to stern (x); stations (docks): length = largest footprint extent
  const extent = props.type.includes('-dock-') ? Math.max(size.x, size.z) : size.x
  wrapper.scale.setScalar(props.length / extent)
  if (SQUADRONS.includes(props.type)) {
    // three fighters circling in a loose formation
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group()
      const fighter = i === 0 ? root : root.clone(true)
      // On the circle (+Z of the pivot), slightly stacked. The pivot turns counter-clockwise,
      // so at +Z the direction of travel is +X = the bow of the models.
      fighter.position.add(new THREE.Vector3(0, (i - 1) * 0.25, 1.1))
      fighter.rotation.x = -0.35 // bank: top of the fighter leans towards the center
      pivot.rotation.y = (i / 3) * Math.PI * 2
      pivot.userData.squadron = true
      pivot.add(fighter)
      wrapper.add(pivot)
    }
  }
  else wrapper.add(root)
  if (props.dim) {
    wrapper.traverse((obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh)) return
      const fade = (m: THREE.Material) => {
        const c = (m as THREE.MeshStandardMaterial).clone()
        c.color?.multiplyScalar(0.45)
        c.emissiveIntensity = (c.emissiveIntensity ?? 0) * 0.3
        return c
      }
      obj.material = Array.isArray(obj.material) ? obj.material.map(fade) : fade(obj.material)
    })
  }
  return wrapper
})

const group = shallowRef<THREE.Group>()
const phase = Math.random() * Math.PI * 2
let orbitAngle = phase
const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed, delta }: { elapsed: number, delta: number }) => {
  const g = group.value
  if (!g) return
  const bob = props.bob ? Math.sin(elapsed * 1.2 + phase) * 0.02 : 0
  if (props.orbit) {
    const { center, radius, speed = 0.3 } = props.orbit
    orbitAngle += speed * delta
    g.position.set(center[0] + Math.cos(orbitAngle) * radius, center[1] + bob, center[2] + Math.sin(orbitAngle) * radius)
    // Bow along the direction of travel (tangent of the circle).
    g.rotation.set(0, -orbitAngle - Math.PI / 2 * Math.sign(speed), 0)
  }
  else {
    g.position.set(props.position[0], props.position[1] + bob, props.position[2])
    g.rotation.set(0, props.heading + props.spin * elapsed, 0)
  }
  // squadrons circle around their spot
  const m = model.value
  if (m && SQUADRONS.includes(props.type)) {
    for (const pivot of m.children) if (pivot.userData.squadron) pivot.rotation.y += delta * (props.dim ? 0.25 : 0.9)
  }
})
</script>

<template>
  <TresGroup ref="group">
    <primitive v-if="model" :object="model" />
  </TresGroup>
</template>
