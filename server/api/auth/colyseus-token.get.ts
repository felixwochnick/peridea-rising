import { SignJWT } from 'jose'

/** Short-lived token for the multiplayer server (verified there in GalacticRoom.onAuth). Only for SSO accounts. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  if (user.provider !== 'authentik') {
    throw createError({ statusCode: 403, statusMessage: 'Für den Multiplayer musst du per SSO angemeldet sein.' })
  }
  const secret = useRuntimeConfig(event).multiplayerSecret
  if (!secret && !import.meta.dev) throw createError({ statusCode: 500, statusMessage: 'NUXT_MULTIPLAYER_SECRET is not set' })
  const key = new TextEncoder().encode(secret || 'dev-only-multiplayer-secret-change-me')
  const token = await new SignJWT({ name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer('peridea-rising')
    .setAudience('multiplayer')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)
  return { token }
})
