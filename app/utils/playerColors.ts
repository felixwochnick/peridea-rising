// Tailwind v4 *-400 palette as hex, so three.js can use the player colors.
export const PLAYER_COLOR_HEX: Record<string, string> = {
  rose: '#ff637e',
  red: '#ff6467',
  orange: '#ff8904',
  yellow: '#fdc700',
  green: '#05df72',
  emerald: '#00d492',
  cyan: '#00d3f2',
  sky: '#00bcff',
  blue: '#51a2ff',
  violet: '#a684ff',
  purple: '#c27aff',
  pink: '#fb64b6',
}

/** Accepts a Tailwind color name (e.g. "rose") or any CSS hex color. */
export function playerColorHex(color: string): string {
  return PLAYER_COLOR_HEX[color] ?? color
}
