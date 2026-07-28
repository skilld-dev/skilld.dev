import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

describe('leaderboard review bootstrap', () => {
  it('starts with a narrow cohort of individual creators publishing generic skills', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(readFileSync(
      resolve(process.cwd(), 'migrations/0080_skill_repo_eligibility.sql'),
      'utf8',
    ))
    sqlite.exec(readFileSync(
      resolve(process.cwd(), 'migrations/0083_seed_skill_repo_reviews.sql'),
      'utf8',
    ))

    const rows = sqlite.prepare(`
      SELECT owner, repo, status, reason, reviewed_by
      FROM skill_repo_eligibility
      ORDER BY owner, repo
    `).all() as Array<{
      owner: string
      repo: string
      status: string
      reason: string
      reviewed_by: string
    }>

    expect(rows.length).toBeGreaterThanOrEqual(10)
    expect(rows.every(row =>
      row.status === 'eligible'
      && row.reason.trim().length >= 20
      && row.reviewed_by.trim().length > 0,
    )).toBe(true)
    expect(rows).toContainEqual(expect.objectContaining({ owner: 'mattpocock', repo: 'skills' }))
    expect(rows).toContainEqual(expect.objectContaining({ owner: 'obra', repo: 'superpowers' }))
    expect(rows).not.toContainEqual(expect.objectContaining({ owner: 'anthropics' }))
    expect(rows).not.toContainEqual(expect.objectContaining({ owner: 'openai' }))
    expect(rows).not.toContainEqual(expect.objectContaining({ owner: 'cloudflare' }))

    sqlite.close()
  })
})
