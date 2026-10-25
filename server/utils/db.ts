// PostgreSQL via postgres.js. Configured with POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
// (optional POSTGRES_PORT, default 5432). The schema is migrated on startup (server/plugins/database.ts).
import postgres from 'postgres'
import { migrations } from '../db/migrations'

export type Sql = postgres.Sql

/** Arbitrary, fixed key: only one instance migrates at a time. */
const MIGRATION_LOCK = 4_242_001

let sql: Sql | null = null
let ready: Promise<Sql> | null = null

export function isDbConfigured() {
  return !!process.env.POSTGRES_HOST
}

function connect(): Sql {
  const env = process.env
  if (!env.POSTGRES_HOST) throw new Error('POSTGRES_HOST is not set')
  return postgres({
    host: env.POSTGRES_HOST,
    port: Number(env.POSTGRES_PORT ?? 5432),
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
    onnotice: () => {},
  })
}

async function migrate(db: Sql) {
  await db.begin(async (tx) => {
    // held until the end of the transaction
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `
    const applied = new Set((await tx<{ id: string }[]>`SELECT id FROM schema_migrations`).map(r => r.id))
    for (const m of migrations) {
      if (applied.has(m.id)) continue
      await tx.unsafe(m.sql)
      await tx`INSERT INTO schema_migrations (id) VALUES (${m.id})`
      console.log(`[db] applied migration ${m.id}`)
    }
  })
}

/** Connects and migrates once; every caller waits until the schema is up to date. */
export function initDb(): Promise<Sql> {
  ready ??= (async () => {
    sql = connect()
    await migrate(sql)
    return sql
  })()
  return ready
}

export function useDb(): Promise<Sql> {
  return initDb()
}

export async function closeDb() {
  await sql?.end({ timeout: 5 })
}
