import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const homepageSource = readFileSync(resolve(root, 'app/pages/index.vue'), 'utf8')
const seedSql = readFileSync(resolve(root, 'scripts/seed-homepage-collections.sql'), 'utf8')
const heroSource = homepageSource.slice(
  homepageSource.indexOf('home-band--hero'),
  homepageSource.indexOf('id="outcomes"'),
)
const featuredCollectionsSource = homepageSource.slice(
  homepageSource.indexOf('id="featured-focus"'),
  homepageSource.indexOf('id="freshness"'),
)

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

describe('homepage activation', () => {
  it('keeps the hero to one heading, one paragraph, and two calls to action', () => {
    expect(heroSource.match(/<h1\b/g)).toHaveLength(1)
    expect(heroSource.match(/<p\b/g)).toHaveLength(1)
    expect(heroSource.match(/<UButton\b/g)).toHaveLength(2)
    expect(heroSource).toContain('label="Search skills"')
    expect(heroSource).toContain('label="Explore community"')
    expect(heroSource).not.toContain('<UInput')
    expect(heroSource).not.toContain('<SkillSourceList')
    expect(heroSource).not.toContain('<code')
  })

  it('tracks the featured collection install from the primary decision point', () => {
    expect(homepageSource).toContain('useInstallCopy(')
    expect(homepageSource).toMatch(/'homepage-featured-collection'/)
    expect(homepageSource).not.toContain('navigator.clipboard')
  })

  it('frames featured collections as community curation', () => {
    expect(featuredCollectionsSource).toContain('Community curated')
    expect(featuredCollectionsSource).toContain('Collections for better agent work.')
    expect(featuredCollectionsSource).not.toContain('From the curator')
    expect(featuredCollectionsSource).not.toMatch(/\bI(?:'d| would)\b/)
  })

  it('shows the curator once and attributes collection skills to their source owners', () => {
    expect(homepageSource.match(/leadCollection\.authorLogin\}\.png\?size=/g)).toHaveLength(1)
    expect(homepageSource).toMatch(/github\.com\/\$\{skill\.owner\}\.png\?size=64/)
    expect(homepageSource).toContain('collectionSkillOwners(collection)')
    expect(homepageSource).not.toContain('collection.authorLogin}?s=')
  })

  it('keeps the avatar-enriched skill grid readable without three-column compression', () => {
    const mainCss = readFileSync(resolve(root, 'app/assets/css/main.css'), 'utf8')

    expect(mainCss).not.toContain('grid-template-columns: repeat(3, minmax(0, 1fr));')
    expect(mainCss).not.toContain('.home-featured-skills > li:not(:nth-child(3n))')
  })

  it('removes repeated decision sections', () => {
    expect(homepageSource).not.toContain('id="install-confidence"')
    expect(homepageSource).not.toContain('id="explore-registry"')
  })

  it('keeps the weekly digest inside its owning section without a nested complementary landmark', () => {
    expect(homepageSource).toContain('<div class="home-freshness-watch"')
    expect(homepageSource).not.toContain('<aside class="home-freshness-watch"')
  })

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
