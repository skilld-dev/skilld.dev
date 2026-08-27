import { afterEach, describe, expect, it } from 'vitest'
import { createSkillBadgeResponse, loadSkillBadgeLikeCount } from '../../server/utils/skill-badge'
import { skillBadgeMarkdown } from '../../shared/skill-badge'
import { createSqliteD1 } from './helpers/d1-sqlite'

const databases: Array<ReturnType<typeof createSqliteD1>> = []

afterEach(() => {
  databases.splice(0).forEach(database => database.close())
})

describe('skill badge', () => {
  it('creates the short README badge for a one-skill repository', () => {
    expect(skillBadgeMarkdown({
      owner: 'danielroe',
      repo: 'empathy',
      name: 'empathy',
      registryPath: '/gh/danielroe/empathy',
    })).toBe('[![Run on skilld](https://skilld.dev/b/danielroe/empathy)](https://skilld.dev/gh/danielroe/empathy)')
  })

  it('keeps the skill name for a multi-skill repository', () => {
    expect(skillBadgeMarkdown({
      owner: 'antfu',
      repo: 'skills',
      name: 'vite',
      registryPath: '/gh/antfu/skills/vite',
    })).toBe('[![Run on skilld](https://skilld.dev/b/antfu/skills/vite)](https://skilld.dev/gh/antfu/skills/vite)')
  })

  it('returns an accessible, cacheable SVG with the like count', async () => {
    const response = createSkillBadgeResponse(12)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=3600')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300, stale-while-revalidate=3600')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')

    const svg = await response.text()
    expect(svg).toContain('role="img"')
    expect(svg).toContain('<title>Run on skilld, 12 likes</title>')
    expect(svg).toContain('>Run on<')
    expect(svg).toContain('>skilld<')
    expect(svg).toContain('>12<')
  })

  it('sums live likes for repository badges', async () => {
    const database = createSqliteD1([])
    databases.push(database)
    database.raw.exec(`
      CREATE TABLE skill_likes (
        user_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, owner, repo, name)
      );
      INSERT INTO skill_likes VALUES
        (1, 'danielroe', 'empathy', 'empathy', 1),
        (2, 'danielroe', 'empathy', 'empathy', 2),
        (1, 'danielroe', 'other', 'other', 3);
    `)

    await expect(loadSkillBadgeLikeCount(database.db, {
      _tag: 'repository',
      owner: 'danielroe',
      repo: 'empathy',
    })).resolves.toBe(2)
  })

  it('counts only the requested skill for skill badges', async () => {
    const database = createSqliteD1([])
    databases.push(database)
    database.raw.exec(`
      CREATE TABLE skill_likes (
        user_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, owner, repo, name)
      );
      INSERT INTO skill_likes VALUES
        (1, 'antfu', 'skills', 'vite', 1),
        (2, 'antfu', 'skills', 'eslint', 2);
    `)

    await expect(loadSkillBadgeLikeCount(database.db, {
      _tag: 'skill',
      owner: 'antfu',
      repo: 'skills',
      name: 'vite',
    })).resolves.toBe(1)
  })
})
