import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  excludeRecentlySentWeeklySkills,
  loadRecentWeeklySkillKeys,
  recordWeeklySkillsSent,
  WEEKLY_RESURFACE_SECONDS,
} from '../../layers/identity/server/utils/weekly-history'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 2_000_000_000

describe('weekly Skill history', () => {
  let fixture: ReturnType<typeof createSqliteD1>

  beforeEach(() => {
    fixture = createSqliteD1([])
    fixture.raw.exec(`
      CREATE TABLE weekly_skill_sends (
        window_end INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        sent_at INTEGER NOT NULL,
        PRIMARY KEY (window_end, owner, repo, name)
      )
    `)
  })

  afterEach(() => fixture.close())

  it('holds a sent Skill for 60 days, then lets it return', async () => {
    await recordWeeklySkillsSent(fixture.db, {
      windowEnd: NOW - 7 * 86_400,
      sentAt: NOW - WEEKLY_RESURFACE_SECONDS + 1,
      skills: [skill('held')],
    })
    await recordWeeklySkillsSent(fixture.db, {
      windowEnd: NOW - 70 * 86_400,
      sentAt: NOW - WEEKLY_RESURFACE_SECONDS,
      skills: [skill('ready')],
    })

    const recent = await loadRecentWeeklySkillKeys(fixture.db, NOW)
    const selected = excludeRecentlySentWeeklySkills(
      [skill('held'), skill('ready'), skill('new')],
      recent,
      7,
    )

    expect(selected.map(item => item.slug)).toEqual(['ready', 'new'])
  })

  it('records one tally row per Skill and weekly edition', async () => {
    const input = { windowEnd: NOW, sentAt: NOW, skills: [skill('alpha'), skill('beta')] }

    await recordWeeklySkillsSent(fixture.db, input)
    await recordWeeklySkillsSent(fixture.db, input)

    expect(fixture.raw.prepare(`
      SELECT name, COUNT(*) AS sends FROM weekly_skill_sends GROUP BY name ORDER BY name
    `).all()).toEqual([
      { name: 'alpha', sends: 1 },
      { name: 'beta', sends: 1 },
    ])
  })
})

function skill(slug: string) {
  return { owner: 'skilld-dev', repo: 'skills', slug }
}
