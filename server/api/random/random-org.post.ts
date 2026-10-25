// Signed dice from random.org (JSON-RPC v4). The user's API key is only passed through, never stored.
interface SignedIntegersResponse {
  result?: { random: { data: number[], serialNumber: number } & Record<string, unknown>, signature: string, bitsLeft: number }
  error?: { message: string }
}

export default defineEventHandler(async (event) => {
  const { apiKey, n = 2 } = await readBody<{ apiKey?: string, n?: number }>(event)
  if (!apiKey) throw createError({ statusCode: 400, statusMessage: 'random.org API key missing' })
  const res = await $fetch<SignedIntegersResponse>('https://api.random.org/json-rpc/4/invoke', {
    method: 'POST',
    timeout: 8000,
    body: {
      jsonrpc: '2.0',
      method: 'generateSignedIntegers',
      params: { apiKey, n: Math.min(Math.max(n, 1), 10), min: 1, max: 6, replacement: true },
      id: Date.now(),
    },
  })
  if (res.error || !res.result) throw createError({ statusCode: 502, statusMessage: res.error?.message ?? 'random.org error' })
  return {
    data: res.result.random.data,
    random: res.result.random,
    signature: res.result.signature,
    serialNumber: res.result.random.serialNumber,
    bitsLeft: res.result.bitsLeft,
  }
})
