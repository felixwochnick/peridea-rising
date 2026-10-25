// Players authenticate with a short-lived token from the Nuxt app (/api/auth/colyseus-token),
// signed with the shared secret NUXT_MULTIPLAYER_SECRET.
import { jwtVerify } from 'jose'

export const TOKEN_ISSUER = 'star-wars-catan'
export const TOKEN_AUDIENCE = 'multiplayer'

const secret = process.env.NUXT_MULTIPLAYER_SECRET
if (!secret && process.env.NODE_ENV === 'production') throw new Error('NUXT_MULTIPLAYER_SECRET is not set')
if (!secret) console.warn('[auth] NUXT_MULTIPLAYER_SECRET not set – using the development secret')
const key = new TextEncoder().encode(secret || 'dev-only-multiplayer-secret-change-me')

export interface PlayerAuth {
  id: string
  name: string
}

export async function verifyPlayerToken(token: string): Promise<PlayerAuth> {
  const { payload } = await jwtVerify(token, key, { issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE })
  if (!payload.sub) throw new Error('token without subject')
  return { id: payload.sub, name: String(payload.name ?? 'Pilot').slice(0, 40) }
}
