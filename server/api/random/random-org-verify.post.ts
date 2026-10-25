// Asks random.org whether a signed result is authentic (no API key needed).
export default defineEventHandler(async (event) => {
  const { random, signature } = await readBody<{ random: unknown, signature: string }>(event)
  const res = await $fetch<{ result?: { authenticity: boolean }, error?: { message: string } }>('https://api.random.org/json-rpc/4/invoke', {
    method: 'POST',
    timeout: 8000,
    body: { jsonrpc: '2.0', method: 'verifySignature', params: { random, signature }, id: Date.now() },
  })
  if (res.error || !res.result) throw createError({ statusCode: 502, statusMessage: res.error?.message ?? 'random.org error' })
  return { authentic: res.result.authenticity }
})
