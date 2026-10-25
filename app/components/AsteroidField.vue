<script setup lang="ts">
import * as THREE from 'three'

// Durastahl source: a drifting cluster of ore-veined asteroids (public/models/asteroids.glb).
const props = withDefaults(defineProps<{
  position?: [number, number, number]
  /** Radius of the field in scene units. */
  radius?: number
  count?: number
  /** Seed for a stable layout. */
  seed?: number
}>(), {
  position: () => [0, 0, 0],
  radius: 0.42,
  count: 30,
  seed: 1,
})

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const { state } = useGLTF('/models/asteroids.glb')

// One instanced mesh per rock shape (a few draw calls per field instead of one per rock).
interface Rock { mesh: THREE.InstancedMesh, index: number, position: THREE.Vector3, rotation: THREE.Euler, scale: number, spin: THREE.Vector3 }

const field = computed(() => {
  const gltf = state.value
  if (!gltf) return null
  const templates: THREE.Mesh[] = []
  gltf.scene.traverse((o: THREE.Object3D) => { if (o instanceof THREE.Mesh) templates.push(o) })

  const rand = mulberry32(props.seed)
  const group = new THREE.Group()
  const perShape = templates.map((_, k) => Math.ceil((props.count - k) / templates.length))
  const meshes = templates.map((t, k) => {
    const mesh = new THREE.InstancedMesh(t.geometry, t.material, Math.max(1, perShape[k]!))
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    group.add(mesh)
    return mesh
  })
  const rocks: Rock[] = []
  for (let i = 0; i < props.count; i++) {
    // Denser towards the middle, flattened into a disc.
    const r = props.radius * Math.sqrt(rand()) * 0.95
    const a = rand() * Math.PI * 2
    const position = new THREE.Vector3(Math.cos(a) * r, (rand() - 0.5) * 0.25 * (1 - r / props.radius + 0.3), Math.sin(a) * r)
    const big = rand() < 0.15
    const scale = big ? 0.08 + rand() * 0.04 : 0.025 + rand() * 0.04
    const rotation = new THREE.Euler(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
    const spin = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8)
    rocks.push({ mesh: meshes[i % templates.length]!, index: Math.floor(i / templates.length), position, rotation, scale, spin })
  }
  return { group, rocks, meshes }
})

const matrix = new THREE.Matrix4()
const quat = new THREE.Quaternion()
const scaleVec = new THREE.Vector3()
function updateRocks(delta: number) {
  const f = field.value
  if (!f) return
  f.group.rotation.y += 0.04 * delta
  for (const rock of f.rocks) {
    rock.rotation.x += rock.spin.x * delta
    rock.rotation.y += rock.spin.y * delta
    rock.rotation.z += rock.spin.z * delta
    rock.mesh.setMatrixAt(rock.index, matrix.compose(rock.position, quat.setFromEuler(rock.rotation), scaleVec.setScalar(rock.scale)))
  }
  for (const m of f.meshes) m.instanceMatrix.needsUpdate = true
}
watch(field, () => updateRocks(0), { immediate: true })

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }: { delta: number }) => updateRocks(delta))
</script>

<template>
  <TresGroup :position="position">
    <primitive v-if="field" :object="field.group" />
  </TresGroup>
</template>
