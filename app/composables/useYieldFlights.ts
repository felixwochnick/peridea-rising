export interface YieldFlight {
  key: string
  resource: CardId
  playerId: string
  /** Start point in viewport pixels (projected planet position). */
  from: { x: number, y: number }
  /** DOM id of the landing element. */
  target: string
  delay: number
  /** Smaller icons for other players' gains. */
  small: boolean
}

/** Resource icons currently flying from a planet to their owner (1 icon = 1 resource). */
export function useYieldFlights() {
  return useState<YieldFlight[]>('gc-yield-flights', () => [])
}
