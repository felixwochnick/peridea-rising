/**
 * Multiplayer: sign in with Authentik. Configured via NUXT_OAUTH_AUTHENTIK_CLIENT_ID / _CLIENT_SECRET / _DOMAIN;
 * the redirect URI to register in Authentik is <app>/auth/authentik.
 */
export default defineOAuthAuthentikEventHandler({
  async onSuccess(event, { user }) {
    const account = {
      id: `authentik:${user.sub}`,
      name: user.name || user.preferred_username || user.nickname || 'Pilot',
      email: user.email,
      avatar: user.picture,
      provider: 'authentik' as const,
    }
    if (isDbConfigured()) {
      const sql = await useDb()
      await sql`
        INSERT INTO users (id, provider, name, email, avatar)
        VALUES (${account.id}, ${account.provider}, ${account.name}, ${account.email ?? null}, ${account.avatar ?? null})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, email = EXCLUDED.email, avatar = EXCLUDED.avatar, last_login_at = now()
      `
    }
    // replaces a guest session, if any
    await setUserSession(event, { user: account }, { maxAge: 60 * 60 * 24 * 30 })
    return sendRedirect(event, '/game-modes')
  },
  onError(event, error) {
    console.error('Authentik login failed:', error)
    return sendRedirect(event, '/login?error=sso')
  },
})
