import type { EventHandler, H3Event } from 'h3'
import type { LegacyOwnerProfile } from '../../layers/registry/server/presenters/owner-v1'
import type { LegacyTrendingFeed, LegacyTrendingPost } from '../../layers/registry/server/presenters/trending-v1'
import type { SkillCardSource } from '../../shared/server/skill-cards'
import Database from 'better-sqlite3'
import { createApp, createRouter, eventHandler, toWebHandler } from 'h3'
import { indexRequestsV1, ownersV1, repositoriesV1, skillsV1, tracksV1, trendingV1 } from 'skilld-sdk/contract'
import { describe, expect, it } from 'vitest'
import ownersGet from '../../layers/registry/server/api/v1/owners/[owner].get'
import tracksGet from '../../layers/registry/server/api/v1/tracks/[slug].get'
import trendingList from '../../layers/registry/server/api/v1/trending.get'
import {
  parseRepositoryReference,
  presentIndexRequest,
  presentIndexRequestCreated,
} from '../../layers/registry/server/presenters/index-request-v1'
import { presentOwner } from '../../layers/registry/server/presenters/owner-v1'
import { presentRepository, selectRepositorySkills } from '../../layers/registry/server/presenters/repository-v1'
import { presentSkillBrowse } from '../../layers/registry/server/presenters/skill-summary-v1'
import { legacyTrackPages, presentTrack, presentTrackList } from '../../layers/registry/server/presenters/track-v1'
import { presentTrending, trendingBoardRows } from '../../layers/registry/server/presenters/trending-v1'
import { findSkillsByKeys, querySkills } from '../../layers/registry/server/utils/skills-registry'

/** 2026-09-28T14:02:11Z */
const MODIFIED = 1_790_604_131

function card(overrides: Partial<SkillCardSource> = {}): SkillCardSource {
  return {
    owner: 'vercel-labs',
    repo: 'agent-skills',
    name: 'web-design-guidelines',
    displayName: 'Web Design Guidelines',
    description: 'Review UI code.',
    stars: 18_204,
    likeCount: 41,
    modifiedAt: MODIFIED,
    registryPath: '/gh/vercel-labs/agent-skills/web-design-guidelines',
    skillFileUrl: 'https://github.com/vercel-labs/agent-skills/blob/abc/skills/web-design-guidelines/SKILL.md',
    ...overrides,
  }
}

function cardsByKey(...cards: SkillCardSource[]): Map<string, SkillCardSource> {
  return new Map(cards.map(entry => [`${entry.owner}/${entry.repo}/${entry.name}`, entry]))
}

describe('skills.browse', () => {
  it('answers registry rows as Skill cards with provenance and both commands', () => {
    const answer = presentSkillBrowse({ items: [card()], total: 6 })

    expect(skillsV1.operations.browse.response.body.producer.parse(answer)).toEqual({
      items: [{
        owner: 'vercel-labs',
        repository: 'agent-skills',
        name: 'web-design-guidelines',
        displayName: 'Web Design Guidelines',
        description: 'Review UI code.',
        stars: 18_204,
        likes: 41,
        updatedAt: '2026-09-28T14:02:11.000Z',
        pageUrl: 'https://skilld.dev/gh/vercel-labs/agent-skills/web-design-guidelines',
        sourceUrl: 'https://github.com/vercel-labs/agent-skills/blob/abc/skills/web-design-guidelines/SKILL.md',
        runCommand: 'npx skilld run vercel-labs/agent-skills/web-design-guidelines',
        installCommand: 'npx skilld install vercel-labs/agent-skills/web-design-guidelines',
      }],
      total: 6,
    })
  })

  it('leaves out a row the contract cannot carry instead of failing the list', () => {
    const answer = presentSkillBrowse({ items: [card({ name: 'has a space' }), card()], total: 2 })

    expect(answer.items.map(item => item.name)).toEqual(['web-design-guidelines'])
    expect(skillsV1.operations.browse.response.body.producer.safeParse(answer).success).toBe(true)
  })

  it('never accepts an install-count order', () => {
    const query = skillsV1.operations.browse.request.query

    expect(query.safeParse({ sort: 'installs' }).success).toBe(false)
    expect(query.parse({})).toMatchObject({ sort: 'stars', limit: 20, offset: 0 })
  })
})

function profile(overrides: Partial<LegacyOwnerProfile> = {}): LegacyOwnerProfile {
  return {
    owner: 'vercel-labs',
    kind: 'org',
    displayName: 'Vercel Labs',
    avatar: 'https://github.com/vercel-labs.png',
    repos: [
      { repo: 'agent-skills', count: 2, stars: 18_204, description: 'Skills for AI coding agents.' },
      { repo: 'next-skills', count: 1, stars: 900, description: null },
    ],
    skills: [
      { ...card({ name: 'alpha', modifiedAt: null, registryPath: '/gh/vercel-labs/agent-skills/alpha' }), pushedAt: MODIFIED },
      { ...card({ name: 'beta', registryPath: '/gh/vercel-labs/agent-skills/beta' }), pushedAt: MODIFIED },
      { ...card({ repo: 'next-skills', name: 'next', registryPath: '/gh/vercel-labs/next-skills' }), pushedAt: MODIFIED },
    ],
    ...overrides,
  }
}

describe('owners.get', () => {
  it('lists the Repositories the Owner publishes Skills from', () => {
    const answer = presentOwner(profile())

    expect(ownersV1.operations.get.response.body.producer.parse(answer)).toEqual({
      login: 'vercel-labs',
      name: 'Vercel Labs',
      avatarUrl: 'https://github.com/vercel-labs.png',
      kind: 'organization',
      pageUrl: 'https://skilld.dev/gh/vercel-labs',
      repositories: [
        { repository: 'agent-skills', description: 'Skills for AI coding agents.', stars: 18_204, skillCount: 2, pageUrl: 'https://skilld.dev/gh/vercel-labs/agent-skills' },
        { repository: 'next-skills', description: null, stars: 900, skillCount: 1, pageUrl: 'https://skilld.dev/gh/vercel-labs/next-skills' },
      ],
    })
  })

  it('answers no name when the registry only knows the login', () => {
    const answer = presentOwner(profile({ owner: 'antfu', kind: 'user', displayName: 'antfu' }))

    expect(answer).toMatchObject({ login: 'antfu', name: null, kind: 'user' })
  })
})

describe('repositories.get', () => {
  it('lists the Repository Skills, most recent change first, and links the current GitHub home', () => {
    const owner = profile()
    const [first, ...rest] = selectRepositorySkills(owner, 'Agent-Skills')
    if (!first)
      throw new Error('expected Skills for agent-skills')
    const answer = presentRepository(owner, [first, ...rest], { owner: 'vercel', repo: 'skills' })

    expect(repositoriesV1.operations.get.response.body.producer.parse(answer)).toMatchObject({
      owner: 'vercel-labs',
      repository: 'agent-skills',
      description: 'Skills for AI coding agents.',
      stars: 18_204,
      pushedAt: '2026-09-28T14:02:11.000Z',
      repositoryUrl: 'https://github.com/vercel/skills',
      pageUrl: 'https://skilld.dev/gh/vercel-labs/agent-skills',
      installCommand: 'npx skilld add vercel-labs/agent-skills',
    })
    expect(answer.skills.map(skill => skill.name)).toEqual(['beta', 'alpha'])
  })

  it('finds nothing for a Repository the Owner profile does not hold', () => {
    expect(selectRepositorySkills(profile(), 'unknown')).toEqual([])
  })
})

describe('tracks', () => {
  it('lists each track with its line and page', () => {
    const answer = presentTrackList([{ slug: 'design', label: 'Design and interface work', userVoice: 'You care how the interface looks.', skillCount: 41 }])

    expect(tracksV1.operations.list.response.body.producer.parse(answer)).toEqual({
      items: [{ slug: 'design', label: 'Design and interface work', line: 'You care how the interface looks.', pageUrl: 'https://skilld.dev/skills/design', skillCount: 41 }],
      total: 1,
    })
  })

  it.each([
    [{ limit: 20, offset: 0 }, { pages: [1], skip: 0 }],
    [{ limit: 20, offset: 50 }, { pages: [1, 2], skip: 50 }],
    [{ limit: 60, offset: 120 }, { pages: [3], skip: 0 }],
    [{ limit: 100, offset: 59 }, { pages: [1, 2, 3], skip: 59 }],
  ])('reads the page-sized legacy pages that cover %o', (window, expected) => {
    expect(legacyTrackPages(window)).toEqual(expected)
  })

  it('answers the track and its Skills in page order', () => {
    const answer = presentTrack(
      { slug: 'design', label: 'Design and interface work', userVoice: 'You care how the interface looks.' },
      [card({ name: 'pinned' }), card()],
      41,
    )

    expect(tracksV1.operations.get.response.body.producer.parse(answer)).toMatchObject({ slug: 'design', line: 'You care how the interface looks.', total: 41 })
    expect(answer.items.map(item => item.name)).toEqual(['pinned', 'web-design-guidelines'])
  })
})

const post: LegacyTrendingPost = {
  url: 'https://x.com/ada_ships/status/1',
  authorHandle: 'ada_ships',
  authorName: 'Ada',
  text: 'This Skill caught three UI bugs.',
  postedAt: MODIFIED,
  platform: 'x',
}

function named(name: string, overrides: Partial<LegacyTrendingFeed['namedSkills'][number]> = {}): LegacyTrendingFeed['namedSkills'][number] {
  return {
    owner: 'acme',
    repo: name,
    name,
    registryPath: `/gh/acme/${name}`,
    authorCount: 0,
    mentionCount: 0,
    starGain: null,
    starGainDay: null,
    evidence: null,
    ...overrides,
  }
}

function trendingCard(name: string): SkillCardSource {
  return card({ owner: 'acme', repo: name, name, registryPath: `/gh/acme/${name}` })
}

describe('trending.list', () => {
  const feed: LegacyTrendingFeed = {
    namedSkills: [
      named('both', { authorCount: 2, mentionCount: 3, evidence: post, starGain: 812, starGainDay: 1_790_553_600 }),
      named('posted', { authorCount: 1, mentionCount: 1, evidence: post }),
      named('surged', { starGain: 140, starGainDay: 1_790_553_600 }),
      named('unexplained'),
    ],
    fallback: [
      { owner: 'acme', repo: 'surged', name: 'surged', registryPath: '/gh/acme/surged' },
      { owner: 'acme', repo: 'filler', name: 'filler', registryPath: '/gh/acme/filler' },
    ],
  }

  it('states each row\'s own reason, and ships the post for every row a post put there', () => {
    const rows = trendingBoardRows(feed)

    expect(rows.map(row => [row.skill.name, row.signal.kind])).toEqual([
      ['both', 'social-and-star-surge'],
      ['posted', 'social'],
      ['surged', 'star-surge'],
      ['filler', 'star-count'],
    ])
    expect(rows[1]!.signal).toEqual({
      kind: 'social',
      authorCount: 1,
      mentionCount: 1,
      post: {
        url: 'https://x.com/ada_ships/status/1',
        platform: 'x',
        authorHandle: 'ada_ships',
        authorName: 'Ada',
        text: 'This Skill caught three UI bugs.',
        postedAt: '2026-09-28T14:02:11.000Z',
      },
    })
    expect(rows[2]!.signal).toEqual({ kind: 'star-surge', starGain: 140, surgedOn: '2026-09-28T00:00:00.000Z' })
  })

  it('answers Skill cards for the board, sliced to the limit, counting the whole board', () => {
    const rows = trendingBoardRows(feed)
    const answer = presentTrending(rows, cardsByKey(trendingCard('both'), trendingCard('posted'), trendingCard('filler')), 2)

    expect(trendingV1.operations.list.response.body.producer.parse(answer)).toMatchObject({ total: 3 })
    expect(answer.items.map(item => [item.name, item.signal.kind])).toEqual([
      ['both', 'social-and-star-surge'],
      ['posted', 'social'],
    ])
  })

  it('accepts only the two board windows', () => {
    const query = trendingV1.operations.list.request.query

    expect(query.parse({})).toEqual({ window: 'week', limit: 30 })
    expect(query.safeParse({ window: '24' }).success).toBe(false)
    expect(query.safeParse({ limit: '31' }).success).toBe(false)
  })
})

describe('index requests', () => {
  it.each([
    ['vercel-labs/Agent-Skills', { owner: 'vercel-labs', repo: 'agent-skills' }],
    ['https://github.com/vercel-labs/agent-skills/tree/main/skills', { owner: 'vercel-labs', repo: 'agent-skills' }],
    ['https://github.com/vercel-labs/agent-skills.git', { owner: 'vercel-labs', repo: 'agent-skills' }],
  ])('reads %s as one Repository', (value, expected) => {
    expect(parseRepositoryReference(value)).toMatchObject({ _tag: 'repository', ...expected })
  })

  it.each(['https://gitlab.com/a/b', 'vercel-labs', 'https://github.com/vercel-labs'])('rejects %s', (value) => {
    expect(parseRepositoryReference(value)).toEqual({ _tag: 'not_repository' })
  })

  const repository = { _tag: 'repository' as const, owner: 'vercel-labs', repo: 'agent-skills', url: 'https://github.com/vercel-labs/agent-skills' }
  const id = '0f8b5c1e-3d4a-4f6b-9a2c-7e1d5b8c9a04'

  it('answers a queued request with the id to poll', () => {
    const answer = presentIndexRequestCreated({ _tag: 'queued', repository, jobId: id, progress: { _tag: 'queued' } }, new Map())

    expect(indexRequestsV1.operations.create.response.body.producer.parse(answer)).toEqual({
      status: 'queued',
      id,
      owner: 'vercel-labs',
      repository: 'agent-skills',
      progress: { stage: 'queued' },
    })
  })

  it('answers an indexed Repository with its Skill cards', () => {
    const indexed = {
      _tag: 'indexed' as const,
      repository,
      skills: [{ name: 'web-design-guidelines', slug: 'vercel-labs/web-design-guidelines', path: null, description: null, likeCount: 0, registryPath: '/gh/vercel-labs/agent-skills' }],
    }
    const answer = presentIndexRequestCreated(indexed, cardsByKey(card()))

    expect(indexRequestsV1.operations.create.response.body.producer.parse(answer)).toMatchObject({ status: 'indexed', owner: 'vercel-labs', repository: 'agent-skills' })
    expect(answer.status === 'indexed' && answer.skills.map(skill => skill.runCommand)).toEqual(['npx skilld run vercel-labs/agent-skills/web-design-guidelines'])
  })

  it('reports indexing progress and a failure reason while polling', () => {
    const indexing = presentIndexRequest(id, { _tag: 'queued', repository, progress: { _tag: 'indexing', indexed: 50, total: 72 } }, new Map())
    const failed = presentIndexRequest(id, { _tag: 'failed', repository, reason: 'GitHub repository was not found.' }, new Map())
    const producer = indexRequestsV1.operations.get.response.body.producer

    expect(producer.parse(indexing)).toMatchObject({ status: 'queued', id, progress: { stage: 'indexing', indexed: 50, total: 72 } })
    expect(producer.parse(failed)).toEqual({ status: 'failed', owner: 'vercel-labs', repository: 'agent-skills', reason: 'GitHub repository was not found.' })
  })
})

/**
 * A D1 stand-in that answers a Skill key lookup with one row per key it is
 * asked for, minus the keys in `missing`.
 */
function keyLookupDatabase(missing: ReadonlySet<string> = new Set()): D1Database {
  return {
    prepare: (sql: string) => ({ bind: (...args: string[]) => ({ sql, args }) }),
    batch: async (statements: { args: string[] }[]) => statements.map(({ args }) => {
      const results = []
      for (let i = 0; i < args.length; i += 3) {
        const [owner, repo, name] = args.slice(i, i + 3) as [string, string, string]
        if (missing.has(name))
          continue
        results.push({
          owner,
          repo,
          name,
          display_name: name,
          slug: `${owner}/${name}`,
          like_count: 2,
          description: null,
          stars: 10,
          modified_at: MODIFIED,
          rendered_skill_path: `skills/${name}/SKILL.md`,
          current_sha: 'abc',
          default_branch: 'main',
          source_owner: null,
          source_repo: null,
          author_name: null,
          repo_skill_count: 2,
        })
      }
      return { results }
    }),
  } as unknown as D1Database
}

/** Serves one route with the site's own routes and D1 replaced by stand-ins. */
function serveRoute(route: string, handler: EventHandler, ownRoutes: (path: string) => unknown, db = keyLookupDatabase()) {
  const fetched: string[] = []
  const app = createApp()
  app.use(eventHandler((event) => {
    event.context.platform = { requestId: 'req_test', db } as never
    Object.assign(event, {
      $fetch: async (path: string) => {
        fetched.push(path)
        return ownRoutes(path)
      },
    })
  }))
  app.use(createRouter().get(route, handler))
  const handle = toWebHandler(app)
  return {
    fetched,
    request: (path: string) => handle(new Request(`http://localhost${path}`)),
  }
}

function notFound(): never {
  throw Object.assign(new Error('[GET] 404 Not Found'), { statusCode: 404 })
}

describe('registry v1 routes', () => {
  it('answers NOT_FOUND when the Owner route has no Skills for the login', async () => {
    const server = serveRoute('/api/v1/owners/:owner', ownersGet, notFound)
    const response = await server.request('/api/v1/owners/nobody')

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND', detail: 'The registry holds no Skills from nobody.' })
    expect(server.fetched).toEqual(['/api/orgs/nobody'])
  })

  it('reads a track across the page boundary and keeps the page order', async () => {
    const page = (from: number) => ({
      cluster: { slug: 'design', label: 'Design and interface work', userVoice: 'You care how the interface looks.' },
      items: Array.from({ length: 60 }, (_, index) => ({ owner: 'acme', repo: 'kit', name: `s${from + index}` })),
      total: 130,
    })
    const server = serveRoute('/api/v1/tracks/:slug', tracksGet, path => path.endsWith('?page=2') ? page(60) : page(0), keyLookupDatabase(new Set(['s59'])))
    const response = await server.request('/api/v1/tracks/design?limit=3&offset=58')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(server.fetched).toEqual(['/api/clusters/design', '/api/clusters/design?page=2'])
    expect(body.items.map((item: { name: string }) => item.name)).toEqual(['s58', 's60'])
    expect(body).toMatchObject({ slug: 'design', total: 130 })
    expect(body.items[0]).toMatchObject({ likes: 2, sourceUrl: 'https://github.com/acme/kit/blob/main/skills/s58/SKILL.md' })
  })

  it('answers NOT_FOUND for a track the site does not have', async () => {
    const server = serveRoute('/api/v1/tracks/:slug', tracksGet, notFound)
    const response = await server.request('/api/v1/tracks/unknown')

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('reads the month board with the query the trending page sends', async () => {
    const feed: LegacyTrendingFeed = {
      namedSkills: [
        named('posted', { authorCount: 1, mentionCount: 1, evidence: post }),
        named('surged', { starGain: 140, starGainDay: 1_790_553_600 }),
      ],
      fallback: [],
    }
    const server = serveRoute('/api/v1/trending', trendingList, () => feed)
    const response = await server.request('/api/v1/trending?window=month&limit=1')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(server.fetched).toEqual(['/api/feed/trending?limit=30&window=720'])
    expect(body.total).toBe(2)
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ name: 'posted', signal: { kind: 'social', post: { authorHandle: 'ada_ships' } } })
  })
})

/** The registry tables `querySkills` and `findSkillsByKeys` read, in SQLite. */
function registryEvent(): { event: H3Event, close: () => void } {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE owners (owner TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE repos (
      owner TEXT NOT NULL, repo TEXT NOT NULL, stars INTEGER NOT NULL, pushed_at INTEGER,
      default_branch TEXT, source_owner TEXT, source_repo TEXT, broken_since INTEGER,
      repo_kind TEXT NOT NULL DEFAULT 'source', PRIMARY KEY (owner, repo)
    );
    CREATE TABLE skills (
      owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL, display_name TEXT NOT NULL,
      slug TEXT NOT NULL, like_count INTEGER NOT NULL DEFAULT 0, description TEXT,
      rendered_raw_sha256 TEXT, seo_index_score INTEGER NOT NULL DEFAULT 0,
      seo_indexable INTEGER NOT NULL DEFAULT 1, trust_tier TEXT NOT NULL DEFAULT 'untrusted',
      trust_score INTEGER NOT NULL DEFAULT 0, modified_at INTEGER, first_seen_at INTEGER,
      rendered_raw TEXT, rendered_skill_path TEXT, current_sha TEXT,
      source_resolved INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (owner, repo, name)
    );
    INSERT INTO repos (owner, repo, stars, default_branch) VALUES ('acme', 'kit', 50, 'main'), ('zed', 'tools', 900, 'main');
    INSERT INTO skills (owner, repo, name, display_name, slug, like_count, modified_at, rendered_skill_path, current_sha) VALUES
      ('acme', 'kit', 'old', 'Old', 'acme/old', 1, 100, 'skills/old/SKILL.md', 'abc'),
      ('acme', 'kit', 'undated', 'Undated', 'acme/undated', 0, NULL, NULL, NULL),
      ('acme', 'kit', 'fresh', 'Fresh', 'acme/fresh', 3, 300, 'skills/fresh/SKILL.md', 'abc'),
      ('zed', 'tools', 'fresh', 'Zed Fresh', 'zed/fresh', 0, 200, 'skills/fresh/SKILL.md', 'def');
  `)
  const prepare = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...next: unknown[]) => prepare(sql, next),
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...params) as T[], success: true, meta: {} }),
  }) as unknown as D1PreparedStatement
  const db = {
    prepare,
    batch: async <T>(statements: D1PreparedStatement[]) => Promise.all(statements.map(statement => statement.all<T>())),
  } as unknown as D1Database
  return { event: { context: { platform: { db } } } as H3Event, close: () => sqlite.close() }
}

describe('registry loaders behind v1', () => {
  it('orders by the last SKILL.md change, undated last, and pages by offset', async () => {
    const { event, close } = registryEvent()
    try {
      const all = await querySkills(event, { owner: 'acme', sort: 'updated', limit: 10, offset: 0 })
      const second = await querySkills(event, { owner: 'acme', sort: 'updated', limit: 1, offset: 1 })

      expect(all.items.map(skill => skill.name)).toEqual(['fresh', 'old', 'undated'])
      expect(second.items.map(skill => skill.name)).toEqual(['old'])
      expect(second.total).toBe(3)
    }
    finally {
      close()
    }
  })

  it('reads full registry rows for exact keys, across statements, and skips unknown keys', async () => {
    const { event, close } = registryEvent()
    try {
      const unknown = Array.from({ length: 30 }, (_, index) => ({ owner: 'nobody', repo: 'none', name: `n${index}` }))
      const found = await findSkillsByKeys(event, [...unknown, { owner: 'zed', repo: 'tools', name: 'fresh' }, { owner: 'acme', repo: 'kit', name: 'fresh' }])

      expect([...found.keys()].sort()).toEqual(['acme/kit/fresh', 'zed/tools/fresh'])
      expect(found.get('zed/tools/fresh')).toMatchObject({
        displayName: 'Zed Fresh',
        stars: 900,
        likeCount: 0,
        modifiedAt: 200,
        registryPath: '/gh/zed/tools',
        skillFileUrl: 'https://github.com/zed/tools/blob/main/skills/fresh/SKILL.md',
      })
    }
    finally {
      close()
    }
  })
})
