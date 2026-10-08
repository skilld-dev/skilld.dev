import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyRepositoryPurpose, decideRepositoryPurposeAdmission } from '../../layers/registry/server/utils/repository-purpose'

afterEach(() => vi.restoreAllMocks())

const evidence = {
  owner: 'vinta',
  repo: 'awesome-python',
  sourceCommit: 'a'.repeat(40),
  description: 'A directory of Python tools',
  readme: { path: 'README.md', content: '# Awesome Python\nCurated links to tools.' },
  treeComplete: true,
  fileCount: 40,
  skillCount: 3,
  paths: ['README.md', '.claude/skills/audit/SKILL.md'],
  skills: [{ path: '.claude/skills/audit/SKILL.md', content: 'Review links in this repository.' }],
}

function answer(purpose = 'directory', probability = 0.99) {
  return { model: 'jev-1.13.0', answers: {
    purpose: { type: 'choice', choice: purpose, confidence: probability, probabilities: {
      'skill-pack': purpose === 'skill-pack' ? probability : 0,
      'software': purpose === 'software' ? probability : 0,
      'directory': purpose === 'directory' ? probability : 0,
      'mirror': purpose === 'mirror' ? probability : 0,
      'uncertain': purpose === 'uncertain' ? probability : 1 - probability,
    } },
  } }
}

describe('repository purpose', () => {
  it('reads a completed Workers AI binding result', async () => {
    const result = await classifyRepositoryPurpose(evidence, async () => ({ state: 'Completed', result: answer() }))
    expect(result).toMatchObject({ _tag: 'classified', purpose: 'directory', model: 'jev-1.13.0' })
  })

  it('rejects an incomplete Workers AI binding result', async () => {
    expect(await classifyRepositoryPurpose(evidence, async () => ({ state: 'Pending', result: answer() })))
      .toEqual({ _tag: 'rejected', reason: 'invalid_answer' })
  })

  it('identifies a directory with only three incidental Skills', async () => {
    const result = await classifyRepositoryPurpose(evidence, async () => answer())
    expect(result).toMatchObject({ _tag: 'classified', purpose: 'directory', probability: 0.99, model: 'jev-1.13.0', sourceCommit: evidence.sourceCommit })
  })

  it.each(['software', 'skill-pack', 'mirror'] as const)('keeps %s separate from directory volume', async (purpose) => {
    const result = await classifyRepositoryPurpose({ ...evidence, skillCount: 400 }, async () => answer(purpose))
    expect(result).toMatchObject({ _tag: 'classified', purpose })
  })

  it('keeps a low-probability finding uncertain', async () => {
    const result = await classifyRepositoryPurpose(evidence, async () => answer('directory', 0.55))
    expect(result).toMatchObject({ _tag: 'classified', purpose: 'uncertain', reason: 'Low probability requires human review.' })
  })

  it('records missing purpose evidence without calling the model', async () => {
    const judge = vi.fn()
    const result = await classifyRepositoryPurpose({ ...evidence, description: null, readme: null, skills: [] }, judge)
    expect(result).toMatchObject({ _tag: 'classified', purpose: 'uncertain', reason: 'Repository purpose evidence is missing.' })
    expect(judge).not.toHaveBeenCalled()
  })

  it('rejects an invalid provider answer', async () => {
    expect(await classifyRepositoryPurpose(evidence, async () => ({ model: 'jev', answers: { purpose: { choice: 'directory' } } })))
      .toMatchObject({ _tag: 'rejected', reason: 'invalid_answer' })
  })

  it('propagates provider failures so the queue can retry', async () => {
    await expect(classifyRepositoryPurpose(evidence, async () => {
      throw new Error('Provider unavailable')
    }))
      .rejects
      .toThrow('Provider unavailable')
  })
})

describe('purpose admission', () => {
  it.each(['directory', 'mirror', 'uncertain'] as const)('holds new %s repositories without changing human admission', (purpose) => {
    expect(decideRepositoryPurposeAdmission({ purpose, hasStoredSkills: false, humanEligible: false, ownerVerified: false }))
      .toEqual({ _tag: 'held', reason: 'repository_purpose_review_required' })
  })

  it.each(['software', 'skill-pack'] as const)('lets %s continue through the existing admission rules', (purpose) => {
    expect(decideRepositoryPurposeAdmission({ purpose, hasStoredSkills: false, humanEligible: false, ownerVerified: false }))
      .toEqual({ _tag: 'continue' })
  })

  it.each(['hasStoredSkills', 'humanEligible', 'ownerVerified'] as const)('preserves %s source recovery', (signal) => {
    expect(decideRepositoryPurposeAdmission({ purpose: 'directory', hasStoredSkills: false, humanEligible: false, ownerVerified: false, [signal]: true }))
      .toEqual({ _tag: 'continue' })
  })
})
