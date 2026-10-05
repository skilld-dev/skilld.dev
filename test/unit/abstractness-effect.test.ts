import type { GenerationSkill } from '../../layers/registry/server/utils/ai-generation-work'
import { describe, expect, it, vi } from 'vitest'
import { classifyAbstractness } from '../../layers/registry/server/utils/abstractness-effect'

const skill: GenerationSkill = {
  owner: 'acme',
  repo: 'skills',
  name: 'review',
  currentSha: 'sha',
  renderedRaw: '# Review\nReview code for clear names.',
  displayName: null,
}
const abstract = { kind: 'abstract', package: null, category: 'code-review' }
const specific = { kind: 'package-specific', package: 'acme-cli', category: 'deployment' }

describe('abstractness classification', () => {
  it('classifies a short transferable Skill', async () => {
    const result = await classifyAbstractness({ run: async () => ({ response: abstract }) }, skill)
    expect(result).toEqual({ _tag: 'classified', value: abstract })
  })

  it('lets a prerequisite after the first section prevent abstract classification', async () => {
    const result = await classifyAbstractness({
      run: async (_model, input) => {
        const messages = input.messages as Array<{ content: string }>
        return { response: messages[1]!.content.includes('Requires acme-cli.') ? specific : abstract }
      },
    }, { ...skill, renderedRaw: `${'Review names.\n'.repeat(2_000)}Requires acme-cli.` })
    expect(result).toEqual({ _tag: 'classified', value: specific })
  })

  it('preserves Unicode across section boundaries', async () => {
    const seen: string[] = []
    const result = await classifyAbstractness({
      run: async (_model, input) => {
        const messages = input.messages as Array<{ content: string }>
        seen.push(messages[1]!.content)
        return { response: abstract }
      },
    }, { ...skill, renderedRaw: `${'界'.repeat(6_000)}末尾🦋` })
    expect(result).toEqual({ _tag: 'classified', value: abstract })
    expect(seen.join('')).not.toContain('\uFFFD')
    expect(seen.join('')).toContain('末尾🦋')
  })

  it('rejects invalid later output instead of using the first section result', async () => {
    const run = vi.fn().mockResolvedValueOnce({ response: abstract }).mockResolvedValueOnce({ response: {} })
    const result = await classifyAbstractness({ run }, { ...skill, renderedRaw: 'x'.repeat(20_000) })
    expect(result).toEqual({ _tag: 'rejected', reason: 'invalid_kind' })
  })

  it('reports later provider failures instead of persisting a partial result', async () => {
    const run = vi.fn().mockResolvedValueOnce({ response: abstract }).mockRejectedValueOnce(new Error('AI unavailable'))
    const result = await classifyAbstractness({ run }, { ...skill, renderedRaw: 'x'.repeat(20_000) })
    expect(result).toEqual({ _tag: 'provider_failed', error: 'AI unavailable' })
  })

  it('does not call the provider for empty source', async () => {
    const run = vi.fn()
    const result = await classifyAbstractness({ run }, { ...skill, renderedRaw: '  ' })
    expect(result).toEqual({ _tag: 'rejected', reason: 'empty_source' })
    expect(run).not.toHaveBeenCalled()
  })
})
