<script setup lang="ts">
import type { ShipType } from '~/components/Ship.vue'

definePageMeta({ layout: 'game', middleware: 'auth' })

// Planets and hyperlanes share one plane; ships float slightly above the lanes.
const BOARD_Y = 0
const SHIP_Y = 0.14
// Radius of the faint orbit circle around each system.
const ORBIT_RADIUS = 0.78

const showNumbers = useState('gc-show-numbers', () => false)
const { touch } = useHudLayout()

// Render budget: frame rate cap and pixel ratio from the graphics setting; while the menu is
// open or the window is in the background the scene only needs a few frames per second.
const { graphics, settings: gameSettings } = useGameSettings()
const windowFocused = ref(true)
onMounted(() => {
  windowFocused.value = document.hasFocus()
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('blur', onBlur)
})
function onFocus() { windowFocused.value = true }
function onBlur() { windowFocused.value = false }

// Length (x extent) per model: Dorf < Stadt < Metropole, knights by strength.
const SHIP_LENGTH: Record<ShipType, number> = {
  'rebel-dock-1': 0.32,
  'rebel-dock-2': 0.52,
  'rebel-dock-3': 0.72,
  'empire-dock-1': 0.5,
  'empire-dock-2': 0.7,
  'empire-dock-3': 0.9,
  'rebel-xwing': 0.17,
  'empire-tie': 0.11,
  'rebel-corvette': 0.42,
  'empire-gozanti': 0.42,
  'rebel-cruiser': 0.56,
  'empire-destroyer': 0.6,
  'empire-corvette': 0.4,
  'pirate-frigate': 0.5,
  'trade-station': 0.6,
}

const {
  tiles,
  board,
  players,
  me,
  structures,
  routes,
  selectedBuild,
  pirateTile,
  yieldEvent,
  pirates,
  pirateTargets,
  startRoll,
  runStartRoll,
  setup,
  myTurn,
  movePirates,
  harbors,
  repairHarbors,
  freeRoutes,
  winner,
  validSites,
  place,
  knights,
  metropolisAt,
  walls,
  knightTargets,
  moveKnight,
  ck,
  merchant,
  remote,
} = useGalacticGame()
const game = useGalacticGame()
const mp = useMultiplayer()

// Card effects that need a target on the board (progress cards)
const boardPick = useBoardPick()
const pickTiles = computed(() => (boardPick.current.value?.kind === 'tile' ? (boardPick.current.value.targets as number[]) : []))
// Handelskonvoi (Catan merchant): a freighter circling its system in the owner's color
const merchantShip = computed(() => {
  const m = merchant.value
  const tile = m ? tiles.value[m.tile] : null
  if (!m || !tile) return null
  return { center: tile.center, color: players.value.find((p) => p.id === m.owner)?.color ?? 'white' }
})

// Systems = tiles with a resource or a gold nexus; empty tiles (desert / sea) are just empty space.
const systems = computed(() =>
  tiles.value.flatMap((tile, index) => (tile.resource || tile.gold ? [{ ...tile, index }] : [])),
)
const fogTiles = computed(() =>
  tiles.value.flatMap((tile, index) => (tile.fog ? [{ ...tile, index }] : [])),
)
const numberTokens = computed(() =>
  systems.value.map((t) => ({ center: t.center, number: t.number! })),
)

// Camera framing and limits scale with the map size.
const radius = computed(() => boardRadius(board.value))
// Narrow (portrait) screens need more distance to show the whole width of the map.
const aspect = ref(16 / 9)
onMounted(() => { aspect.value = window.innerWidth / Math.max(1, window.innerHeight) })
const fit = computed(() => Math.max(1, 0.9 / aspect.value))
const cameraStart = computed<[number, number, number]>(() => [
  0,
  radius.value * 1.55 * fit.value,
  radius.value * 1.95 * fit.value,
])
const maxZoom = computed(() => Math.max(14, radius.value * 3.2 * fit.value))

// Orbit flash after a production roll: resource color if it produced, red if the pirates blocked it.
function orbitFlash(t: number) {
  const ev = yieldEvent.value
  if (!ev) return { key: null, color: '#ffffff' }
  const tile = tiles.value[t]!
  if (ev.tiles.includes(t))
    return { key: ev.id, color: tile.resource ? RESOURCES[tile.resource].color : '#ffcc33' }
  if (ev.blocked.includes(t)) return { key: ev.id, color: '#ef4444' }
  return { key: null, color: '#ffffff' }
}

// Island bonus and fog discoveries are announced by the game (notices).
function onPlace(siteId: string) {
  place(siteId)
}

const playerById = (id: string) => players.value.find((p) => p.id === id)!

// Built outposts / cities / metropolises as dockyards at their corners
const builtShips = computed(() =>
  Object.entries(structures.value)
    .filter(([cornerId]) => board.value.corners[cornerId])
    .map(([cornerId, s]) => {
      const owner = playerById(s.owner)
      const type = SIDE_SHIPS[owner.side][metropolisAt(cornerId) ? 'metropolis' : s.kind]
      const [x, z] = board.value.corners[cornerId]!.pos
      return {
        cornerId,
        type,
        color: owner.color,
        // docks stand just above the hyperlane plane (bottom-anchored in Ship.vue)
        position: [x, BOARD_Y + 0.03, z] as [number, number, number],
        heading: cornerHeading(board.value, cornerId),
        wall: !!walls.value[cornerId],
      }
    }),
)

// Städte & Ritter: knights (fleets) – inactive ones are dimmed
const builtKnights = computed(() =>
  Object.entries(knights.value)
    .filter(([cornerId]) => board.value.corners[cornerId])
    .map(([cornerId, k]) => {
      const owner = playerById(k.owner)
      const [x, z] = board.value.corners[cornerId]!.pos
      return {
        cornerId,
        type: SIDE_KNIGHTS[owner.side][k.level],
        color: owner.color,
        active: k.active,
        position: [x, SHIP_Y + 0.04, z] as [number, number, number],
        heading: cornerHeading(board.value, cornerId) + Math.PI / 2,
      }
    }),
)

// Owner rings under every piece
const ownerRings = computed(() => [
  ...builtShips.value.map((s) => ({
    pos: [s.position[0], s.position[2]] as [number, number],
    color: s.color,
    radius: s.type.endsWith('3') ? 0.36 : s.type.endsWith('2') ? 0.29 : 0.23,
  })),
  ...builtKnights.value.map((k) => ({
    pos: [k.position[0], k.position[2]] as [number, number],
    color: k.color,
    radius: 0.2,
    strong: k.active,
  })),
])

// Context menu: click (or right-click) on any piece
const pieceMenu = ref<{ corner: string, x: number, y: number } | null>(null)
const lastPointer = { x: 0, y: 0 }
function trackPointer(e: PointerEvent) {
  lastPointer.x = e.clientX
  lastPointer.y = e.clientY
}
onMounted(() => window.addEventListener('pointerdown', trackPointer, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', trackPointer, true))
const pieceHits = computed(() =>
  selectedBuild.value || knightMove.value || boardPick.current.value
    ? []
    : [...builtShips.value, ...builtKnights.value].map((p) => ({ corner: p.cornerId, position: [p.position[0], SHIP_Y, p.position[2]] as [number, number, number] })),
)
function openPieceMenu(corner: string) {
  pieceMenu.value = { corner, x: lastPointer.x, y: lastPointer.y }
}

// Knight move / displace: pick a target corner on the board
const knightMove = ref<string | null>(null)
function startKnightMove(corner: string) {
  knightMove.value = corner
  pieceMenu.value = null
}

// Trade stations: docking lines in the color of the player who uses the station.
const harborOwners = computed(() =>
  Object.fromEntries(
    harbors.value.map((h) => {
      const s = h.corners.map((c) => structures.value[c]).find(Boolean)
      return [h.edge, s ? playerById(s.owner).color : undefined]
    }),
  ),
)

const builtRoutes = computed(() =>
  Object.entries(routes.value)
    .filter(([edge]) => board.value.edges[edge])
    .map(([edge, owner]) => ({ edge, color: playerById(owner).color })),
)

// Build markers for the selected build (or the targets of a knight move)
const markerMode = computed(() =>
  boardPick.current.value
    ? boardPick.current.value.kind === 'edge'
      ? 'edge'
      : 'corner'
    : knightMove.value
    ? 'corner'
    : selectedBuild.value === 'route'
      ? 'edge'
      : selectedBuild.value === 'base' || selectedBuild.value === 'wall'
        ? 'upgrade'
        : 'corner',
)
const markerSites = computed(() => {
  const bp = boardPick.current.value
  if (bp) return bp.kind === 'tile' ? [] : (bp.targets as string[])
  if (knightMove.value) return knightTargets(me.value.id, knightMove.value)
  return selectedBuild.value && selectedBuild.value !== 'action' ? validSites(selectedBuild.value) : []
})
function onMarker(siteId: string) {
  if (boardPick.current.value) {
    boardPick.choose(siteId)
    return
  }
  if (knightMove.value) {
    moveKnight(me.value.id, knightMove.value, siteId)
    knightMove.value = null
    return
  }
  onPlace(siteId)
}
watch(myTurn, (mine) => {
  if (!mine) {
    knightMove.value = null
    pieceMenu.value = null
    if (!setup.value) selectedBuild.value = null
  }
})
watch(winner, (w) => { if (w) selectedBuild.value = null })

// Esc: cancel a build first, otherwise open the menu (when open, the menu handles Esc itself).
const menuOpen = useState('gc-menu', () => false)
defineShortcuts({
  escape: () => {
    if (menuOpen.value) return
    if (boardPick.current.value) boardPick.cancel()
    else if (pieceMenu.value) pieceMenu.value = null
    else if (knightMove.value) knightMove.value = null
    else if (selectedBuild.value && !setup.value) selectedBuild.value = null
    else menuOpen.value = true
  },
})

// Solo: bots/AIs play here, and victory is checked here (in multiplayer the server does both).
const { reduceMotion } = useGameSettings()
let stopDriver: (() => void) | null = null
// browser only: no bot timers during server-side rendering
onMounted(() => watch(remote, (isRemote) => {
  stopDriver?.()
  stopDriver = isRemote ? null : driveGame(game.engine, createBot(game.engine, { fast: () => reduceMotion.value }))
}, { immediate: true }))
onBeforeUnmount(() => stopDriver?.())

// Hyperraumvermessung: preselect the free routes.
watch(
  () => [freeRoutes.value, myTurn.value] as const,
  () => {
    if (freeRoutes.value > 0 && myTurn.value && !setup.value) selectedBuild.value = 'route'
  },
)

// Setup phase: preselect what the human has to place next.
watch(
  () => [setup.value?.step, setup.value?.need, myTurn.value] as const,
  () => {
    if (setup.value && myTurn.value) selectedBuild.value = setup.value.need
  },
  { immediate: true },
)

// Start roll ("Wer beginnt?"): restart it if the page was left in the middle of it.
onMounted(async () => {
  // multiplayer after a page reload: back into the game on the server
  if (!mp.active.value && await mp.resume()) return
  if (remote.value) return
  repairHarbors()
  const st = startRoll.value
  if (!st) return
  if (st.phase !== 'pending') {
    startRoll.value = { phase: 'pending', round: 1, results: [], current: null, winner: null }
  }
  runStartRoll()
})

// Pirates (Catan robber) circle the blocked tile on its orbit.
const pirateCenter = computed(() => tiles.value[pirateTile.value]!.center)
</script>

<template>
  <div class="relative h-full w-full" :class="{ 'hud-flat': !graphics.blur }">
    <!-- keyed by quality: antialiasing can only be set when the WebGL context is created -->
    <TresCanvas
      :key="gameSettings.quality"
      class="!h-full !w-full"
      :alpha="true"
      :antialias="graphics.antialias"
      :dpr="graphics.dpr"
      :fps-limit="menuOpen || !windowFocused ? 15 : graphics.fps"
    >
      <TresPerspectiveCamera :position="cameraStart" :look-at="[0, 0, 0]" :far="200" />
      <StrategyCamera :max-distance="maxZoom" :pan-limit="radius" />
      <TresAmbientLight :intensity="0.35" />
      <TresDirectionalLight :position="[5, 10, 5]" :intensity="2" cast-shadow />

      <Hyperlanes :board="board" :routes="builtRoutes" :y="BOARD_Y" />

      <template v-for="tile in systems" :key="tile.index">
        <!-- Faint system circle (flashes on production) -->
        <OrbitRing
          :position="[tile.center[0], BOARD_Y, tile.center[1]]"
          :radius="ORBIT_RADIUS"
          :flash-key="orbitFlash(tile.index).key"
          :flash-color="orbitFlash(tile.index).color"
        />
        <GoldNexus v-if="tile.gold" :position="[tile.center[0], BOARD_Y, tile.center[1]]" />
        <AsteroidField
          v-else-if="RESOURCES[tile.resource!].kind === 'asteroids'"
          :position="[tile.center[0], BOARD_Y, tile.center[1]]"
          :seed="tile.index + 1"
        />
        <Planet
          v-else
          :position="[tile.center[0], BOARD_Y, tile.center[1]]"
          :radius="tile.resource === 'tibanna' ? 0.5 : 0.45"
          :resource="tile.resource as Exclude<ResourceId, 'durasteel'>"
          :seed="tile.index"
        />
      </template>

      <!-- Unexplored fog -->
      <FogCloud
        v-for="tile in fogTiles"
        :key="`fog-${tile.index}`"
        :position="[tile.center[0], BOARD_Y, tile.center[1]]"
        :seed="tile.index"
      />

      <!-- Trade stations (Catan harbors) -->
      <TradeStations :harbors="harbors" :board="board" :y="SHIP_Y" :line-y="BOARD_Y" :owners="harborOwners" />

      <!-- Built dockyards (Dorf / Stadt / Metropole) -->
      <Ship
        v-for="ship in builtShips"
        :key="`${ship.cornerId}-${ship.type}`"
        :type="ship.type"
        :color="ship.color"
        :length="SHIP_LENGTH[ship.type]"
        :position="ship.position"
        :heading="ship.heading"
      />
      <!-- Schildgeneratoren (city walls): deflector shield bubble around the station -->
      <ShieldDome
        v-for="(ship, i) in builtShips.filter((s) => s.wall)"
        :key="`wall-${ship.cornerId}`"
        :position="[ship.position[0], SHIP_Y, ship.position[2]]"
        :color="ship.color"
        :seed="i"
      />

      <!-- Städte & Ritter: fleets -->
      <Ship
        v-for="k in builtKnights"
        :key="`knight-${k.cornerId}-${k.type}-${k.active}`"
        :type="k.type"
        :color="k.color"
        :length="SHIP_LENGTH[k.type]"
        :position="k.position"
        :heading="k.heading"
        :dim="!k.active"
      />

      <OwnerRings :items="ownerRings" :y="BOARD_Y + 0.004" />

      <!-- Click targets for the context menu -->
      <TresMesh
        v-for="h in pieceHits"
        :key="`hit-${h.corner}`"
        :position="h.position"
        @click="openPieceMenu(h.corner)"
        @context-menu="openPieceMenu(h.corner)"
      >
        <TresSphereGeometry :args="[0.2, 10, 8]" />
        <TresMeshBasicMaterial :transparent="true" :opacity="0" :depth-write="false" />
      </TresMesh>

      <!-- Possible build sites for the selected build -->
      <BuildMarkers
        v-if="markerSites.length"
        :board="board"
        :mode="markerMode"
        :sites="markerSites"
        :color="me.color"
        :ship-y="SHIP_Y"
        @place="onMarker"
      />

      <YieldProjector />

      <!-- Pirate targets after a 7 (only when the human moves them) -->
      <PirateTargets
        v-if="pirates?.phase === 'move' && pirates.roller === me.id"
        :tiles="tiles"
        :targets="pirateTargets()"
        :radius="ORBIT_RADIUS"
        @pick="movePirates"
      />

      <!-- Progress card: pick systems on the board -->
      <PirateTargets
        v-if="pickTiles.length"
        :tiles="tiles"
        :targets="pickTiles"
        :radius="ORBIT_RADIUS"
        color="#5be08a"
        @pick="boardPick.choose"
      />

      <!-- Handelskonvoi -->
      <Ship
        v-if="merchantShip"
        type="empire-corvette"
        :color="merchantShip.color"
        :orbit="{ center: [merchantShip.center[0], SHIP_Y + 0.05, merchantShip.center[1]], radius: ORBIT_RADIUS * 0.82, speed: -0.25 }"
        :length="0.32"
      />

      <NumberTokens :tokens="numberTokens" :visible="showNumbers || !!pickTiles.length" />

      <!-- Piraten (Räuber) -->
      <Ship
        type="pirate-frigate"
        :orbit="{
          center: [pirateCenter[0], SHIP_Y, pirateCenter[1]],
          radius: ORBIT_RADIUS,
          speed: 0.35,
        }"
        :length="SHIP_LENGTH['pirate-frigate']"
      />
    </TresCanvas>

    <!-- HUD overlay: players on top, resources / build menu / dice at the bottom -->
    <!-- HUD: top and bottom bar are pinned, so nothing else in this layer can push them around -->
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute inset-x-0 top-0 flex items-start gap-1.5 px-2 pt-2 full:px-3 full:pt-3 large:gap-3 large:px-4">
        <GamePlayerBar class="min-w-0 flex-1" />
        <GameViewToggles />
      </div>
      <GameMouseTrap />
      <div class="absolute inset-x-0 bottom-0">
        <GameCommandBar />
      </div>
      <GameGoldPicker />
      <GamePiratePanel />
      <GameTradePanel />
      <GameDevCardPanel v-if="!ck" />
      <GameProgressPanel v-else />
      <GameImprovementPanel />
      <GameBarbarianTrack />
      <GamePieceMenu v-if="pieceMenu" :corner="pieceMenu.corner" :x="pieceMenu.x" :y="pieceMenu.y" @close="pieceMenu = null" @move-knight="startKnightMove" />
      <!-- Build hint -->
      <div
        v-if="(selectedBuild && selectedBuild !== 'action') || knightMove || boardPick.current.value"
        class="hud-above-bar absolute inset-x-0 mx-auto w-fit rounded-2xl border border-primary/40 bg-black/60 px-4 py-1.5 text-center text-sm text-white backdrop-blur-md sm:rounded-full sm:px-5 sm:py-2 large:text-base"
      >
        <template v-if="boardPick.current.value">
          {{ boardPick.current.value.prompt }}
          <template v-if="boardPick.current.value.count > 1">
            ({{ boardPick.current.value.picked.length }}/{{ boardPick.current.value.count }})
            <button v-if="boardPick.current.value.picked.length" type="button" class="ml-1 text-primary underline" @click="boardPick.finish()">fertig</button>
          </template>
          ·
          <button type="button" class="text-primary underline" @click="boardPick.cancel()">abbrechen</button>
        </template>
        <template v-else-if="knightMove">
          Wähle ein Ziel für deine Flotte (schwächere gegnerische Flotten werden verdrängt) ·
          <button type="button" class="text-primary underline" @click="knightMove = null">abbrechen</button>
        </template>
        <template v-else-if="setup">
          Aufbauphase ({{ setup.step < players.length ? '1.' : '2.' }} Runde):
          {{
            setup.need === 'outpost'
              ? ck && setup.step >= players.length
                ? 'setze eine Stadt (mittleres Dock)'
                : 'setze einen Außenposten'
              : 'setze eine Route an deinen neuen Außenposten'
          }}
          <span
            v-if="setup.need === 'outpost' && setup.step >= players.length"
            class="text-primary"
          >
            – bringt Startertrag</span
          >
        </template>
        <template v-else-if="freeRoutes > 0 && selectedBuild === 'route'">
          Hyperraumvermessung: setze noch {{ freeRoutes }} Gratis-Route{{ freeRoutes > 1 ? 'n' : '' }}
        </template>
        <template v-else-if="touch">
          Tippe auf einen markierten Bauplatz ·
          <button type="button" class="text-primary underline" @click="selectedBuild = null">abbrechen</button>
        </template>
        <template v-else>Wähle einen markierten Bauplatz · <UKbd value="Esc" /> abbrechen</template>
      </div>
    </div>
    <GameYieldFlights />
    <GameDiceRoll />
    <GameStartRoll />
    <GameMenu />
    <GameNotifier />
    <GameVictoryScreen />
  </div>
</template>
