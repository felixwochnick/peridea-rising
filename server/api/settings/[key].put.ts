const MAX_SIZE = 32 * 1024

/** Stores a settings group unless the server already has a newer copy; returns the copy that is now stored. */
export default defineEventHandler(async (event) => {
  const { sql, userId, key } = await requireSettingsAccess(event)
  const body = await readBody<Partial<StoredSettings>>(event)
  if (!body?.value || typeof body.value !== 'object' || typeof body.updatedAt !== 'number') {
    throw createError({ statusCode: 400, statusMessage: 'Expected { value, updatedAt }' })
  }
  if (JSON.stringify(body.value).length > MAX_SIZE) throw createError({ statusCode: 413, statusMessage: 'Settings too large' })
  // a client clock far ahead would otherwise win every future conflict
  const updatedAt = new Date(Math.min(body.updatedAt, Date.now() + 60_000))

  await sql`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (${userId}, ${key}, ${sql.json(body.value as never)}, ${updatedAt})
    ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    WHERE user_settings.updated_at < EXCLUDED.updated_at
  `
  return await readSettings(sql, userId, key)
})
