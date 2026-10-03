import type { Database as SqliteDatabase } from 'better-sqlite3'
import type { H3Event } from 'h3'
import type { RegistrySkill } from '../../layers/registry/server/utils/skills-registry'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  buildFtsMatchQuery,
  buildIdentifierFtsQuery,
  hybridSkillSearch,
  LEXICAL_SEARCH_SQL,
  rankSearchResults,
  skillKey,
} from '../../layers/registry/server/utils/skill-search'

/**
 * Relevance regression suite for the lexical retrieval lane.
 *
 * Every other search test checks a pure function in isolation. That is exactly
 * how the worst bug in this area shipped: FTS5 joins bare terms with an
 * implicit AND, so "stop memory leaks" required one skill to contain all three
 * words and matched nothing at all in production. Twenty-one green unit tests
 * said the query builder was fine.
 *
 * This suite runs the real migrations into SQLite, indexes real-shaped skills,
 * and asserts on ranked output using the production BM25 expression. It fails
 * if retrieval stops finding the right skills, regardless of which layer broke.
 */

// Boundary stub only: these are declared retrieval orders, not measured embeddings.
// Real SQLite retrieval and the production fusion/ranking remain under test.
const semantic = vi.hoisted(() => ({ calls: 0, hits: [] as Array<{ owner: string, repo: string, name: string, score: number }> | null }))
vi.mock('../../layers/registry/server/utils/skill-semantic-search', async importOriginal => ({
  ...await importOriginal<typeof import('../../layers/registry/server/utils/skill-semantic-search')>(),
  semanticSkillSearch: async () => {
    semantic.calls++
    return semantic.hits
  },
}))

interface Fixture {
  name: string
  owner: string
  repo: string
  displayName: string
  description: string
}

const SKILLS: Fixture[] = [
  {
    name: 'debugging-instruments',
    owner: 'dpearson2699',
    repo: 'swift-ios-skills',
    displayName: 'Debugging Instruments',
    description: 'Diagnose memory leaks, retain cycles and performance regressions in iOS apps using Instruments and the memory graph debugger.',
  },
  {
    name: 'memory-systems',
    owner: 'bmad-labs',
    repo: 'skills',
    displayName: 'Memory Systems',
    description: 'Persistent semantic memory for agents. Store, recall and consolidate long term memory across sessions with vector storage.',
  },
  {
    name: 'fixing-flaky-tests',
    owner: 'posthog',
    repo: 'skills',
    displayName: 'Fixing Flaky Tests',
    description: 'Diagnose and repair flaky tests. Covers retry loops, timing assumptions, shared state between tests and non deterministic ordering.',
  },
  {
    name: 'vue-testing-best-practices',
    owner: 'antfu',
    repo: 'skills',
    displayName: 'Vue Testing Best Practices',
    description: 'Use for Vue.js testing. Covers Vitest, Vue Test Utils, component testing, mocking and Playwright for end to end testing.',
  },
  {
    name: 'core-web-vitals',
    owner: 'addyosmani',
    repo: 'web-quality-skills',
    displayName: 'Core Web Vitals',
    description: 'Optimise Core Web Vitals. Improve largest contentful paint, interaction to next paint and cumulative layout shift so pages load faster.',
  },
  {
    name: 'design/layout',
    owner: 'maintainer',
    repo: 'skills',
    displayName: 'Layout',
    description: 'Build responsive grid layouts.',
  },
  {
    name: 'pdf',
    owner: 'anthropics',
    repo: 'skills',
    displayName: 'PDF',
    description: 'Use whenever the user wants to do anything with PDF files, including reading, creating, filling forms and extracting tables.',
  },
]

function rankedNamesFor(sqlite: SqliteDatabase, query: string, limit = 5): string[] {
  const match = buildFtsMatchQuery(query)
  if (!match)
    return []
  const rows = sqlite.prepare(LEXICAL_SEARCH_SQL).all(match, query.trim(), query.trim(), query.trim(), limit) as { name: string }[]
  return rows.map(row => row.name)
}

describe('search relevance: lexical lane', () => {
  let sqlite: SqliteDatabase

  beforeAll(() => {
    sqlite = new Database(':memory:')
    const migrationsDir = resolve(process.cwd(), 'migrations')
    for (const migration of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort())
      sqlite.exec(readFileSync(resolve(migrationsDir, migration), 'utf8'))

    // Inserting into `skills` populates skills_fts through the migration's own
    // triggers, so the index under test is the one production builds.
    const insert = sqlite.prepare(
      `INSERT INTO skills (name, owner, repo, display_name, slug, description)
       VALUES (@name, @owner, @repo, @displayName, @slug, @description)`,
    )
    for (const skill of SKILLS)
      insert.run({ ...skill, slug: `${skill.owner}/${skill.name}` })
  })

  afterAll(() => sqlite.close())

  function event(): H3Event {
    return { context: { platform: { db: {
      prepare: (sql: string) => ({ bind: (...values: unknown[]) => ({
        all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      }) }),
    } } } } as unknown as H3Event
  }

  const registrySkills: RegistrySkill[] = SKILLS.map(s => ({
    ...s,
    slug: `${s.owner}/${s.name}`,
    registryPath: `/gh/${s.owner}/${s.repo}/${s.name}`,
    stars: 0,
    renderedRawSha256: null,
    seoIndexScore: 0,
    seoIndexable: true,
    trustTier: 'candidate',
    trustScore: 0,
    pushedAt: null,
    modifiedAt: null,
    firstSeenAt: null,
  }))

  it.each(SKILLS)('retrieves full identity $owner/$repo/$name without an embedding', async (target) => {
    semantic.hits = []
    const query = `${target.owner}/${target.repo}/${target.name}`
    const result = await hybridSkillSearch(event(), query)
    const ranked = rankSearchResults(registrySkills.filter(s => result.keys.includes(skillKey(s))), result.scoreByKey, query)
    expect(ranked[0]?.name).toBe(target.name)
  })

  it('retrieves a full identity with different casing and outer spaces', async () => {
    semantic.hits = []
    const result = await hybridSkillSearch(event(), '  ANTHROPICS/SKILLS/PDF  ')
    expect(result.keys).toContain('anthropics/skills/pdf')
  })

  it('retrieves an exact name before the lexical pool fills with shorter prefix matches', async () => {
    semantic.hits = []
    sqlite.exec('SAVEPOINT exact_candidate')
    try {
      const insert = sqlite.prepare('INSERT INTO skills (owner, repo, name, display_name, slug, description) VALUES (?, ?, ?, ?, ?, ?)')
      for (let i = 0; i < 201; i++)
        insert.run(`prefix${i}`, 'skills', `document-tool-${i}`, `Document Tool ${i}`, `prefix${i}/document-tool-${i}`, 'Document utilities.')
      insert.run('target', 'skills', 'document', 'Document', 'target/document', 'Read, create, edit, combine and extract document files. '.repeat(100))
      const result = await hybridSkillSearch(event(), 'document')
      expect(result.keys).toContain('target/skills/document')
      expect(result.keys.length).toBeLessThanOrEqual(200)
    }
    finally {
      sqlite.exec('ROLLBACK TO exact_candidate; RELEASE exact_candidate')
    }
  })

  it('keyword search skips AI retrieval and returns lexical matches', async () => {
    semantic.calls = 0
    semantic.hits = [{ owner: 'elsewhere', repo: 'skills', name: 'semantic-only', score: 0.9 }]
    const result = await hybridSkillSearch(event(), 'pdf', 'lexical')
    expect(result.keys).toContain('anthropics/skills/pdf')
    expect(result.keys).not.toContain('elsewhere/skills/semantic-only')
    expect(result.mode).toBe('lexical')
    expect(semantic.calls).toBe(0)
  })

  it('aI search includes semantic matches beyond the query words', async () => {
    semantic.calls = 0
    semantic.hits = [{ owner: 'elsewhere', repo: 'skills', name: 'semantic-only', score: 0.9 }]
    const result = await hybridSkillSearch(event(), 'pdf', 'hybrid')
    expect(result.keys).toContain('anthropics/skills/pdf')
    expect(result.keys).toContain('elsewhere/skills/semantic-only')
    expect(result.mode).toBe('hybrid')
    expect(semantic.calls).toBe(1)
  })

  it('reports unavailable search when both retrieval lanes fail', async () => {
    semantic.hits = null
    const failed = { context: { platform: { db: {
      prepare: () => ({ bind: () => ({ all: async () => { throw new Error('D1 unavailable') } }) }),
    } } } } as unknown as H3Event
    await expect(hybridSkillSearch(failed, 'pdf')).rejects.toMatchObject({ statusCode: 503 })
  })

  it('returns no matches for punctuation when semantic retrieval is unavailable', async () => {
    semantic.hits = null
    expect((await hybridSkillSearch(event(), '***')).keys).toEqual([])
  })

  it('keeps a successful empty lexical result when semantic retrieval is unavailable', async () => {
    semantic.hits = null
    const result = await hybridSkillSearch(event(), 'zzqwx florble nonsense')
    expect(result.keys).toEqual([])
    expect(result.mode).toBe('lexical')
  })

  it('keeps a successful empty semantic result when lexical retrieval fails', async () => {
    semantic.hits = []
    const failed = { context: { platform: { db: {
      prepare: () => ({ bind: () => ({ all: async () => { throw new Error('D1 unavailable') } }) }),
    } } } } as unknown as H3Event
    const result = await hybridSkillSearch(failed, 'pdf')
    expect(result.keys).toEqual([])
  })

  it('keeps a semantic-only answer to words absent from the index', async () => {
    const target = SKILLS.find(s => s.name === 'core-web-vitals')!
    semantic.hits = [{ ...target, score: 0.61 }]
    const query = 'accelerate sluggish websites'
    expect(rankedNamesFor(sqlite, query)).toEqual([])
    const result = await hybridSkillSearch(event(), query)
    const ranked = rankSearchResults(registrySkills.filter(s => result.keys.includes(skillKey(s))), result.scoreByKey, query)
    expect(ranked[0]?.name).toBe('core-web-vitals')
    expect(result.mode).toBe('semantic')
  })

  // The production failure that started this work. Cosine similarity matched
  // the wrong sense of "memory" and returned agent-memory skills; the lexical
  // lane must put the leak-debugging skill first.
  it('answers "stop memory leaks" with leak debugging, not agent memory', () => {
    const ranked = rankedNamesFor(sqlite, 'stop memory leaks')
    expect(ranked).toContain('debugging-instruments')
    expect(ranked.indexOf('debugging-instruments')).toBeLessThan(
      !ranked.includes('memory-systems') ? Number.MAX_SAFE_INTEGER : ranked.indexOf('memory-systems'),
    )
  })

  // Guards the implicit-AND regression directly: no single fixture contains
  // "stop", so an all-terms query returns nothing.
  it('returns results for prose queries whose words are not all present', () => {
    expect(rankedNamesFor(sqlite, 'stop memory leaks').length).toBeGreaterThan(0)
    expect(rankedNamesFor(sqlite, 'how do I make my website load faster').length).toBeGreaterThan(0)
  })

  it('answers "debug a flaky test" with the flaky test skill first', () => {
    expect(rankedNamesFor(sqlite, 'debug a flaky test')[0]).toBe('fixing-flaky-tests')
  })

  it('answers "make my website load faster" with core web vitals', () => {
    expect(rankedNamesFor(sqlite, 'make my website load faster')).toContain('core-web-vitals')
  })

  it('ranks an exact skill name first', () => {
    expect(rankedNamesFor(sqlite, 'pdf')[0]).toBe('pdf')
    expect(rankedNamesFor(sqlite, 'core-web-vitals')[0]).toBe('core-web-vitals')
  })

  it('finds a skill by its owner', () => {
    expect(rankedNamesFor(sqlite, 'addyosmani')).toContain('core-web-vitals')
  })

  // Description is indexed for search, so a word appearing only in prose must
  // still retrieve. This is what migration 0087 bought.
  it('matches a term that appears only in the description', () => {
    expect(rankedNamesFor(sqlite, 'playwright')).toContain('vue-testing-best-practices')
    expect(rankedNamesFor(sqlite, 'retain cycles')).toContain('debugging-instruments')
  })

  it('returns nothing for a query with no real terms', () => {
    expect(rankedNamesFor(sqlite, 'zzqwx florble nonsense')).toEqual([])
  })

  // Tag pages key off a single term and must not inherit the search lane's
  // description breadth, or they silently become "skills mentioning the word".
  it('keeps the identifier-qualified query off description matches', () => {
    const match = buildIdentifierFtsQuery('playwright')!
    const rows = sqlite.prepare(LEXICAL_SEARCH_SQL).all(match, 'playwright', 'playwright', 'playwright', 10) as { name: string }[]
    expect(rows).toHaveLength(0)

    const searchRows = sqlite.prepare(LEXICAL_SEARCH_SQL).all(buildFtsMatchQuery('playwright')!, 'playwright', 'playwright', 'playwright', 10) as { name: string }[]
    expect(searchRows.length).toBeGreaterThan(0)
  })
})
