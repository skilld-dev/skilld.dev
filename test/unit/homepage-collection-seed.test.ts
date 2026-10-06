import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const seedSql = readFileSync(resolve(root, 'scripts/seed-homepage-collections.sql'), 'utf8')

function seedHomepageCollections(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_id INTEGER NOT NULL,
      login TEXT NOT NULL UNIQUE,
      name TEXT,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER NOT NULL
    );
    CREATE TABLE collections_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_user_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      preamble TEXT,
      featured INTEGER NOT NULL,
      featured_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      UNIQUE(author_user_id, slug)
    );
    CREATE TABLE collection_skills_v2 (
      collection_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      name TEXT,
      reason TEXT,
      PRIMARY KEY(collection_id, position)
    );
  `)
  sqlite.exec(seedSql)
  return sqlite
}

describe('homepage collection seed', () => {
  it('features the beachhead trio ordered by featured_at', () => {
    const sqlite = seedHomepageCollections()

    try {
      const featured = sqlite.prepare(`
        SELECT slug
        FROM collections_v2
        WHERE featured = 1
          AND deleted_at IS NULL
        ORDER BY featured_at DESC
        LIMIT 3
      `).all() as Array<{ slug: string }>

      expect(featured.map(row => row.slug)).toEqual([
        'design-engineering-essentials',
        'essentials',
        'vue-nuxt',
      ])
    }
    finally {
      sqlite.close()
    }
  })

  it('keeps each homepage collection complete after seeding', () => {
    const sqlite = seedHomepageCollections()

    try {
      const counts = sqlite.prepare(`
        SELECT c.slug, COUNT(cs.position) AS skill_count
        FROM collections_v2 c
        LEFT JOIN collection_skills_v2 cs ON cs.collection_id = c.id
        WHERE c.featured = 1
          AND c.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY c.featured_at DESC
        LIMIT 3
      `).all() as Array<{ slug: string, skill_count: number }>

      expect(counts).toEqual([
        { slug: 'design-engineering-essentials', skill_count: 10 },
        { slug: 'essentials', skill_count: 8 },
        { slug: 'vue-nuxt', skill_count: 9 },
      ])
    }
    finally {
      sqlite.close()
    }
  })

  it('never cites install counts in collection copy', () => {
    const sqlite = seedHomepageCollections()

    try {
      const tainted = sqlite.prepare(`
        SELECT COUNT(*) AS n
        FROM collection_skills_v2
        WHERE reason LIKE '%K installs%'
           OR reason LIKE '%most-installed%'
           OR reason LIKE '%leaderboard-top%'
      `).get() as { n: number }

      expect(tainted.n).toBe(0)
    }
    finally {
      sqlite.close()
    }
  })

  it('covers the complete agent capability lifecycle without bootstrap-only entries', () => {
    const sqlite = seedHomepageCollections()

    try {
      const skills = sqlite.prepare(`
        SELECT cs.owner, cs.repo, cs.name
        FROM collection_skills_v2 cs
        JOIN collections_v2 c ON c.id = cs.collection_id
        WHERE c.slug = 'agent-building'
        ORDER BY cs.position
      `).all()

      expect(skills).toEqual([
        { owner: 'vercel-labs', repo: 'skills', name: 'find-skills' },
        { owner: 'openai', repo: 'skills', name: 'skill-installer' },
        { owner: 'anthropics', repo: 'skills', name: 'skill-creator' },
        { owner: 'obra', repo: 'superpowers', name: 'writing-skills' },
        { owner: 'callstackincubator', repo: 'agent-skills', name: 'validate-skills' },
        { owner: 'anthropics', repo: 'skills', name: 'mcp-builder' },
      ])
    }
    finally {
      sqlite.close()
    }
  })
})
