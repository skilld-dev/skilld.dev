import { describe, expect, it } from 'vitest'
import { descriptionReviewKey, descriptionReviewStatement, parseDescriptionReview, reviewLabel } from '../../scripts/lib/description-review'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

describe('description reviews', () => {
  it('keeps mixed evidence uncertain', () => {
    expect(reviewLabel({ task: 0.95, activation: 0.6, scope: 0.9, redundant: 0.1 })).toBe('uncertain')
  })
  it('identifies a clear selection description without a length input', () => {
    expect(reviewLabel({ task: 0.8, activation: 0.8, scope: 0.8, redundant: 0.2 })).toBe('clear')
  })
  it('flags missing task evidence', () => {
    expect(reviewLabel({ task: 0.2, activation: 0.95, scope: 0.9, redundant: 0.1 })).toBe('needs-work')
  })
  it('does not reuse a review when the description changes', () => {
    expect(descriptionReviewKey('Review code.')).not.toBe(descriptionReviewKey('Review schemas.'))
  })
  it('rejects invalid probabilities instead of publishing a rating', () => {
    expect(parseDescriptionReview({ model: 'jev-1.13.0', answers: { task: { type: 'noul', noul: 2 } } }).success).toBe(false)
  })
  it('persists each source version once and rejects changed source evidence', async () => {
    const fixture = createSqliteD1(allMigrations())
    const source = { owner: 'author', repo: 'skills', name: 'review', description: 'Review code.', sourceBlobSha: 'a'.repeat(40), sourceCommit: 'b'.repeat(40), rawSha256: 'c'.repeat(64) }
    const binary = { type: 'noul', noul: 0.95 }
    const parsed = parseDescriptionReview({
      model: 'jev-1.13.0',
      usage: { input_tokens: 100, output_tokens: 20 },
      answers: {
        task: binary,
        activation: binary,
        scope: binary,
        redundant: { type: 'noul', noul: 0.05 },
        declaredKind: { type: 'choice', choice: 'general', confidence: 1, probabilities: { general: 1, specific: 0, unclear: 0 } },
        topic: { type: 'choice', choice: 'coding', confidence: 1, probabilities: { coding: 1, design: 0, writing: 0, operations: 0, data: 0, planning: 0, research: 0, security: 0, other: 0, unclear: 0 } },
      },
    })
    if (!parsed.success)
      throw parsed.error
    try {
      await fixture.db.prepare(`INSERT INTO skills(owner,repo,name,display_name,slug,current_sha,rendered_raw_sha256,rendered_status) VALUES ('author','skills','review','Review','author/review',?,?,'ok')`).bind(source.sourceBlobSha, source.rawSha256).run()
      const statement = descriptionReviewStatement(source, parsed.data, '2026-10-09T00:00:00Z')
      await fixture.db.prepare(statement).run()
      await fixture.db.prepare(statement).run()
      await fixture.db.prepare(descriptionReviewStatement({ ...source, rawSha256: 'd'.repeat(64) }, parsed.data, '2026-10-09T00:00:01Z')).run()
      expect((await fixture.db.prepare(`SELECT COUNT(*) AS count,json_extract(payload,'$.label') AS label FROM skill_generated WHERE kind LIKE 'description-review:%'`).first())).toEqual({ count: 1, label: 'clear' })
      await fixture.db.prepare(`UPDATE skills SET rendered_raw_sha256=?`).bind('d'.repeat(64)).run()
      await fixture.db.prepare(descriptionReviewStatement({ ...source, rawSha256: 'd'.repeat(64) }, parsed.data, '2026-10-09T00:00:01Z')).run()
      expect((await fixture.db.prepare(`SELECT COUNT(*) AS count FROM skill_generated WHERE kind LIKE 'description-review:%'`).first())).toEqual({ count: 2 })
    }
    finally {
      fixture.close()
    }
  })
})
