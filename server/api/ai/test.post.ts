// Checks an AI provider API key by listing its models. The key is only passed through, never stored.
type Provider = 'gemini' | 'claude' | 'openai'

export default defineEventHandler(async (event) => {
  const { provider, apiKey } = await readBody<{ provider: Provider, apiKey: string }>(event)
  if (!apiKey) throw createError({ statusCode: 400, statusMessage: 'API-Schlüssel fehlt' })

  try {
    if (provider === 'claude') {
      const res = await $fetch<{ data: { id: string }[] }>('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        query: { limit: 100 },
        timeout: 10000,
      })
      return { ok: true, models: res.data.map(m => m.id) }
    }
    if (provider === 'openai') {
      const res = await $fetch<{ data: { id: string }[] }>('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      })
      // chat-capable families only
      const models = res.data.map(m => m.id).filter(id => /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding)/.test(id))
      return { ok: true, models: models.sort().reverse() }
    }
    if (provider === 'gemini') {
      const res = await $fetch<{ models: { name: string, supportedGenerationMethods?: string[] }[] }>('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': apiKey },
        query: { pageSize: 200 },
        timeout: 10000,
      })
      const models = res.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('gemini'))
        .map(m => m.name.replace(/^models\//, ''))
      return { ok: true, models }
    }
  }
  catch (e: unknown) {
    const err = e as { response?: { status?: number }, statusCode?: number }
    const status = err?.response?.status ?? err?.statusCode ?? 502
    const message = status === 401 || status === 403 || status === 400 ? 'Schlüssel ungültig oder ohne Berechtigung' : `Anbieter nicht erreichbar (${status})`
    throw createError({ statusCode: status === 400 ? 401 : status, statusMessage: message })
  }
  throw createError({ statusCode: 400, statusMessage: 'Unbekannter Anbieter' })
})
