// In fullscreen Chrome and other Chromium browsers hand Esc to the game (it opens the menu);
// leaving fullscreen is then a long press on Esc. Firefox and Safari have no Keyboard Lock API:
// there Esc always leaves fullscreen (see BrowserNotice on the start page).
type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>, unlock?: () => void }

export default defineNuxtPlugin(() => {
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard
  if (typeof keyboard?.lock !== 'function') return

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) keyboard.lock?.(['Escape']).catch(() => {})
    else keyboard.unlock?.()
  })
})
