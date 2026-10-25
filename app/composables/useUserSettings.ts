export type AiProvider = 'gemini' | 'claude' | 'openai'

export interface AiAccount {
  apiKey: string
  model: string
  /** Models offered by the key, from the last successful connection test. */
  models: string[]
  connectedAt: string | null
}

export interface UserSettings {
  randomSource: RandomSource
  randomOrgApiKey: string
  ai: Record<AiProvider, AiAccount>
}

const STORAGE_KEY = 'sw-user-settings'
const emptyAccount = (): AiAccount => ({ apiKey: '', model: '', models: [], connectedAt: null })
const defaults = (): UserSettings => ({
  randomSource: 'drand',
  randomOrgApiKey: '',
  ai: { gemini: emptyAccount(), claude: emptyAccount(), openai: emptyAccount() },
})

export const AI_PROVIDERS: Record<AiProvider, { name: string, icon: string, keyUrl: string, playerType: string }> = {
  gemini: { name: 'Gemini', icon: 'i-simple-icons-googlegemini', keyUrl: 'https://aistudio.google.com/apikey', playerType: 'ai-gemini' },
  claude: { name: 'Claude', icon: 'i-simple-icons-anthropic', keyUrl: 'https://console.anthropic.com/settings/keys', playerType: 'ai-claude' },
  openai: { name: 'GPT', icon: 'i-simple-icons-openai', keyUrl: 'https://platform.openai.com/api-keys', playerType: 'ai-gpt' },
}

export const RANDOM_SOURCES: Record<RandomSource, { name: string, icon: string, description: string, verifiable: boolean }> = {
  'local': {
    name: 'Lokal',
    icon: 'i-lucide-cpu',
    description: 'Kryptografischer Zufall des Browsers (crypto.getRandomValues). Schnell, aber für andere nicht nachprüfbar.',
    verifiable: false,
  },
  'drand': {
    name: 'drand (League of Entropy)',
    icon: 'i-lucide-globe',
    description: 'Öffentlicher Zufalls-Beacon. Jeder Wurf nutzt eine Runde, die beim Würfeln noch nicht existierte – jeder kann ihn nachrechnen. Kein Schlüssel nötig.',
    verifiable: true,
  },
  'random-org': {
    name: 'random.org (signiert)',
    icon: 'i-lucide-badge-check',
    description: 'Atmosphärisches Rauschen, von random.org signiert und dort überprüfbar. Benötigt einen kostenlosen API-Schlüssel.',
    verifiable: true,
  },
}

/** API keys stay in this browser (they only go to the provider), everything else is synced to the account. */
function withoutKeys(s: UserSettings) {
  const { randomOrgApiKey: _, ...rest } = s
  const ai = Object.fromEntries(Object.entries(s.ai).map(([p, { apiKey: _key, ...account }]) => [p, account]))
  return { ...rest, ai }
}

function normalize(stored: Partial<UserSettings>): UserSettings {
  const d = defaults()
  const ai = Object.fromEntries((Object.keys(d.ai) as AiProvider[]).map(p => [p, { ...d.ai[p], ...stored.ai?.[p] }])) as Record<AiProvider, AiAccount>
  return { ...d, ...stored, ai }
}

/** Server copy (no keys) + this browser's keys. */
function withLocalKeys(remote: Partial<UserSettings>, local: UserSettings): UserSettings {
  const next = normalize({ ...remote, randomOrgApiKey: local.randomOrgApiKey })
  for (const p of Object.keys(next.ai) as AiProvider[]) next.ai[p].apiKey = local.ai[p].apiKey
  return next
}

/** Per-user settings: in this browser and, for SSO accounts, in the database (see useSyncedSettings). */
export function useUserSettings() {
  const settings = useSyncedSettings(STORAGE_KEY, defaults, { normalize, toRemote: withoutKeys, fromRemote: withLocalKeys })

  const isConnected = (p: AiProvider) => !!settings.value.ai[p].connectedAt && !!settings.value.ai[p].apiKey

  return { settings, isConnected }
}
