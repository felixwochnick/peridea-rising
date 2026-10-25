// Schema migrations, applied in order on startup (server/plugins/database.ts).
// Never change or remove a migration that has been released – add a new one instead.

export interface Migration {
  /** Unique and sortable: `<number>_<name>`. */
  id: string
  sql: string
}

export const migrations: Migration[] = [
  {
    id: '0001_users',
    sql: `
      CREATE TABLE users (
        id            text PRIMARY KEY,
        provider      text NOT NULL,
        name          text NOT NULL,
        email         text,
        avatar        text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: '0002_user_settings',
    sql: `
      CREATE TABLE user_settings (
        user_id    text NOT NULL,
        key        text NOT NULL,
        value      jsonb NOT NULL,
        updated_at timestamptz NOT NULL,
        PRIMARY KEY (user_id, key)
      );
    `,
  },
]
