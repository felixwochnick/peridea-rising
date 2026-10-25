// Creates / migrates the database schema when the server starts (see server/utils/db.ts).
export default defineNitroPlugin((nitroApp) => {
  // the build prerenders without a database
  if (import.meta.prerender) return
  if (!isDbConfigured()) {
    if (!import.meta.dev) throw new Error('POSTGRES_HOST is not set')
    console.warn('[db] POSTGRES_HOST not set – running without a database')
    return
  }
  initDb().catch((error) => {
    console.error('[db] migration failed:', error)
    // let the container restart instead of serving with an outdated schema
    if (!import.meta.dev) process.exit(1)
  })
  nitroApp.hooks.hook('close', closeDb)
})
