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

const report = { _tag: 'Unavailable', reason: 'The published harness does not return usage reports.', warnings: [] }
const output = {
  _tag: 'Ok',
  files: input.currentSkill,
  generation: report,
  reviewReport: report,
  review: { summary: 'Fine', findings: [] },
  sourceAttempts: [],
  elapsedMs: 100,
}

describe('untrusted sandbox output', () => {
  it('preserves explicitly unavailable usage instead of inventing zero counts', () => {
    expect(parseProofResult(output)).toEqual({ _tag: 'Ok', value: output })
  })

  it('rejects output paths outside the Skill', () => {
    expect(parseProofResult({ ...output, files: [{ path: '../README.md', content: 'overwrite' }] })._tag).toBe('Err')
  })
})
