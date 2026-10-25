<script setup lang="ts">
// Context menu for a piece on the board (click or right-click): what it is, whom it belongs to,
// what it produces – and for own pieces the possible upgrades / actions with their costs.
const props = defineProps<{ corner: string, x: number, y: number }>()
const emit = defineEmits<{ close: [], moveKnight: [corner: string] }>()

const g = useGalacticGame()
const { me, players, structures, knights, walls, board, tiles, ck, metropolisAt, buildBlocker, build, knightBlocker, activateKnight, promoteKnight, chasePirates } = g
const toast = useToast()

const structure = computed(() => structures.value[props.corner])
const knight = computed(() => knights.value[props.corner])
const ownerId = computed(() => structure.value?.owner ?? knight.value?.owner)
const owner = computed(() => players.value.find(p => p.id === ownerId.value))
const mine = computed(() => ownerId.value === me.value.id)
const colorVar = (c: string) => `var(--color-${c}-400)`

const title = computed(() => {
  const s = structure.value
  if (s) {
    const metro = metropolisAt(props.corner)
    if (metro) return { name: 'Kriegsschiff-Dock', role: `Metropole (${TRACKS[metro].name})` }
    return s.kind === 'base' ? { name: 'Mittleres Dock', role: 'Stadt' } : { name: 'Leichtes Dock', role: 'Außenposten (Dorf)' }
  }
  const k = knight.value!
  return { name: KNIGHT_NAMES[k.level], role: `Flotte Stufe ${k.level} · ${k.active ? 'einsatzbereit' : 'inaktiv'}` }
})

/** Adjacent systems with their numbers (what this spot produces). */
const neighbours = computed(() => board.value.corners[props.corner]!.tiles
  .map(t => tiles.value[t]!)
  .filter(t => t.resource || t.gold)
  .map(t => ({ name: t.resource ? RESOURCES[t.resource].name : 'Handelsnexus', number: t.number, image: t.resource ? `/images/resources/${t.resource}.png` : null })))

interface MenuAction { label: string, icon: string, cost?: Partial<Hand>, blocker: string | null, run: () => boolean }
const actions = computed<MenuAction[]>(() => {
  if (!mine.value) return []
  const pid = me.value.id
  const list: MenuAction[] = []
  const s = structure.value
  if (s?.kind === 'outpost') {
    const option = BUILD_OPTIONS.find(o => o.id === 'base')!
    list.push({ label: 'Zur Stadt ausbauen', icon: 'i-lucide-arrow-big-up', cost: option.cost, blocker: buildBlocker(option), run: () => !!build(pid, 'base', props.corner) })
  }
  if (s?.kind === 'base' && ck.value && !walls.value[props.corner]) {
    const option = BUILD_OPTIONS.find(o => o.id === 'wall')!
    list.push({ label: 'Schildgenerator bauen (+2 Handlimit)', icon: 'i-lucide-shield', cost: option.cost, blocker: buildBlocker(option), run: () => !!build(pid, 'wall', props.corner) })
  }
  const k = knight.value
  if (k) {
    if (!k.active) list.push({ label: 'Aktivieren', icon: 'i-lucide-power', cost: CK_COSTS.activate, blocker: knightBlocker(pid, props.corner, 'activate'), run: () => activateKnight(pid, props.corner) })
    if (k.level < 3) list.push({ label: `Ausbauen zur ${KNIGHT_NAMES[(k.level + 1) as KnightLevel]}`, icon: 'i-lucide-chevrons-up', cost: CK_COSTS.promote, blocker: knightBlocker(pid, props.corner, 'promote'), run: () => promoteKnight(pid, props.corner) })
    list.push({ label: 'Verlegen / Flotte verdrängen', icon: 'i-lucide-move', blocker: knightBlocker(pid, props.corner, 'move'), run: () => { emit('moveKnight', props.corner); return false } })
    list.push({ label: 'Piraten vertreiben', icon: 'i-lucide-skull', blocker: knightBlocker(pid, props.corner, 'chase'), run: () => chasePirates(pid, props.corner) })
  }
  return list
})

function run(a: MenuAction) {
  if (a.blocker) {
    toast.add({ title: a.blocker, icon: 'i-lucide-circle-alert', color: 'warning', duration: 2200 })
    return
  }
  if (a.run()) emit('close')
}

// keep the menu on screen
const style = computed(() => {
  const w = 300
  const left = Math.min(Math.max(8, props.x + 12), (import.meta.client ? window.innerWidth : 1920) - w - 8)
  const top = Math.min(Math.max(8, props.y - 20), (import.meta.client ? window.innerHeight : 1080) - 320)
  return { left: `${left}px`, top: `${top}px`, width: `${w}px` }
})
</script>

<template>
  <div class="pointer-events-auto fixed inset-0 z-40" @click="emit('close')" @contextmenu.prevent="emit('close')">
    <div
      class="absolute rounded-xl border bg-black/90 p-3 shadow-2xl"
      :style="{ ...style, borderColor: owner ? colorVar(owner.color) : undefined }"
      @click.stop
      @contextmenu.prevent.stop
    >
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="font-semibold">{{ title.name }}</div>
          <div class="text-sm text-muted">{{ title.role }}</div>
        </div>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Schließen" @click="emit('close')" />
      </div>
      <div v-if="owner" class="mt-1 text-sm">
        <span :style="{ color: colorVar(owner.color) }">{{ owner.name }}</span>
        <span class="text-muted"> · {{ owner.side === 'rebel' ? 'Rebellen' : 'Imperium' }}</span>
        <UBadge v-if="walls[corner]" class="ml-1" size="sm" color="info" variant="subtle" icon="i-lucide-shield" label="Schild" />
      </div>
      <div v-if="structure && neighbours.length" class="mt-2 flex flex-wrap gap-1.5">
        <UTooltip v-for="(n, i) in neighbours" :key="i" :text="n.name">
          <span class="flex items-center gap-1 rounded-full bg-white/5 py-0.5 pr-2 pl-0.5 text-xs">
            <img v-if="n.image" :src="n.image" alt="" class="size-5 object-contain">
            <UIcon v-else name="i-lucide-gem" class="size-4 text-amber-300" />
            {{ n.number }}
          </span>
        </UTooltip>
      </div>

      <div v-if="actions.length" class="mt-3 space-y-1">
        <UTooltip v-for="a in actions" :key="a.label" :text="a.blocker ?? a.label" :disabled="!a.blocker">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition"
            :class="a.blocker ? 'cursor-not-allowed border-white/5 text-muted' : 'border-white/15 bg-white/5 hover:border-primary/60 hover:bg-white/10'"
            @click="run(a)"
          >
            <UIcon :name="a.icon" class="size-4 shrink-0" :class="a.blocker ? '' : 'text-primary'" />
            <span class="flex-1">{{ a.label }}</span>
            <span v-if="a.cost" class="flex gap-0.5">
              <span v-for="(n, r) in a.cost" :key="r" class="relative block size-5">
                <img :src="CARD_INFO[r as CardId].image" :alt="CARD_INFO[r as CardId].name" class="size-full object-contain">
                <span class="absolute -right-1 -bottom-1 text-[9px] font-bold">{{ n }}</span>
              </span>
            </span>
          </button>
        </UTooltip>
      </div>
      <div v-else-if="!mine" class="mt-2 text-xs text-dimmed">Gehört einem Mitspieler.</div>
    </div>
  </div>
</template>
