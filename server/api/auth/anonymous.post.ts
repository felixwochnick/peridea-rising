/** Solo: a guest session without an account (kept if the player already has one). */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (session.user) return session.user
  await setUserSession(event, {
    user: { id: `guest-${crypto.randomUUID()}`, name: 'Pilot', provider: 'anonymous' },
  })
  return (await getUserSession(event)).user
})
