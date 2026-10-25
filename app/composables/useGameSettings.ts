export type GraphicsQuality = 'low' | 'medium' | 'high' | 'extreme'

/** Render budget per quality level: frame rate cap, pixel ratio (capped at the display's), antialiasing, HUD blur. */
export const GRAPHICS: Record<GraphicsQuality, { label: string, description: string, fps: number, dpr: number | [number, number], antialias: boolean, blur: boolean }> = {
  low: { label: 'Niedrig', description: '30 Bilder/s, normale Auflösung – leise und akkuschonend', fps: 30, dpr: 1, antialias: false, blur: false },
  medium: { label: 'Mittel', description: '60 Bilder/s, 1,5-fache Auflösung', fps: 60, dpr: [1, 1.5], antialias: true, blur: false },
  high: { label: 'Hoch', description: '60 Bilder/s, 1,75-fache Auflösung – scharf', fps: 60, dpr: [1, 1.75], antialias: true, blur: false },
  extreme: { label: 'Extrem', description: 'Unbegrenzte Bildrate, volle Retina-Auflösung, Glaseffekte – braucht viel Leistung', fps: Infinity, dpr: [1, 2], antialias: true, blur: true },
}

/** Names used before the four levels existed. */
const LEGACY_QUALITY: Record<string, GraphicsQuality> = { eco: 'low', balanced: 'high', high: 'extreme' }

export interface GameSettings {
  /** Rendering budget (see GRAPHICS). */
  quality: GraphicsQuality
  /** Move the camera when the mouse touches the screen edge. */
  edgeScroll: boolean
  /** Multiplier for edge/keyboard scrolling. */
  scrollSpeed: number
  /** Shorten dice and resource animations. */
  reduceMotion: boolean
  /** Switch to fullscreen when a game is started from the lobby. */
  fullscreenOnStart: boolean
  /** Keep the mouse inside the window while in fullscreen (pointer lock + own cursor). */
  mouseTrap: boolean
}

const STORAGE_KEY = 'gc-settings'
const DEFAULTS: GameSettings = { quality: 'high', edgeScroll: true, scrollSpeed: 1, reduceMotion: false, fullscreenOnStart: true, mouseTrap: false }

function normalize(stored: Partial<GameSettings>): GameSettings {
  const settings = { ...DEFAULTS, ...stored }
  if (!(settings.quality in GRAPHICS)) settings.quality = LEGACY_QUALITY[settings.quality] ?? DEFAULTS.quality
  return settings
}

/** Player options: in this browser and, for SSO accounts, in the database (see useSyncedSettings). */
export function useGameSettings() {
  const settings = useSyncedSettings(STORAGE_KEY, () => ({ ...DEFAULTS }), { normalize })

  /** User setting or OS-level "reduce motion". */
  const reduceMotion = computed(() =>
    settings.value.reduceMotion || (import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches))

  const graphics = computed(() => GRAPHICS[settings.value.quality] ?? GRAPHICS.high)

  return { settings, reduceMotion, graphics, DEFAULTS }
}
