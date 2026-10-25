import type { ImprovementTrack } from './resources'

// Städte & Ritter progress cards (Catan: Fortschrittskarten), 3 decks à 18 cards.
// Drawn when the event die shows a gate and the red die is ≤ improvement level + 1.

export type ProgressKind =
  // Wissenschaft (green)
  | 'alchemist' | 'inventor' | 'crane' | 'engineer' | 'irrigation' | 'medicine' | 'mining' | 'printer' | 'roadBuilding' | 'smith'
  // Handel (yellow)
  | 'commercialHarbor' | 'masterMerchant' | 'merchant' | 'merchantFleet' | 'resourceMonopoly' | 'tradeMonopoly'
  // Politik (blue)
  | 'bishop' | 'constitution' | 'deserter' | 'diplomat' | 'intrigue' | 'saboteur' | 'spy' | 'warlord' | 'wedding'

/** What a card needs from the player before it can be played. */
export type ProgressInput =
  | 'none' | 'dice' | 'resource' | 'commodity' | 'card' | 'player' | 'playerCards' | 'playerProgress'
  | 'tiles2' | 'tile' | 'ownCity' | 'ownOutpost' | 'ownKnights' | 'knightCorner' | 'edge' | 'enemyKnight' | 'pirates'

export interface ProgressDef {
  name: string
  /** Catan equivalent */
  catan: string
  track: ImprovementTrack
  count: number
  description: string
  icon: string
  input: ProgressInput
  /** Victory point card: revealed immediately when drawn. */
  victory?: boolean
  /** Only before rolling (Catan: Alchemist). */
  beforeRoll?: boolean
}

export const PROGRESS: Record<ProgressKind, ProgressDef> = {
  // --- Wissenschaft ---
  alchemist: { name: 'Wahrscheinlichkeitsdroide', catan: 'Alchemist', track: 'science', count: 2, icon: 'i-lucide-dices', input: 'dice', beforeRoll: true, description: 'Vor dem Würfeln: Du bestimmst die Augen der beiden Produktionswürfel. Der Ereigniswürfel wird normal geworfen.' },
  inventor: { name: 'Hyperraum-Kartograf', catan: 'Erfinder', track: 'science', count: 2, icon: 'i-lucide-arrow-left-right', input: 'tiles2', description: 'Tausche die Zahlen zweier Systeme (nicht 2, 12, 6 oder 8).' },
  crane: { name: 'Montagedroiden', catan: 'Kran', track: 'science', count: 2, icon: 'i-lucide-construction', input: 'none', description: 'Dein nächster Stadtausbau in diesem Zug kostet 1 Ware weniger.' },
  engineer: { name: 'Schildtechniker', catan: 'Ingenieur', track: 'science', count: 1, icon: 'i-lucide-shield-plus', input: 'ownCity', description: 'Baue kostenlos einen Schildgenerator an einer deiner Städte.' },
  irrigation: { name: 'Feuchtfarmen', catan: 'Bewässerung', track: 'science', count: 2, icon: 'i-lucide-droplets', input: 'none', description: 'Du erhältst 2 Nahrung für jede Agrarwelt an deinen Docks.' },
  medicine: { name: 'Bacta-Tanks', catan: 'Medizin', track: 'science', count: 2, icon: 'i-lucide-heart-pulse', input: 'ownOutpost', description: 'Baue einen Außenposten für nur 2 Durastahl + 1 Nahrung zur Stadt aus.' },
  mining: { name: 'Tiefbau-Droiden', catan: 'Bergbau', track: 'science', count: 2, icon: 'i-lucide-pickaxe', input: 'none', description: 'Du erhältst 2 Durastahl für jedes Asteroidenfeld an deinen Docks.' },
  printer: { name: 'Holonet-Archiv', catan: 'Buchdruck', track: 'science', count: 1, icon: 'i-lucide-crown', input: 'none', victory: true, description: '1 Siegpunkt – wird sofort aufgedeckt.' },
  roadBuilding: { name: 'Navigationsdaten', catan: 'Straßenbau', track: 'science', count: 2, icon: 'i-lucide-route', input: 'none', description: 'Baue sofort 2 Hyperraumrouten kostenlos.' },
  smith: { name: 'Werftaufrüstung', catan: 'Schmied', track: 'science', count: 2, icon: 'i-lucide-chevrons-up', input: 'ownKnights', description: 'Baue bis zu 2 deiner Flotten kostenlos eine Stufe aus.' },
  // --- Handel ---
  commercialHarbor: { name: 'Freihafen', catan: 'Handelshafen', track: 'trade', count: 2, icon: 'i-lucide-anchor', input: 'none', description: 'Jeder Mitspieler mit Waren muss dir 1 Ware geben und bekommt dafür 1 Rohstoff von dir.' },
  masterMerchant: { name: 'Handelsfürst', catan: 'Handelsmeister', track: 'trade', count: 2, icon: 'i-lucide-hand-coins', input: 'playerCards', description: 'Sieh dir die Hand eines Spielers mit mehr Siegpunkten an und nimm dir 2 Karten.' },
  merchant: { name: 'Handelskonvoi', catan: 'Händler', track: 'trade', count: 6, icon: 'i-lucide-ship', input: 'tile', description: 'Setze den Konvoi an ein System neben deinen Docks: dessen Rohstoff tauschst du 2:1. Solange er dir gehört: +1 SP.' },
  merchantFleet: { name: 'Frachterflotte', catan: 'Handelsflotte', track: 'trade', count: 2, icon: 'i-lucide-container', input: 'card', description: 'In diesem Zug tauschst du eine Kartensorte deiner Wahl 2:1 mit der Bank.' },
  resourceMonopoly: { name: 'Rohstoffkartell', catan: 'Rohstoffmonopol', track: 'trade', count: 4, icon: 'i-lucide-ban', input: 'resource', description: 'Nenne einen Rohstoff: jeder Mitspieler gibt dir bis zu 2 davon.' },
  tradeMonopoly: { name: 'Handelskartell', catan: 'Handelsmonopol', track: 'trade', count: 2, icon: 'i-lucide-gem', input: 'commodity', description: 'Nenne eine Ware: jeder Mitspieler gibt dir 1 davon.' },
  // --- Politik ---
  bishop: { name: 'Inquisitor', catan: 'Bischof', track: 'politics', count: 2, icon: 'i-lucide-eye', input: 'pirates', description: 'Versetze die Piraten und stiehl jedem Spieler an diesem System 1 Karte.' },
  constitution: { name: 'Neue Verfassung', catan: 'Verfassung', track: 'politics', count: 1, icon: 'i-lucide-crown', input: 'none', victory: true, description: '1 Siegpunkt – wird sofort aufgedeckt.' },
  deserter: { name: 'Überläufer', catan: 'Deserteur', track: 'politics', count: 2, icon: 'i-lucide-user-x', input: 'knightCorner', description: 'Ein Mitspieler verliert eine Flotte – du stellst eine gleich starke kostenlos an deinen Routen auf.' },
  diplomat: { name: 'Diplomat', catan: 'Diplomat', track: 'politics', count: 2, icon: 'i-lucide-scissors', input: 'edge', description: 'Entferne eine offene Route (ein Ende ohne Anschluss). Ist es deine, darfst du sie neu setzen.' },
  intrigue: { name: 'Intrige', catan: 'Intrige', track: 'politics', count: 2, icon: 'i-lucide-swords', input: 'enemyKnight', description: 'Verdränge eine gegnerische Flotte, die an deinen Routen steht.' },
  saboteur: { name: 'Saboteur', catan: 'Saboteur', track: 'politics', count: 2, icon: 'i-lucide-bomb', input: 'none', description: 'Jeder Mitspieler mit mindestens so vielen Siegpunkten wie du wirft die Hälfte seiner Karten ab.' },
  spy: { name: 'Spion', catan: 'Spion', track: 'politics', count: 3, icon: 'i-lucide-scan-eye', input: 'playerProgress', description: 'Sieh dir die Fortschrittskarten eines Mitspielers an und nimm dir eine.' },
  warlord: { name: 'Großadmiral', catan: 'Kriegsherr', track: 'politics', count: 2, icon: 'i-lucide-zap', input: 'none', description: 'Aktiviere alle deine Flotten kostenlos.' },
  wedding: { name: 'Allianz', catan: 'Hochzeit', track: 'politics', count: 2, icon: 'i-lucide-handshake', input: 'none', description: 'Jeder Mitspieler mit mehr Siegpunkten gibt dir 2 Karten.' },
}

export interface ProgressCard {
  id: number
  kind: ProgressKind
}

/** Progress cards in hand (Catan: 4; victory point cards don't count, they are revealed). */
export const PROGRESS_HAND_LIMIT = 4

let seq = 0
export function newProgressDecks(): Record<ImprovementTrack, ProgressCard[]> {
  const decks = { science: [], trade: [], politics: [] } as Record<ImprovementTrack, ProgressCard[]>
  for (const kind of Object.keys(PROGRESS) as ProgressKind[]) {
    const def = PROGRESS[kind]
    for (let i = 0; i < def.count; i++) decks[def.track].push({ id: ++seq + Math.floor(Math.random() * 1e6) * 100, kind })
  }
  for (const t of Object.keys(decks) as ImprovementTrack[]) {
    const d = decks[t]
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[d[i], d[j]] = [d[j]!, d[i]!]
    }
  }
  return decks
}

/** Catan: draw on a gate of this track if level ≥ 1 and red die ≤ level + 1. */
export const drawsProgress = (level: number, red: number) => level >= 1 && red <= level + 1
