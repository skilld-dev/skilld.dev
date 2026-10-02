import { describe, expect, it } from 'vitest'
import { parseProofInput, parseProofResult } from '../src/contracts'

const input = {
  spec: 'nuxt-ai-ready@2.4.1',
  name: 'nuxt-ai-ready',
  currentSkill: [{ path: 'SKILL.md', content: '---\nname: nuxt-ai-ready\ndescription: Use Nuxt.\n---\n' }],
}

describe('hosted proof input', () => {
  it('accepts an exact npm version and an existing Skill', () => {
    expect(parseProofInput(input)).toEqual({ _tag: 'Ok', value: input })
  })

  it.each(['nuxt-ai-ready', 'nuxt-ai-ready@latest', 'nuxt-ai-ready@^2.4.1', 'https://example.com/pkg.tgz'])('rejects mutable package input %s', (spec) => {
    expect(parseProofInput({ ...input, spec })._tag).toBe('Err')
  })

  it.each(['../SKILL.md', '/etc/passwd', 'references/../../SKILL.md', 'references\\file.md', '.env', 'references/file.sh'])('rejects baseline path %s', (path) => {
    expect(parseProofInput({ ...input, currentSkill: [{ path, content: 'content' }] })._tag).toBe('Err')
  })

  it('rejects duplicate baseline paths', () => {
    expect(parseProofInput({ ...input, currentSkill: [...input.currentSkill, ...input.currentSkill] })._tag).toBe('Err')
  })

  it('rejects baseline data without SKILL.md', () => {
    expect(parseProofInput({ ...input, currentSkill: [{ path: 'references/api.md', content: 'API' }] })._tag).toBe('Err')
  })
})

describe('untrusted sandbox output', () => {
  it('rejects output paths outside the Skill', () => {
    expect(parseProofResult({
      _tag: 'Ok',
      files: [{ path: '../README.md', content: 'overwrite' }],
      generation: { usage: {}, steps: 1, warnings: [] },
      review: { summary: 'Fine', findings: [] },
      elapsedMs: 100,
    })._tag).toBe('Err')
  })
})
