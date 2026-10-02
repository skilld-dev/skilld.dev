import { describe, expect, it, vi } from 'vitest'
import { runGeneration } from '../runner/orchestrate'

const generated = { _tag: 'Ok' as const, value: { outputDir: '/skills/package', files: [{ path: 'SKILL.md', bytes: 32 }], warnings: [], sourceAttempts: [{ source: 'pinned-package', status: 'used' as const }] } }
const clean = { _tag: 'Ok' as const, value: { summary: 'Checked against source.', findings: [] } }
const error = { level: 'error' as const, path: 'SKILL.md', message: 'Missing import.', fix: 'Add the verified import.' }
const rejected = { _tag: 'Ok' as const, value: { summary: 'Import required.', findings: [error] } }
const files = [{ path: 'SKILL.md', content: 'checked Skill' }]

describe('generation and review', () => {
  it('repairs once from review findings, then runs a fresh review', async () => {
    const generate = vi.fn(async () => generated)
    const review = vi.fn().mockResolvedValueOnce(rejected).mockResolvedValueOnce(clean)
    const result = await runGeneration({ generate, review, readFiles: async () => files })
    expect(result).toMatchObject({ _tag: 'Ok' as const, files, repairAttempts: 1 })
    expect(generate.mock.calls).toEqual([[[]], [[error]]])
    expect(review.mock.calls).toEqual([[generated.value], [generated.value]])
  })

  it('stops after one rejected repair and preserves the candidate for inspection', async () => {
    const generate = vi.fn(async () => generated)
    const review = vi.fn(async () => rejected)
    const result = await runGeneration({ generate, review, readFiles: async () => files })
    expect(result).toMatchObject({ _tag: 'Err' as const, code: 'REVIEW_REJECTED', candidateFiles: files, review: rejected.value, repairAttempts: 1 })
    expect(generate).toHaveBeenCalledTimes(2)
    expect(review).toHaveBeenCalledTimes(2)
  })

  it('returns clean output without spending a repair attempt', async () => {
    const generate = vi.fn(async () => generated)
    const result = await runGeneration({ generate, review: async () => clean, readFiles: async () => files })
    expect(result).toMatchObject({ _tag: 'Ok' as const, files, repairAttempts: 0 })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('does not review or read files after generation fails', async () => {
    const review = vi.fn()
    const readFiles = vi.fn()
    const result = await runGeneration({ generate: async () => ({ _tag: 'Err' as const, error: { _tag: 'SourceUnavailable', message: 'Source missing.' } }), review, readFiles })
    expect(result).toMatchObject({ _tag: 'Err' as const, code: 'GENERATION_FAILED' })
    expect(review).not.toHaveBeenCalled()
    expect(readFiles).not.toHaveBeenCalled()
  })
})
