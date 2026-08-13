import type { Database as SqliteDatabase } from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildFtsMatchQuery,
  buildIdentifierFtsQuery,
  LEXICAL_SEARCH_SQL,
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
  const rows = sqlite.prepare(LEXICAL_SEARCH_SQL).all(match, limit) as { name: string }[]
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

  it('indexes every fixture skill', () => {
    const row = sqlite.prepare('SELECT count(*) AS n FROM skills_fts').get() as { n: number }
    expect(row.n).toBe(SKILLS.length)
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
    const rows = sqlite.prepare(LEXICAL_SEARCH_SQL).all(match, 10) as { name: string }[]
    expect(rows).toHaveLength(0)

    const searchRows = sqlite.prepare(LEXICAL_SEARCH_SQL).all(buildFtsMatchQuery('playwright')!, 10) as { name: string }[]
    expect(searchRows.length).toBeGreaterThan(0)
  })
})
