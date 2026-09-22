import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runRepairEscapedDescriptions } from '../../scripts/repair-escaped-descriptions'

describe('repair-escaped-descriptions selector', () => {
  it('selects a doubled-quote escape and repairs the denormalised description', () => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec(`CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT,
        description TEXT,
        rendered_raw TEXT,
        rendered_skill_path TEXT
      )`)
      insertSkill(sqlite, {
        owner: 'acme',
        repo: 'skills',
        name: 'quoted-skilld',
        displayName: 'quoted-skilld',
        description: 'It\'\'s here, doubled',
        renderedRaw: '---\nname: quoted-skilld\ndescription: \'It\'\'s here, doubled\'\n---\nBody',
        renderedSkillPath: 'quoted-skilld/SKILL.md',
      })
      // An already-correct row with an apostrophe must survive the wider net.
      insertSkill(sqlite, {
        owner: 'acme',
        repo: 'skills',
        name: 'plain-skilld',
        displayName: 'plain-skilld',
        description: 'It\'s here',
        renderedRaw: '---\nname: plain-skilld\ndescription: \'It\'\'s here\'\n---\nBody',
        renderedSkillPath: 'plain-skilld/SKILL.md',
      })
      // The selector keeps requiring a real escape: no backslash, no quote.
      insertSkill(sqlite, {
        owner: 'acme',
        repo: 'skills',
        name: 'clean-skilld',
        displayName: 'clean-skilld',
        description: 'Nothing to repair',
        renderedRaw: '---\nname: clean-skilld\ndescription: Nothing to repair\n---\nBody',
        renderedSkillPath: 'clean-skilld/SKILL.md',
      })

      const emitted: string[] = []
      const summary = runRepairEscapedDescriptions({
        limit: 100,
        query: sql => sqlite.prepare(sql).all() as never[],
        emit: (sql) => {
          emitted.push(sql)
          sqlite.exec(sql)
        },
      })

      expect(summary).toEqual({ candidates: 2, repaired: 1, unchanged: 1, unparsed: 0 })
      expect(sqlite.prepare(
        `SELECT description FROM skills WHERE owner = 'acme' AND name = 'quoted-skilld'`,
      ).get()).toEqual({ description: 'It\'s here, doubled' })
      expect(emitted).toHaveLength(1)
      expect(emitted[0]).toContain('description = \'It\'\'s here, doubled\'')
      expect(emitted[0]).toContain('AND description IS \'It\'\'\'\'s here, doubled\'')
    }
    finally {
      sqlite.close()
    }
  })
})

interface RepairSqlite {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...params: unknown[]) => unknown
    get: (...params: unknown[]) => unknown
    all: (...params: unknown[]) => unknown[]
  }
}

interface SkillFixture {
  owner: string
  repo: string
  name: string
  displayName: string
  description: string
  renderedRaw: string
  renderedSkillPath: string
}

function insertSkill(sqlite: RepairSqlite, skill: SkillFixture): void {
  sqlite.prepare(
    `INSERT INTO skills (
      owner, repo, name, display_name, description, rendered_raw, rendered_skill_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    skill.owner,
    skill.repo,
    skill.name,
    skill.displayName,
    skill.description,
    skill.renderedRaw,
    skill.renderedSkillPath,
  )
}
