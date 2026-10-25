<script setup lang="ts">
import * as THREE from 'three'

// Schildgenerator (Catan city wall): a deflector shield bubble around the station, like the
// station shields in Empire at War – fresnel rim, faint hexagon cells, energy bands sweeping
// over the sphere, occasional impact ripples where a hit lands, flicker.
const props = withDefaults(defineProps<{
  position: [number, number, number]
  radius?: number
  /** Player color (Tailwind name or hex). */
  color: string
  /** Phase offset so neighbouring shields don't pulse in sync. */
  seed?: number
}>(), {
  radius: 0.46,
  seed: 0,
})

const uniforms = {
  uColor: { value: new THREE.Color(playerColorHex(props.color)) },
  uTime: { value: 0 },
  uSeed: { value: props.seed },
}
watch(() => props.color, (c) => { uniforms.uColor.value.set(playerColorHex(c)) })

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSeed;
  uniform float uRadius;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;

  // distance to the nearest hexagon edge (0 = on an edge)
  float hexEdge(vec2 p) {
    p *= vec2(1.0, 1.1547);
    vec2 a = mod(p, vec2(1.0, 1.7320)) - vec2(0.5, 0.866);
    vec2 b = mod(p - vec2(0.5, 0.866), vec2(1.0, 1.7320)) - vec2(0.5, 0.866);
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    h = abs(h);
    return 0.5 - max(dot(h, normalize(vec2(1.0, 1.7320))), h.x);
  }

  void main() {
    vec3 n = normalize(vNormal);
    float facing = abs(dot(n, normalize(vViewDir)));
    float rim = pow(1.0 - facing, 2.6);

    // spherical coordinates for the hex pattern
    vec3 d = normalize(vLocal);
    vec2 uv = vec2(atan(d.z, d.x) * 3.0, acos(clamp(d.y, -1.0, 1.0)) * 6.0);
    float hex = 1.0 - smoothstep(0.0, 0.06, hexEdge(uv * 1.6));

    float t = uTime + uSeed * 7.13;
    // energy bands sweeping from pole to pole
    float bands = pow(0.5 + 0.5 * sin(d.y * 9.0 - t * 2.2), 8.0);
    // impact ripple every few seconds from a random point
    float cycle = fract(t * 0.23);
    float k = floor(t * 0.23);
    vec3 hit = normalize(vec3(sin(k * 12.9 + uSeed), sin(k * 4.1 + uSeed * 2.0) * 0.6, cos(k * 7.7 + uSeed)));
    float dist = acos(clamp(dot(d, hit), -1.0, 1.0));
    float ripple = smoothstep(0.12, 0.0, abs(dist - cycle * 2.2)) * (1.0 - cycle);
    // slight flicker
    float flicker = 0.92 + 0.08 * sin(t * 37.0) * sin(t * 13.0);

    vec3 base = mix(uColor, vec3(0.75, 0.92, 1.0), 0.35);
    float a = (0.05 + rim * 0.75 + hex * 0.12 + bands * 0.18 + ripple * 0.6) * flicker;
    vec3 col = base * (0.6 + rim * 0.9 + ripple * 1.2) + vec3(hex * 0.12);
    gl_FragColor = vec4(col * a, a);
  }
`

const material = new THREE.ShaderMaterial({
  uniforms: { ...uniforms, uRadius: { value: props.radius } }, // same uniform objects → uTime updates apply
  vertexShader,
  fragmentShader,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
})
// full bubble around the station
const geometry = computed(() => new THREE.SphereGeometry(props.radius, 40, 28))

const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }: { elapsed: number }) => { uniforms.uTime.value = elapsed })
onBeforeUnmount(() => material.dispose())
</script>

<template>
  <TresMesh :position="position" :geometry="geometry" :material="material" :render-order="5" />
</template>
