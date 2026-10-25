// Commit to the future: take the round *after* the current one, so the result
// didn't exist yet when the roll was requested. Waits up to ~8 s for it to be published.
export default defineEventHandler(async () => {
  const latest = await fetchDrand('latest')
  const target = latest.round + 1
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    try {
      const beacon = await fetchDrand(target)
      return { ...beacon, requestedAtRound: latest.round, url: `${DRAND_BASE}/public/${target}` }
    }
    catch {
      await new Promise(r => setTimeout(r, 600))
    }
  }
  throw createError({ statusCode: 504, statusMessage: 'drand round not published in time' })
})
