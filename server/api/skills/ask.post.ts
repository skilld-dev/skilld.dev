import type { AskSkillPrompt } from '#server/utils/ask-skill-search'
import type { AskSkillResult } from '#shared/ask-skill-search'
import {
  ASK_SKILL_MODEL,
  createAskSkillStream,
  parseRegistrySearchResults,
} from '#server/utils/ask-skill-search'
import { ASK_SKILL_RESULT_LIMIT, AskSkillsRequestSchema } from '#shared/ask-skill-search'
import { defineApiHandler } from '#shared/server/handler'

interface AskAiBinding {
  run: (
    model: string,
    input: {
      messages: Array<{ role: 'system' | 'user', content: string }>
      max_tokens: number
      stream: true
      temperature: number
    },
  ) => Promise<ReadableStream<Uint8Array>>
}

export default defineApiHandler({
  schema: AskSkillsRequestSchema,
  handler: async ({ event, body, platform }) => {
    const search = await event.$fetch<unknown>('/api/skills', {
      method: 'GET',
      query: { q: body.query, limit: ASK_SKILL_RESULT_LIMIT },
    })
      .then(data => ({ _tag: 'ok' as const, data }))
      .catch(error => ({ _tag: 'error' as const, error }))

    if (search._tag === 'error') {
      console.warn('[ask-skills] registry search failed', search.error)
      throw createError({
        statusCode: 502,
        statusMessage: 'Registry search unavailable',
        message: 'Could not search the skill registry.',
      })
    }

    const parsed = parseRegistrySearchResults(search.data)
    if (parsed._tag === 'error') {
      console.warn('[ask-skills] registry response invalid', parsed.message)
      throw createError({
        statusCode: 502,
        statusMessage: 'Registry search unavailable',
        message: parsed.message,
      })
    }

    setResponseHeaders(event, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })

    const ai = platform.ai as unknown as AskAiBinding

    return createAskSkillStream({
      query: body.query,
      items: parsed.data satisfies AskSkillResult[],
      generate: (prompt: AskSkillPrompt) => ai.run(ASK_SKILL_MODEL, {
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        max_tokens: 180,
        stream: true,
        temperature: 0.1,
      }),
      warn: (message, error) => console.warn(message, error),
    })
  },
})
