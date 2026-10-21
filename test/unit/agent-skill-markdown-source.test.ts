import Database from 'better-sqlite3'
import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import registerPlugin from '../../server/plugins/ai-ready-markdown-source'

vi.hoisted(() => {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
})

interface MarkdownContext {
  route: string
  event: { path: string, context: { platform: { db: unknown } } }
  source?: { markdown: string, title: string }
}

const databases: Database.Database[] = []
afterEach(() => {
  for (const db of databases.splice(0))
    db.close()
})

async function requestMarkdownResponse(route: string, skills: { name: string, resolved?: number, status?: string, indexable?: number, admitted?: boolean, probe?: boolean }[], action?: string, repoKind = 'creator') {
  const db = new Database(':memory:')
  databases.push(db)
  db.exec(`CREATE TABLE skills (
    owner TEXT, repo TEXT, name TEXT, rendered_raw TEXT, display_name TEXT,
    description TEXT, rendered_at INTEGER, assets TEXT, rendered_status TEXT, source_resolved INTEGER,
    seo_indexable INTEGER
  );
  CREATE TABLE repos (owner TEXT, repo TEXT, repo_kind TEXT);
  CREATE TABLE skill_trending_admissions (owner TEXT, repo TEXT, name TEXT, first_board TEXT);`)
  db.prepare('INSERT INTO repos VALUES (?, ?, ?)').run('author', 'repository', repoKind)
  for (const skill of skills) {
    db.prepare('INSERT INTO skills VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('author', 'repository', skill.name, `---\nname: ${skill.name}\n---\n\nOriginal source.`, null, null, 1, '[]', skill.status ?? 'ok', skill.resolved ?? 1, skill.indexable ?? 1)
    if (skill.admitted || skill.probe)
      db.prepare('INSERT INTO skill_trending_admissions VALUES (?, ?, ?, ?)').run('author', 'repository', skill.name, skill.probe ? 'probe' : 'week')
  }
  const binding = {
    prepare(sql: string) {
      return {
        bind(...values: (string | number | null)[]) {
          return {
            first: async () => db.prepare(sql).get(...values) ?? null,
            all: async () => ({ results: db.prepare(sql).all(...values), success: true }),
          }
        },
      }
    },
  }
  let handler: ((context: MarkdownContext) => Promise<void>) | undefined
  const nitroApp = {
    hooks: {
      hook(_name: string, callback: typeof handler) {
        handler = callback
      },
    },
  }
  registerPlugin(nitroApp as unknown as Parameters<typeof registerPlugin>[0])
  if (!handler)
    throw new Error('The Markdown source hook was not registered')
  const sourceHandler = handler
  const app = createApp()
  app.use(defineEventHandler(async (event) => {
    event.context.platform = { db: binding }
    const context = { route, event, source: undefined }
    await sourceHandler(context)
    return { source: context.source }
  }))
  return toWebHandler(app)(new Request(`http://localhost${route}.md${action ? `?action=${action}` : ''}`))
}

async function requestMarkdown(...args: Parameters<typeof requestMarkdownResponse>) {
  const response = await requestMarkdownResponse(...args)
  return (await response.json()).source as MarkdownContext['source']
}

describe('agent Skill page Markdown source', () => {
  it.each([
    { label: 'quality exclusion', skills: [{ name: 'writing', indexable: 0 }], repoKind: 'creator', robots: 'noindex,follow' },
    { label: 'unadmitted Skill', skills: [{ name: 'writing' }, { name: 'other', admitted: true }], repoKind: 'creator', robots: 'noindex,follow' },
    { label: 'admitted Skill', skills: [{ name: 'writing', admitted: true }], repoKind: 'creator', robots: 'index,follow' },
    { label: 'probe exception', skills: [{ name: 'writing', indexable: 0, probe: true }], repoKind: 'creator', robots: 'index,follow' },
    { label: 'empty admission fallback', skills: [{ name: 'writing' }], repoKind: 'creator', robots: 'index,follow' },
    { label: 'aggregator', skills: [{ name: 'writing', admitted: true }], repoKind: 'aggregator', robots: 'noindex,follow' },
  ])('serves the existing indexing rule for $label in Markdown', async ({ skills, repoKind, robots }) => {
    const response = await requestMarkdownResponse('/gh/author/repository/writing', skills, undefined, repoKind)
    expect(response.headers.get('x-robots-tag')).toBe(robots)
    expect((await response.json()).source.markdown).toContain('Original source.')
  })

  it.each(['/gh/author/repository', '/gh/author/repository/writing'])('serves only the fork workflow for %s?action=fork', async (route) => {
    const source = await requestMarkdown(route, [{ name: 'writing' }], 'fork')

    expect(source?.markdown).toContain('## Fork workflow')
    expect(source?.markdown).toContain('/api/v1/skills/author/repository/writing')
    expect(source?.markdown).toContain('--depth=1')
    expect(source?.markdown).toContain('--mode copy --plain')
    expect(source?.markdown).not.toContain('Original source.')
    expect(source?.markdown).not.toContain('follow the instructions below for this session')
  })

  it('gives a canonical repository URL the fork workflow for its sole resolved Skill', async () => {
    const source = await requestMarkdown('/gh/author/repository', [{ name: 'writing' }, { name: 'removed', resolved: 0 }])

    expect(source?.markdown).toContain('## Fork workflow')
    expect(source?.markdown).toContain('/api/v1/skills/author/repository/writing')
    expect(source?.markdown).toContain('Original source.')
    expect(source?.title).toBe('writing')
  })

  it('keeps an explicit Skill URL specific in a repository with several Skills', async () => {
    const source = await requestMarkdown('/gh/author/repository/writing', [{ name: 'writing' }, { name: 'design' }])

    expect(source?.markdown).toContain('/api/v1/skills/author/repository/writing')
    expect(source?.title).toBe('writing')
  })

  it.each([
    ['/gh/author/repository', [{ name: 'writing' }, { name: 'design' }]],
    ['/gh/author/repository', [{ name: 'removed', resolved: 0 }]],
    ['/gh/author/repository', [{ name: 'broken', status: 'error' }]],
    ['/gh/author/repository/writing/-/reference.md', [{ name: 'writing' }]],
    ['/gh/author', [{ name: 'writing' }]],
  ])('leaves %s to normal page rendering when no single Skill can answer it', async (route, skills) => {
    expect(await requestMarkdown(route, skills)).toBeUndefined()
  })
})
