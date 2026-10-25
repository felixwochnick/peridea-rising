/**
 * Fullscreen for the game. The whole page goes fullscreen (so Nuxt UI tooltips/modals,
 * which are portaled to <body>, keep working); the game layout hides its nav bar meanwhile.
 */
export function useGameFullscreen() {
  const isFullscreen = useState('gc-fullscreen', () => false)

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }

  /** Call once from a mounted component to keep `isFullscreen` in sync (also for Esc/F11). */
  function trackFullscreen() {
    const sync = () => { isFullscreen.value = !!document.fullscreenElement }
    onMounted(() => document.addEventListener('fullscreenchange', sync))
    onBeforeUnmount(() => document.removeEventListener('fullscreenchange', sync))
  }

  return { isFullscreen, toggleFullscreen, trackFullscreen }
}
