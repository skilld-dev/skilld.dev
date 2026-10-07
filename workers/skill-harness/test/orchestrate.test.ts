import { describe, expect, it, vi } from 'vitest'
import { aggregateReports, runGeneration } from '../runner/orchestrate'

const generated = { _tag: 'Ok' as const, value: { outputDir: '/skills/package', files: [{ path: 'SKILL.md', bytes: 32 }], warnings: [], sourceAttempts: [{ source: 'pinned-package', status: 'used' as const }] } }
const clean = { _tag: 'Ok' as const, value: { summary: 'Checked against source.', findings: [] } }
const error = { level: 'error' as const, path: 'SKILL.md', message: 'Missing import.', fix: 'Add the verified import.' }
const rejected = { _tag: 'Ok' as const, value: { summary: 'Import required.', findings: [error] } }
const files = [{ path: 'SKILL.md', content: 'checked Skill' }]

describe('generation and review', () => {
  it('sums usage across generation and repair without inventing missing cache counts', async () => {
    const report = { usage: { inputTokens: 10, outputTokens: 4 }, steps: 2, warnings: ['example untested'] }
    const generate = vi.fn(async () => ({ ...generated, report }))
    const review = vi.fn().mockResolvedValueOnce({ ...rejected, report }).mockResolvedValueOnce({ ...clean, report })
    const result = await runGeneration({ generate, review, readFiles: async () => files })
    expect(result).toMatchObject({ _tag: 'Ok', generation: { _tag: 'Available', steps: 4, usage: { inputTokens: 20, outputTokens: 8 }, warnings: ['example untested'] }, reviewReport: { _tag: 'Available', steps: 4 } })
    expect(result.generation?._tag === 'Available' && result.generation.usage.cachedInputTokens).toBeUndefined()
  })

  it('preserves the candidate when the review fails', async () => {
    const result = await runGeneration({ generate: async () => generated, review: async () => ({ _tag: 'Err', error: 'model limit' }), readFiles: async () => files })
    expect(result).toMatchObject({ _tag: 'Err', code: 'REVIEW_FAILED', candidateFiles: files })
  })

  it('preserves the earlier candidate when repair generation fails', async () => {
    const generate = vi.fn().mockResolvedValueOnce(generated).mockResolvedValueOnce({ _tag: 'Err', error: 'model limit' })
    const result = await runGeneration({ generate, review: async () => rejected, readFiles: async () => files })
    expect(result).toMatchObject({ _tag: 'Err', code: 'GENERATION_FAILED', candidateFiles: files })
  })

  it('does not report partial token counts as totals', () => {
    expect(aggregateReports([{ usage: { inputTokens: 10, outputTokens: 2 }, steps: 1, warnings: [] }, { usage: { outputTokens: 3 }, steps: 1, warnings: [] }])).toMatchObject({ _tag: 'Available', steps: 2, usage: { inputTokens: undefined, outputTokens: 5 } })
  })
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

  it('skips review when an update leaves the Skill byte-identical, so Skillgen opens nothing', async () => {
    const review = vi.fn()
    const result = await runGeneration({ generate: async () => generated, review, readFiles: async () => files, baseline: [{ path: 'SKILL.md', content: 'checked Skill' }] })
    expect(review).not.toHaveBeenCalled()
    expect(result).toMatchObject({ _tag: 'Ok', files, review: { summary: 'No change needed.', findings: [] }, reviewReport: { _tag: 'Unavailable' }, repairAttempts: 0 })
  })

  it('reviews an update that changed the Skill', async () => {
    const review = vi.fn(async () => clean)
    await runGeneration({ generate: async () => generated, review, readFiles: async () => files, baseline: [{ path: 'SKILL.md', content: 'older Skill' }] })
    expect(review).toHaveBeenCalledOnce()
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
