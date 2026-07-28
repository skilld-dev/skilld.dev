import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const homepageSource = readFileSync(resolve(root, 'app/pages/index.vue'), 'utf8')
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

describe('homepage activation', () => {
  it('keeps source-linked skill previews visible before featured data loads', () => {
    expect(homepageSource).toContain('<SkillSourceList')
    expect(homepageSource).toContain('home-person-skills-v1')
    expect(homepageSource).toContain(':items="heroSkillCards"')
    expect(homepageSource).toContain('auto-scroll')
    expect(homepageSource).not.toContain('{{ heroSkillCards.length }} sources')
  })

  it('waits for hydration before replacing focusable fallback skills', () => {
    expect(homepageSource).toContain('immediate: false')
    expect(homepageSource).toContain('onMounted(() => loadPeopleSkills())')
  })

  it('requests a broad candidate pool and requires ten distinct people', () => {
    expect(homepageSource).toContain('devs: 20')
    expect(homepageSource).toContain('perDev: 2')
    expect(homepageSource).toContain('HOMEPAGE_PERSON_MINIMUM')
  })

  it('tracks the featured collection install from the primary decision point', () => {
    expect(homepageSource).toContain('useInstallCopy(')
    expect(homepageSource).toMatch(/'homepage-featured-collection'/)
    expect(homepageSource).not.toContain('navigator.clipboard')
  })

  it('removes repeated decision sections', () => {
    expect(homepageSource).not.toContain('id="install-confidence"')
    expect(homepageSource).not.toContain('id="explore-registry"')
  })

  it('keeps the weekly digest inside its owning section without a nested complementary landmark', () => {
    expect(homepageSource).toContain('<div class="home-freshness-watch"')
    expect(homepageSource).not.toContain('<aside class="home-freshness-watch"')
  })

  it('features the three collections supported by production behavior and trust', () => {
    const sqlite = seedHomepageCollections()

    try {
      const featured = sqlite.prepare(`
        SELECT slug
        FROM collections_v2
        WHERE featured = 1
        ORDER BY featured_at DESC
      `).all() as Array<{ slug: string }>

      expect(featured.map(row => row.slug)).toEqual([
        'agent-building-stack',
        'typescript-engineering-stack',
        'agent-workflow-stack',
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
        GROUP BY c.id
        ORDER BY c.featured_at DESC
      `).all() as Array<{ slug: string, skill_count: number }>

      expect(counts).toEqual([
        { slug: 'agent-building-stack', skill_count: 6 },
        { slug: 'typescript-engineering-stack', skill_count: 6 },
        { slug: 'agent-workflow-stack', skill_count: 6 },
      ])
    }
    finally {
      sqlite.close()
    }
  })
})
