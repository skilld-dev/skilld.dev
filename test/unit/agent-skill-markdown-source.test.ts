import Database from 'better-sqlite3'
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

async function requestMarkdown(route: string, skills: { name: string, resolved?: number, status?: string }[], action?: string) {
  const db = new Database(':memory:')
  databases.push(db)
  db.exec(`CREATE TABLE skills (
    owner TEXT, repo TEXT, name TEXT, rendered_raw TEXT, display_name TEXT,
    description TEXT, rendered_at INTEGER, assets TEXT, rendered_status TEXT, source_resolved INTEGER
  )`)
  for (const skill of skills) {
    db.prepare('INSERT INTO skills VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('author', 'repository', skill.name, `---\nname: ${skill.name}\n---\n\nOriginal source.`, null, null, 1, '[]', skill.status ?? 'ok', skill.resolved ?? 1)
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
  const app = {
    hooks: {
      hook(_name: string, callback: typeof handler) {
        handler = callback
      },
    },
  }
  registerPlugin(app as unknown as Parameters<typeof registerPlugin>[0])
  if (!handler)
    throw new Error('The Markdown source hook was not registered')
  const context: MarkdownContext = { route, event: { path: `${route}.md${action ? `?action=${action}` : ''}`, context: { platform: { db: binding } } } }
  await handler(context)
  return context.source
}

describe('agent Skill page Markdown source', () => {
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
