import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runRepairEscapedDescriptions } from '../../scripts/repair-escaped-descriptions'

describe('repair-escaped-descriptions selector', () => {
  it('repairs a doubled-quote escape and leaves matching rows untouched', () => {
    const sqlite = createSkillsTable()
    try {
      insertSkill(sqlite, {
        owner: 'acme',
        repo: 'skills',
        name: 'quoted-skilld',
        displayName: 'quoted-skilld',
        description: 'It\'\'s here, doubled',
        renderedRaw: '---\nname: quoted-skilld\ndescription: \'It\'\'s here, doubled\'\n---\nBody',
        renderedSkillPath: 'quoted-skilld/SKILL.md',
      })
      // A row whose stored values already match the raw bytes emits no UPDATE.
      insertSkill(sqlite, {
        owner: 'acme',
        repo: 'skills',
        name: 'plain-skilld',
        displayName: 'plain-skilld',
        description: 'It\'s here',
        renderedRaw: '---\nname: plain-skilld\ndescription: \'It\'\'s here\'\n---\nBody',
        renderedSkillPath: 'plain-skilld/SKILL.md',
      })
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
      const summary = runRepair(sqlite, emitted)

      expect(summary).toEqual({ candidates: 3, repaired: 1, unchanged: 2, unparsed: 0 })
      expect(sqlite.prepare(
        `SELECT description FROM skills WHERE owner = 'acme' AND name = 'quoted-skilld'`,
      ).get()).toEqual({ description: 'It\'s here, doubled' })
      expect(emitted).toHaveLength(1)
      expect(emitted[0]).toContain('description = \'It\'\'s here, doubled\'')
      expect(emitted[0]).toContain('AND description IS \'It\'\'\'\'s here, doubled\'')
      expect(emitted[0]).toContain('AND display_name IS \'quoted-skilld\'')
    }
    finally {
      sqlite.close()
    }
  })

  it('keeps a root skill\'s display_name when the frontmatter has no name key', () => {
    const sqlite = createSkillsTable()
    try {
      // sync-repo stores a root-level SKILL.md with the path exactly
      // 'SKILL.md' and names the skill after the repository.
      insertSkill(sqlite, {
        owner: 'acme',
        repo: 'my-repo',
        name: 'my-repo',
        displayName: 'my-repo',
        description: 'It\'\'s a root skill, doubled',
        renderedRaw: '---\ndescription: \'It\'\'s a root skill, doubled\'\n---\nBody',
        renderedSkillPath: 'SKILL.md',
      })

      const emitted: string[] = []
      const summary = runRepair(sqlite, emitted)

      expect(summary).toEqual({ candidates: 1, repaired: 1, unchanged: 0, unparsed: 0 })
      const row = sqlite.prepare(
        `SELECT description, display_name FROM skills WHERE owner = 'acme' AND name = 'my-repo'`,
      ).get() as { description: string, display_name: string }
      expect(row.description).toBe('It\'s a root skill, doubled')
      expect(row.display_name).toBe('my-repo')
    }
    finally {
      sqlite.close()
    }
  })

  it('repairs a description truncated by a wrapped scalar', () => {
    const sqlite = createSkillsTable()
    try {
      // The old parser consumed only the first line of a wrapped plain
      // scalar, so the stored description holds neither a backslash nor a
      // quote yet is still truncated.
      insertSkill(sqlite, {
        owner: 'acme',
        repo: 'skills',
        name: 'wrap',
        displayName: 'wrap',
        description: 'line one',
        renderedRaw: '---\nname: wrap\ndescription: line one\n  continued here\n---\nBody',
        renderedSkillPath: 'wrap/SKILL.md',
      })

      const emitted: string[] = []
      const summary = runRepair(sqlite, emitted)

      expect(summary).toEqual({ candidates: 1, repaired: 1, unchanged: 0, unparsed: 0 })
      expect(sqlite.prepare(
        `SELECT description FROM skills WHERE owner = 'acme' AND name = 'wrap'`,
      ).get()).toEqual({ description: 'line one continued here' })
    }
    finally {
      sqlite.close()
    }
  })

  it('repairs a display_name that holds the escapes while the description is clean', () => {
    const sqlite = createSkillsTable()
    try {
      insertSkill(sqlite, {
        owner: 'acme',
        repo: 'skills',
        name: 'pro-skilld',
        displayName: 'Skill \\"Pro\\"',
        description: 'Clean words here',
        renderedRaw: '---\nname: "Skill \\"Pro\\""\ndescription: Clean words here\n---\nBody',
        renderedSkillPath: 'pro-skilld/SKILL.md',
      })

      const emitted: string[] = []
      const summary = runRepair(sqlite, emitted)

      expect(summary).toEqual({ candidates: 1, repaired: 1, unchanged: 0, unparsed: 0 })
      const row = sqlite.prepare(
        `SELECT description, display_name FROM skills WHERE owner = 'acme' AND name = 'pro-skilld'`,
      ).get() as { description: string, display_name: string }
      expect(row.display_name).toBe('Skill "Pro"')
      expect(row.description).toBe('Clean words here')
    }
    finally {
      sqlite.close()
    }
  })

  it('repairs a null description from the raw bytes', () => {
    const sqlite = createSkillsTable()
    try {
      insertSkill(sqlite, {
        owner: 'acme',
        repo: 'skills',
        name: 'nullish',
        displayName: 'nullish',
        description: null,
        renderedRaw: '---\nname: nullish\ndescription: Recovered words\n---\nBody',
        renderedSkillPath: 'nullish/SKILL.md',
      })

      const emitted: string[] = []
      const summary = runRepair(sqlite, emitted)

      expect(summary).toEqual({ candidates: 1, repaired: 1, unchanged: 0, unparsed: 0 })
      expect(emitted[0]).toContain('AND description IS NULL')
      expect(sqlite.prepare(
        `SELECT description FROM skills WHERE owner = 'acme' AND name = 'nullish'`,
      ).get()).toEqual({ description: 'Recovered words' })
    }
    finally {
      sqlite.close()
    }
  })
})

interface RepairSqlite {
  exec: (sql: string) => void
  close: () => void
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
  displayName: string | null
  description: string | null
  renderedRaw: string
  renderedSkillPath: string
}

function createSkillsTable(): RepairSqlite {
  const sqlite = new Database(':memory:') as unknown as RepairSqlite
  sqlite.exec(`CREATE TABLE skills (
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT,
    description TEXT,
    rendered_raw TEXT,
    rendered_skill_path TEXT
  )`)
  return sqlite
}

function runRepair(sqlite: RepairSqlite, emitted: string[]) {
  return runRepairEscapedDescriptions({
    limit: 100,
    query: sql => sqlite.prepare(sql).all() as never[],
    emit: (sql) => {
      emitted.push(sql)
      sqlite.exec(sql)
    },
  })
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
