<script setup lang="ts">
import * as THREE from 'three'

const props = withDefaults(defineProps<{
  position?: [number, number, number]
  radius?: number
  resource?: Exclude<ResourceId, 'durasteel'>
  color?: string
  /** Rotation speed in radians per second. */
  spin?: number
  /** Varies start rotation and axial tilt, so planets of the same type don't look identical. */
  seed?: number
}>(), {
  position: () => [0, 0, 0],
  radius: 1,
  resource: undefined,
  color: '#ffffff',
  spin: 0.08,
  seed: 0,
})

const tilt = computed<[number, number, number]>(() => [
  ((props.seed * 0.618) % 1 - 0.5) * 0.5,
  0,
  ((props.seed * 0.414) % 1 - 0.5) * 0.6,
])

const textures = usePlanetTextures(() => props.resource ?? 'food')
const tex = computed(() => (props.resource ? textures.value : null))
const atmosphereColor = computed(() => new THREE.Color(props.resource ? RESOURCES[props.resource].color : props.color))

// Atmosphere: a thin haze over the limb (front faces of a shell hugging the surface)
// and an outer glow (back faces of a larger shell) that fades out softly. Both are lit from the sun side.
const SUN_DIR = new THREE.Vector3(5, 10, 5).normalize()
const atmosphereUniforms = {
  uColor: { value: atmosphereColor.value },
  uSunDir: { value: SUN_DIR },
}
watch(atmosphereColor, (c) => { atmosphereUniforms.uColor.value = c })
const GLOW_SCALE = 1.12
// Back-face facing ratio at which the glow shell touches the planet limb.
const LIMB = Math.sqrt(1 - 1 / (GLOW_SCALE * GLOW_SCALE)).toFixed(3)
const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * mvPosition;
  }
`
const hazeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  void main() {
    float rim = 1.0 - clamp(dot(vNormal, vViewDir), 0.0, 1.0);
    float light = 0.25 + 0.75 * clamp(dot(vWorldNormal, uSunDir) + 0.3, 0.0, 1.0);
    float a = pow(rim, 3.0) * 0.75 * light;
    gl_FragColor = vec4(uColor * a, a);
  }
`
const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  void main() {
    // Back faces: 0 at the outer silhouette, LIMB where the shell meets the planet edge.
    float f = clamp(-dot(vNormal, vViewDir), 0.0, 1.0);
    float limb = ${LIMB};
    float glow = pow(clamp(f / limb, 0.0, 1.0), 2.2);
    float light = 0.15 + 0.85 * clamp(dot(vWorldNormal, uSunDir) + 0.35, 0.0, 1.0);
    float a = glow * 0.55 * light;
    gl_FragColor = vec4(uColor * a, a);
  }
`

const surface = shallowRef<THREE.Mesh>()
const clouds = shallowRef<THREE.Mesh>()
watch(surface, (m) => { if (m) m.rotation.y = props.seed * 2.399 })
watch(clouds, (m) => { if (m) m.rotation.y = props.seed * 1.7 })
const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }: { delta: number }) => {
  if (surface.value) surface.value.rotation.y += props.spin * delta
  if (clouds.value) clouds.value.rotation.y += props.spin * 1.35 * delta
})
</script>

<template>
  <TresGroup :position="position" :rotation="tilt">
    <!-- Surface -->
    <TresMesh ref="surface">
      <TresSphereGeometry :args="[radius, 64, 40]" />
      <TresMeshStandardMaterial
        v-if="tex"
        :map="tex.color"
        :bump-map="tex.height"
        :bump-scale="resource === 'tibanna' ? 0.5 : 3"
        :emissive-map="tex.emission ?? null"
        :emissive="tex.emission ? '#ffffff' : '#000000'"
        :emissive-intensity="tex.emission ? 1.4 : 0"
        :roughness="0.85"
        :metalness="0"
      />
      <TresMeshStandardMaterial
        v-else
        :color="color"
        :roughness="0.8"
        :metalness="0.1"
      />
    </TresMesh>

    <!-- Cloud layer -->
    <TresMesh v-if="tex?.clouds" ref="clouds">
      <TresSphereGeometry :args="[radius * 1.012, 48, 32]" />
      <TresMeshStandardMaterial
        color="#ffffff"
        :alpha-map="tex.clouds"
        :transparent="true"
        :depth-write="false"
        :roughness="1"
      />
    </TresMesh>

    <!-- Atmosphere: limb haze + soft outer glow -->
    <template v-if="resource">
      <TresMesh :scale="1.004">
        <TresSphereGeometry :args="[radius, 40, 24]" />
        <TresShaderMaterial
          :vertex-shader="atmosphereVertex"
          :fragment-shader="hazeFragment"
          :uniforms="atmosphereUniforms"
          :blending="THREE.AdditiveBlending"
          :transparent="true"
          :depth-write="false"
        />
      </TresMesh>
      <TresMesh :scale="GLOW_SCALE">
        <TresSphereGeometry :args="[radius, 40, 24]" />
        <TresShaderMaterial
          :vertex-shader="atmosphereVertex"
          :fragment-shader="glowFragment"
          :uniforms="atmosphereUniforms"
          :side="THREE.BackSide"
          :blending="THREE.AdditiveBlending"
          :transparent="true"
          :depth-write="false"
        />
      </TresMesh>
    </template>
  </TresGroup>
</template>
