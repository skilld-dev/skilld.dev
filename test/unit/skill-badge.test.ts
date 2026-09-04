import { afterEach, describe, expect, it } from 'vitest'
import { createSkillBadgeResponse, loadSkillBadgeLikeCount, parseSkillBadgeAppearance, parseSkillBadgeTarget } from '../../server/utils/skill-badge'
import { skillBadgeEmbed, skillBadgeImagePath, skillBadgeMarkdown } from '../../shared/skill-badge'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const databases: Array<ReturnType<typeof createSqliteD1>> = []

afterEach(() => {
  databases.splice(0).forEach(database => database.close())
})

describe('skill badge', () => {
  it('creates the short README badge for a one-skill repository', () => {
    const input = {
      owner: 'danielroe',
      repo: 'empathy',
      name: 'empathy',
      registryPath: '/gh/danielroe/empathy',
    }

    expect(skillBadgeImagePath(input)).toBe('/b/danielroe/empathy')
    expect(skillBadgeEmbed(input)).toBe(`<a href="https://skilld.dev/gh/danielroe/empathy">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://skilld.dev/b/danielroe/empathy?theme=dark">
    <source media="(prefers-color-scheme: light)" srcset="https://skilld.dev/b/danielroe/empathy?theme=light">
    <img alt="Skill repository on skilld.dev" src="https://skilld.dev/b/danielroe/empathy?theme=light">
  </picture>
</a>`)
  })

  it('keeps the skill name for a multi-skill repository', () => {
    expect(skillBadgeEmbed({
      owner: 'antfu',
      repo: 'skills',
      name: 'vite',
      registryPath: '/gh/antfu/skills/vite',
    })).toContain('<img alt="Agent skill on skilld.dev" src="https://skilld.dev/b/antfu/skills/vite?theme=light">')
  })

  it('adds likes only when requested', () => {
    expect(skillBadgeEmbed({
      owner: 'danielroe',
      repo: 'empathy',
      name: 'empathy',
      registryPath: '/gh/danielroe/empathy',
      showLikes: true,
    })).toContain('srcset="https://skilld.dev/b/danielroe/empathy?likes=1&theme=dark"')
  })

  it('removes the category segment when requested', () => {
    expect(skillBadgeImagePath({
      owner: 'antfu',
      repo: 'skills',
      name: 'vite',
      registryPath: '/gh/antfu/skills/vite',
      showLabel: false,
    }, 'dark')).toBe('/b/antfu/skills/vite?theme=dark&label=0')
  })

  it('creates usable badge and registry links for a skill name with spaces', () => {
    const embed = skillBadgeEmbed({
      owner: 'o',
      repo: 'r',
      name: 'My Skill',
      registryPath: '/gh/o/r/My Skill',
    })
    const match = embed.match(/<img alt="Agent skill on skilld\.dev" src="([^"]+)">[\s\S]+<\/picture>[\s\S]+<\/a>$/)

    expect(match).not.toBeNull()
    const [, imageUrl] = match!
    const badgeTarget = parseSkillBadgeTarget(decodeURIComponent(new URL(imageUrl).pathname.slice(3)))

    expect(badgeTarget).toEqual({ _tag: 'skill', owner: 'o', repo: 'r', name: 'My Skill' })
    expect(embed).toContain('<a href="https://skilld.dev/gh/o/r/My%20Skill">')
  })

  it('parses the dark theme and hidden category at the request boundary', () => {
    expect(parseSkillBadgeAppearance({ theme: 'dark', label: '0' })).toEqual({
      theme: 'dark',
      showLabel: false,
    })
    expect(parseSkillBadgeAppearance({ theme: 'sepia', label: 'yes' })).toEqual({
      theme: 'light',
      showLabel: true,
    })
  })

  it('returns a plain badge without querying for likes', async () => {
    const response = createSkillBadgeResponse({
      target: { _tag: 'repository', owner: 'danielroe', repo: 'empathy' },
      theme: 'light',
    })

    expect(response.headers.get('cache-control')).toBe('public, max-age=86400, stale-while-revalidate=604800')

    const svg = await response.text()
    expect(svg).toContain('<title>Skill repository on skilld.dev</title>')
    expect(svg).toContain('width="153" height="22"')
    expect(svg).toContain('>Skill repo<')
    expect(svg).toContain('>skilld.dev<')
    expect(svg).not.toContain('likes</title>')
  })

  it('returns an accessible, cacheable SVG with the like count', async () => {
    const response = createSkillBadgeResponse({
      target: { _tag: 'skill', owner: 'antfu', repo: 'skills', name: 'vite' },
      theme: 'dark',
      likeCount: 12,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=3600')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300, stale-while-revalidate=3600')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')

    const svg = await response.text()
    expect(svg).toContain('role="img"')
    expect(svg).toContain('<title>Agent skill on skilld.dev, 12 likes</title>')
    expect(svg).toContain('>Agent skill<')
    expect(svg).toContain('>skilld.dev<')
    expect(svg).toContain('fill="none" stroke="#fb7185"')
    expect(svg).toContain('>12<')
  })

  it('shows the selected likes segment when the count is zero', async () => {
    const response = createSkillBadgeResponse({
      target: { _tag: 'skill', owner: 'antfu', repo: 'skills', name: 'vite' },
      theme: 'light',
      likeCount: 0,
    })

    expect(response.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=3600')

    const svg = await response.text()
    expect(svg).toContain('<title>Agent skill on skilld.dev, 0 likes</title>')
    expect(svg).toContain('>0<')
  })

  it('collapses to the skilld segment when the category is hidden', async () => {
    const response = createSkillBadgeResponse({
      target: { _tag: 'skill', owner: 'antfu', repo: 'skills', name: 'vite' },
      theme: 'dark',
      showLabel: false,
    })

    const svg = await response.text()
    expect(svg).toContain('width="81" height="22"')
    expect(svg).not.toContain('>Agent skill<')
    expect(svg).toContain('>skilld.dev<')
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

  it('sums likes for repository badges regardless of owner and repo case', async () => {
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
      INSERT INTO skill_likes VALUES (1, 'danielroe', 'empathy', 'empathy', 1);
    `)

    await expect(loadSkillBadgeLikeCount(database.db, {
      _tag: 'repository',
      owner: 'DANIELROE',
      repo: 'Empathy',
    })).resolves.toBe(1)
  })

  it('counts only the requested skill regardless of URL case', async () => {
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
      owner: 'ANTFU',
      repo: 'Skills',
      name: 'Vite',
    })).resolves.toBe(1)
  })

  it('uses the nocase covering index for badge counts', () => {
    const database = createSqliteD1(allMigrations())
    databases.push(database)
    const queries = [
      {
        sql: `SELECT COUNT(*) AS count
          FROM skill_likes
          WHERE owner = ?1 COLLATE NOCASE
            AND repo = ?2 COLLATE NOCASE`,
        values: ['DANIELROE', 'Empathy'],
      },
      {
        sql: `SELECT COUNT(*) AS count
          FROM skill_likes
          WHERE owner = ?1 COLLATE NOCASE
            AND repo = ?2 COLLATE NOCASE
            AND name = ?3 COLLATE NOCASE`,
        values: ['ANTFU', 'Skills', 'Vite'],
      },
    ]

    for (const query of queries) {
      const plan = database.raw
        .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
        .all(...query.values)
        .map(row => String(row.detail))
        .join('\n')

      expect(plan).toContain('USING COVERING INDEX idx_skill_likes_skill_nocase')
    }
  })
})

describe('readme markdown snippet', () => {
  it('links the light badge to the repository page', () => {
    expect(skillBadgeMarkdown({
      owner: 'danielroe',
      repo: 'empathy',
      name: 'empathy',
      registryPath: '/gh/danielroe/empathy',
    })).toBe('[![skilld](https://skilld.dev/b/danielroe/empathy)](https://skilld.dev/gh/danielroe/empathy)')
  })

  it('keeps the skill segment for a multi-skill repository', () => {
    expect(skillBadgeMarkdown({
      owner: 'antfu',
      repo: 'skills',
      name: 'vite',
      registryPath: '/gh/antfu/skills/vite',
    })).toBe('[![skilld](https://skilld.dev/b/antfu/skills/vite)](https://skilld.dev/gh/antfu/skills/vite)')
  })
})
