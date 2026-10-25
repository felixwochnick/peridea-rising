/** The account's stored copy of one settings group, or null. */
export default defineEventHandler(async (event) => {
  const { sql, userId, key } = await requireSettingsAccess(event)
  return await readSettings(sql, userId, key)
})
