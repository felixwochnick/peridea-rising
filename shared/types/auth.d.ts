declare module '#auth-utils' {
  interface User {
    /** `guest-<uuid>` for solo players, `authentik:<sub>` for SSO accounts. */
    id: string
    name: string
    email?: string
    avatar?: string
    /** Solo players are anonymous; multiplayer needs an SSO account. */
    provider: 'anonymous' | 'authentik'
  }
}

export {}
