import type { H3Event } from 'h3'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

// On 2026-09-29 a crawler rendered 392 uncached Skill pages in two minutes and
// D1 answered "overloaded". Each render cost ten D1 reads for the detail, and
// any view of a render older than 30 minutes wrote `rendered_html` back to
// D1 after refetching the SKILL.md from GitHub: 557 writes in the burst.
// These tests pin the cost of one uncached render at the D1 boundary.

const NOW_SEC = Math.floor(Date.now() / 1000)
const OWNER = 'ericzakariasson'
const REPO = 'scandinavian-design'
const RAW = `---\nname: alpha\ndescription: A alpha skill.\n---\n\nBody of alpha.\n`
const UPSTREAM_RAW = `---\nname: alpha\ndescription: Upstream edit.\n---\n\nUpstream body.\n`

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.message)), input))
vi.stubGlobal('getUserSession', () => Promise.resolve(null))
let slug = ''
vi.stubGlobal('getRouterParam', (_event: unknown, key: string) => (key === 'slug' ? slug : undefined))
vi.stubGlobal('useStorage', () => ({
  getItem: async () => null,
  setItem: async () => {},
}))
const upstreamFetch = vi.fn(async (..._args: unknown[]): Promise<unknown> => UPSTREAM_RAW)
vi.stubGlobal('$fetch', upstreamFetch)
// Live renders read raw.githubusercontent.com and the GitHub API with fetch.
const rawFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(UPSTREAM_RAW))
vi.stubGlobal('fetch', rawFetch)

let harness: SqliteD1
let background: Promise<unknown>[]

beforeEach(() => {
  vi.resetModules()
  upstreamFetch.mockClear()
  rawFetch.mockReset()
  rawFetch.mockImplementation(async () => new Response(UPSTREAM_RAW))
  background = []
  slug = `${OWNER}/${REPO}/alpha`
})

function seed(options: { maximumQueries?: number, renderedAt?: number | null, renderedStatus?: string | null, sourceResolved?: number } = {}) {
  harness = createSqliteD1(allMigrations(), { maximumQueries: options.maximumQueries })
  const { raw } = harness
  raw.prepare(`INSERT INTO repos (owner, repo, stars) VALUES (?, ?, 42)`).run(OWNER, REPO)
  raw.prepare(`INSERT INTO owners (owner, name) VALUES (?, 'Eric Zakariasson')`).run(OWNER)
  const status = options.renderedStatus === undefined ? 'ok' : options.renderedStatus
  const renderedAt = options.renderedAt === undefined ? NOW_SEC : options.renderedAt
  for (const name of ['alpha', 'beta']) {
    raw.prepare(
      `INSERT INTO skills (owner, repo, name, slug, display_name, source_resolved,
         rendered_skill_path, rendered_status, rendered_raw, rendered_html, rendered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      OWNER,
      REPO,
      name,
      `${OWNER}/${name}`,
      name,
      options.sourceResolved ?? 1,
      status ? `skills/${name}/SKILL.md` : null,
      status,
      status ? RAW : null,
      status ? '<p>stored</p>' : null,
      status ? renderedAt : null,
    )
  }
  raw.prepare(`INSERT INTO skill_revisions (owner, repo, name, sha, modified_at) VALUES (?, ?, 'alpha', 'old', 1), (?, ?, 'alpha', 'newest', 2)`)
    .run(OWNER, REPO, OWNER, REPO)
  const generated = raw.prepare(`INSERT INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at) VALUES (?, ?, 'alpha', ?, 'sha', ?, '2026-09-01')`)
  generated.run(OWNER, REPO, 'faq', JSON.stringify({ faqs: [{ question: 'Why?', answer: 'Because.' }] }))
  generated.run(OWNER, REPO, 'tags', JSON.stringify({ tags: ['frontend', 'scandinavian'] }))
  generated.run(OWNER, REPO, 'summary', JSON.stringify({ text: 'A summary.' }))
}

async function render(): Promise<Record<string, any>> {
  const handler = (await import('../../layers/registry/server/api/skills/[...slug].get')).default as (event: H3Event) => Promise<Record<string, any>>
  const body = await handler({
    context: {
      platform: { db: harness.db },
      cloudflare: { context: { waitUntil: (promise: Promise<unknown>) => background.push(promise) } },
    },
    node: { req: { headers: {} } },
  } as unknown as H3Event)
  await Promise.all(background)
  return body
}

function storedRender(name = 'alpha') {
  return harness.raw.prepare(`SELECT rendered_html, rendered_at FROM skills WHERE owner = ? AND repo = ? AND name = ?`)
    .get(OWNER, REPO, name) as { rendered_html: string | null, rendered_at: number | null }
}

describe('uncached skill detail render', () => {
  // Three reads for the Skill, its generated content, and the repo's Skill
  // names. The fourth is the duplicate-candidates list, which this test's
  // empty cache recomputes and production serves from the cache.
  it('reads D1 at most four times and keeps every field', async () => {
    seed({ maximumQueries: 4 })

    const body = await render()

    expect(body).toMatchObject({
      owner: OWNER,
      repo: REPO,
      name: 'alpha',
      registryPath: `/gh/${OWNER}/${REPO}/alpha`,
      authorName: 'Eric Zakariasson',
      stars: 42,
      contentHtml: expect.stringContaining('Body of alpha'),
      faqs: [{ question: 'Why?', answer: 'Because.' }],
      summary: { text: 'A summary.' },
      keywords: ['scandinavian'],
      provenance: { sourceCommitSha: 'newest' },
    })
    expect(body.tags.map((tag: { slug: string }) => tag.slug)).toEqual(['frontend'])
    expect(body.dependencies).toEqual([])
  })

  it('serves a stored render older than 30 minutes without refetching or writing it', async () => {
    const renderedAt = NOW_SEC - 2 * 60 * 60
    seed({ renderedAt })

    const body = await render()

    expect(body.contentHtml).toContain('Body of alpha')
    expect(upstreamFetch).not.toHaveBeenCalled()
    expect(storedRender()).toEqual({ rendered_html: '<p>stored</p>', rendered_at: renderedAt })
  })

  it('renders a Skill with no stored render live without writing it to D1', async () => {
    seed({ renderedStatus: null })

    const body = await render()

    expect(body.contentHtml).toContain('Upstream body')
    expect(storedRender()).toEqual({ rendered_html: null, rendered_at: null })
  })

  it('never reads GitHub for a Skill whose source is gone upstream', async () => {
    seed({ renderedStatus: null, sourceResolved: 0 })

    const body = await render()

    expect(rawFetch).not.toHaveBeenCalled()
    expect(upstreamFetch).not.toHaveBeenCalled()
    expect(body).toMatchObject({ sourceGone: true, contentHtml: null })
  })

  it('keeps the saved copy without linking its removed files', async () => {
    seed({ sourceResolved: 0 })
    harness.raw.prepare('UPDATE skills SET rendered_raw = ? WHERE name = ?')
      .run('[Guide](references/guide.md) and [site](https://example.com).', 'alpha')

    const body = await render()
    const doc = new DOMParser().parseFromString(body.contentHtml, 'text/html')

    expect(body.sourceGone).toBe(true)
    expect(doc.body.textContent).toBe('Guide and site.\n')
    expect([...doc.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual(['https://example.com'])
    expect(rawFetch).not.toHaveBeenCalled()
  })

  it('keeps references to removed Skills as text', async () => {
    seed()
    harness.raw.prepare('UPDATE skills SET source_resolved = 0 WHERE name = ?').run('beta')
    harness.raw.prepare('UPDATE skills SET rendered_raw = ? WHERE name = ?').run('Use `/beta` first.', 'alpha')

    const body = await render()
    const doc = new DOMParser().parseFromString(body.contentHtml, 'text/html')

    expect(doc.body.textContent).toBe('Use /beta first.\n')
    expect(doc.querySelector('a')).toBeNull()
    expect(body.dependencies).toEqual([])
  })

  it('gives every live GitHub read a timeout', async () => {
    seed({ renderedStatus: null })

    await render()

    expect(rawFetch.mock.calls.length).toBeGreaterThan(0)
    for (const [, init] of rawFetch.mock.calls)
      expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('answers fetch_failed, not path_missing, when GitHub cannot be read', async () => {
    seed({ renderedStatus: null })
    rawFetch.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))

    const body = await render()

    expect(body).toMatchObject({ resolutionStatus: 'fetch_failed', contentHtml: null })
  })

  it('answers path_missing when GitHub says the SKILL.md is not there', async () => {
    seed({ renderedStatus: null })
    rawFetch.mockImplementation(async () => new Response('not found', { status: 404 }))

    const body = await render()

    expect(body).toMatchObject({ resolutionStatus: 'path_missing' })
  })

  it('still resolves a two-part slug through the slug column', async () => {
    seed()
    slug = `${OWNER}/alpha`

    const body = await render()

    expect(body.registryPath).toBe(`/gh/${OWNER}/${REPO}/alpha`)
  })

  it('returns 404 for an unknown Skill', async () => {
    seed()
    slug = `${OWNER}/${REPO}/missing`

    await expect(render()).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('findSkill', () => {
  it('resolves an owner/repo/name slug with one D1 read', async () => {
    seed({ maximumQueries: 1 })
    const { findSkill } = await import('../../layers/registry/server/utils/skills-registry')

    const skill = await findSkill({ context: { platform: { db: harness.db } } } as unknown as H3Event, `${OWNER}/${REPO}/alpha`)

    expect(skill).toMatchObject({ owner: OWNER, repo: REPO, name: 'alpha', authorName: 'Eric Zakariasson' })
  })
})

describe('uncached skill related render', () => {
  it('reads D1 at most three times and keeps the commit source', async () => {
    seed({ maximumQueries: 3 })
    upstreamFetch.mockImplementationOnce(async () => [{
      sha: 'abcdef1234567',
      html_url: 'https://github.com/c/abcdef1',
      commit: { message: 'edit alpha', author: { name: 'Eric', date: '2026-09-01T00:00:00Z' } },
      author: null,
    }] as never)
    const handler = (await import('../../layers/registry/server/api/skill-related/[...slug].get')).default as (event: H3Event) => Promise<Record<string, any>>

    const body = await handler({ context: { platform: { db: harness.db, env: {} } }, node: { req: { headers: {} } } } as unknown as H3Event)

    expect(upstreamFetch).toHaveBeenCalledWith(`https://api.github.com/repos/${OWNER}/${REPO}/commits`, expect.objectContaining({ query: { path: 'skills/alpha/SKILL.md', per_page: 5 } }))
    expect(body.commits.map((commit: { shortSha: string }) => commit.shortSha)).toEqual(['abcdef1'])
    expect(body.relatedRepoSkills.map((skill: { name: string }) => skill.name)).toEqual(['beta'])
  })
})
