/** The cursor drawn while the mouse is caught in fullscreen (see GameMouseTrap), in viewport pixels. */
const cursor = reactive({ locked: false, x: 0, y: 0 })

export function useVirtualCursor() {
  return cursor
}
