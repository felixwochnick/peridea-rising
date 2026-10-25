import type { H3Event } from 'h3'

export interface StoredSettings {
  value: unknown
  /** ms since epoch, set by the client that made the change (last write wins). */
  updatedAt: number
}

/** Settings are kept per SSO account; guests only have their browser's copy. */
export async function requireSettingsAccess(event: H3Event) {
  const { user } = await requireUserSession(event)
  if (user.provider !== 'authentik') throw createError({ statusCode: 403, statusMessage: 'Settings sync needs an SSO account' })
  if (!isDbConfigured()) throw createError({ statusCode: 503, statusMessage: 'No database configured' })
  const key = getRouterParam(event, 'key') ?? ''
  if (!/^[a-z0-9-]{1,64}$/.test(key)) throw createError({ statusCode: 400, statusMessage: 'Invalid settings key' })
  return { userId: user.id, key, sql: await useDb() }
}

export async function readSettings(sql: Sql, userId: string, key: string): Promise<StoredSettings | null> {
  const [row] = await sql<{ value: unknown, updated_at: Date }[]>`
    SELECT value, updated_at FROM user_settings WHERE user_id = ${userId} AND key = ${key}
  `
  return row ? { value: row.value, updatedAt: row.updated_at.getTime() } : null
}
