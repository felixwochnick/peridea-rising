// HUD size class from the viewport (CSS px, i.e. after display scaling):
// - compact: phones / tablets / small windows → Catan-Universe-style mobile layout
// - medium:  laptops (e.g. MacBook Pro default scaling)
// - large:   big monitors without scaling (e.g. WQHD)
export type HudSize = 'compact' | 'medium' | 'large'

const COMPACT = '(max-width: 1279px), (max-height: 640px)'
const LARGE = '(min-width: 1920px) and (min-height: 1000px)'

export function useHudLayout() {
  const size = useState<HudSize>('gc-hud-size', () => 'medium')
  const touch = useState('gc-touch', () => false)

  if (import.meta.client && !useState('gc-hud-watch').value) {
    useState('gc-hud-watch').value = true
    const compact = window.matchMedia(COMPACT)
    const large = window.matchMedia(LARGE)
    const update = () => { size.value = compact.matches ? 'compact' : large.matches ? 'large' : 'medium' }
    compact.addEventListener('change', update)
    large.addEventListener('change', update)
    update()
    touch.value = window.matchMedia('(pointer: coarse)').matches
  }

  return {
    size,
    compact: computed(() => size.value === 'compact'),
    large: computed(() => size.value === 'large'),
    /** Touch device: no keyboard hints, no edge scrolling. */
    touch,
  }
}
