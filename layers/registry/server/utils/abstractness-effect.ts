import type { AbstractnessParseResult, AbstractnessPayload, GenerationSkill } from './ai-generation-work'
import type { EmbeddingAiBinding } from './embedding-effect'
import { extractJson } from '#shared/server/anthropic'
import {
  ABSTRACTNESS_MODEL,
  abstractnessResponseText,
  buildAbstractnessUserPrompt,
  parseAbstractnessPayload,
} from './ai-generation-work'
import { ABSTRACTNESS_RESPONSE_FORMAT, ABSTRACTNESS_SYSTEM_PROMPT } from './ai-prompts'

type RejectionReason = Extract<AbstractnessParseResult, { _tag: 'error' }>['reason'] | 'empty_source'

export type AbstractnessEffectResult
  = | { _tag: 'classified', value: AbstractnessPayload }
    | { _tag: 'rejected', reason: RejectionReason }
    | { _tag: 'provider_failed', error: string }

// UTF-8 bytes bound the tokenizer's byte fallback too. Leave space for the
// system prompt, source context, and answer in the model's 24k token window.
const SECTION_BYTES = 16_000
const CONTEXT_BYTES = 2_000

function sourceSections(source: string): string[] {
  const bytes = new TextEncoder().encode(source)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const sections: string[] = []
  for (let start = 0; start < bytes.length;) {
    let end = Math.min(start + SECTION_BYTES, bytes.length)
    // A continuation byte belongs to the codepoint starting before it.
    while (end < bytes.length && (bytes[end]! & 0xC0) === 0x80)
      end--
    sections.push(decoder.decode(bytes.slice(start, end)))
    start = end
  }
  return sections
}

export async function classifyAbstractness(
  ai: EmbeddingAiBinding,
  skill: GenerationSkill,
): Promise<AbstractnessEffectResult> {
  if (!skill.renderedRaw.trim())
    return { _tag: 'rejected', reason: 'empty_source' }

  const sections = sourceSections(skill.renderedRaw)
  const bytes = new TextEncoder().encode(sections[0]!)
  // Ignore an incomplete final codepoint in this context excerpt. The complete
  // source remains in the sections below, including every Unicode character.
  const context = new TextDecoder().decode(bytes.slice(0, CONTEXT_BYTES), { stream: true })
  let first: AbstractnessPayload | undefined
  for (const [index, section] of sections.entries()) {
    const renderedRaw = sections.length === 1
      ? section
      : `Task context:\n${context}\n\nSource section ${index + 1} of ${sections.length}:\n${section}`
    const provider = await ai.run(ABSTRACTNESS_MODEL, {
      messages: [
        { role: 'system', content: ABSTRACTNESS_SYSTEM_PROMPT },
        { role: 'user', content: buildAbstractnessUserPrompt({ ...skill, renderedRaw }) },
      ],
      max_tokens: 256,
      temperature: 0,
      response_format: ABSTRACTNESS_RESPONSE_FORMAT,
    }).then(
      response => ({ _tag: 'response' as const, response }),
      error => ({ _tag: 'provider_failed' as const, error: error instanceof Error ? error.message : String(error) }),
    )
    if (provider._tag === 'provider_failed')
      return provider

    const parsed = parseAbstractnessPayload(extractJson(abstractnessResponseText(provider.response)))
    if (parsed._tag === 'error')
      return { _tag: 'rejected', reason: parsed.reason }
    if (parsed.value.kind === 'package-specific')
      return { _tag: 'classified', value: parsed.value }
    first ??= parsed.value
  }
  return { _tag: 'classified', value: first! }
}
