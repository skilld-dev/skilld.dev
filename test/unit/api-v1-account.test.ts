import type { ApiOperationHandler } from '../../shared/server/operation'
import type { SqliteD1 } from './helpers/d1-sqlite'
import { createApp, createError, createRouter, eventHandler, readBody, toWebHandler } from 'h3'
import { accountV1, changesV1, likesV1, starsV1, tokensV1, watchesV1 } from 'skilld-sdk/contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import getAccount from '../../layers/identity/server/api/v1/account/index.get'
import updateAccount from '../../layers/identity/server/api/v1/account/index.patch'
import unlikeRoute from '../../layers/identity/server/api/v1/account/likes/[owner]/[repository]/[name].delete'
import likeRoute from '../../layers/identity/server/api/v1/account/likes/[owner]/[repository]/[name].put'
import listLikes from '../../layers/identity/server/api/v1/account/likes/index.get'
import unpublishRoute from '../../layers/identity/server/api/v1/account/repositories/[owner]/[repository].delete'
import revokeToken from '../../layers/identity/server/api/v1/account/tokens/[id].delete'
import watchRoute from '../../layers/identity/server/api/v1/account/watches/[owner]/[repository].put'
import listWatches from '../../layers/identity/server/api/v1/account/watches/index.get'
import {
  presentAccountChanges,
  presentIssuedToken,
  presentRepositoryScan,
  presentStarredRepositories,
  presentStarsImport,
  presentTokens,
  presentWatches,
} from '../../layers/identity/server/presenters/account-v1'
import { loadSkillCardRows } from '../../shared/server/skill-cards'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const resolveRequestUser = vi.hoisted(() => vi.fn())
vi.mock('../../shared/server/handler', async importOriginal => ({
  ...await importOriginal<typeof import('../../shared/server/handler')>(),
  resolveRequestUser,
}))

const NOW = new Date('2026-10-01T09:00:00.000Z')
const NOW_SEC = Math.floor(NOW.getTime() / 1000)
const OCTO = { id: 9001, login: 'octo' }

const ROUTES: ApiOperationHandler[] = [
  getAccount,
  updateAccount,
  likeRoute,
  unlikeRoute,
  listLikes,
  watchRoute,
  listWatches,
  unpublishRoute,
  revokeToken,
]

let d1: SqliteD1

function serve() {
  const app = createApp()
  app.use(eventHandler((event) => {
    event.context.platform = { db: d1.db, requestId: 'req_test' } as never
  }))
  const router = createRouter()
  for (const route of ROUTES) {
    const { method, path } = route.skilldOperation
    router.add(path.replace(/\{([^{}]+)\}/g, ':$1'), route, method.toLowerCase() as 'get')
  }
  app.use(router)
  const handle = toWebHandler(app)
  return (method: string, path: string, body?: unknown) => handle(new Request(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('readBody', readBody)
  resolveRequestUser.mockReset()
  resolveRequestUser.mockResolvedValue(OCTO)
  d1 = createSqliteD1(allMigrations())
  d1.raw.exec(`
    INSERT INTO users (id, github_id, login, email, email_opt_in, created_at, last_login_at) VALUES
      (9001, 900100, 'octo', 'octo@example.com', 0, 1, 1),
      (9002, 900200, 'other', NULL, 0, 1, 1);
    INSERT INTO repos (owner, repo, stars) VALUES ('vercel-labs', 'agent-skills', 18204), ('octo', 'skills', 3);
    INSERT INTO skills (owner, repo, name, display_name, slug, source_resolved, current_sha, rendered_skill_path, modified_at, like_count) VALUES
      ('vercel-labs', 'agent-skills', 'web-design-guidelines', 'Web Design Guidelines', 'vercel-labs/web-design-guidelines', 1, 'abc123', 'skills/web-design-guidelines/SKILL.md', 1790000000, 4),
      ('vercel-labs', 'agent-skills', 'react-best-practices', 'React Best Practices', 'vercel-labs/react-best-practices', 1, 'abc123', 'skills/react-best-practices/SKILL.md', 1790000000, 1),
      ('octo', 'skills', 'motion', 'Motion', 'octo/motion', 1, NULL, NULL, NULL, 0);
  `)
})

afterEach(() => {
  d1.close()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('account.update', () => {
  it('turns the weekly on with the GitHub address, which then counts as consent', async () => {
    const fetch = serve()
    const before = await (await fetch('GET', '/api/v1/account')).json()
    const response = await fetch('PATCH', '/api/v1/account', { weekly: true })

    expect(before).toMatchObject({ email: 'octo@example.com', weekly: false })
    expect(response.status).toBe(200)
    expect(accountV1.operations.update.response.body.producer.parse(await response.json()))
      .toMatchObject({ email: 'octo@example.com', weekly: true, digest: false, pageUrl: 'https://skilld.dev/@octo' })
  })

  it('refuses to turn an email on for an account with no address, and saves nothing', async () => {
    resolveRequestUser.mockResolvedValue({ id: 9002, login: 'other' })
    const response = await serve()('PATCH', '/api/v1/account', { digest: true, likesPublic: false })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(d1.raw.prepare(`SELECT email_opt_in, likes_public FROM users WHERE id = 9002`).get())
      .toEqual({ email_opt_in: 0, likes_public: 1 })
  })

  it('changes only the settings it names', async () => {
    d1.raw.exec(`UPDATE users SET email_opt_in = 1, digest_email = 'saved@example.com' WHERE id = 9001`)
    const response = await serve()('PATCH', '/api/v1/account', { likesPublic: false })

    expect(await response.json()).toMatchObject({ likesPublic: false, digest: true, weekly: true, email: 'saved@example.com' })
  })

  it.each([{}, { email: 'not-an-address' }, { cadence: 'daily' }])('rejects the body %j', async (body) => {
    const response = await serve()('PATCH', '/api/v1/account', body)

    expect(response.status).toBe(400)
  })
})

describe('likes', () => {
  it('likes a Skill, watches its Repository, and lists it as a Skill card', async () => {
    const fetch = serve()
    const put = await fetch('PUT', '/api/v1/account/likes/vercel-labs/agent-skills/web-design-guidelines')
    const watches = await (await fetch('GET', '/api/v1/account/watches')).json()
    const likes = likesV1.operations.list.response.body.producer.parse(await (await fetch('GET', '/api/v1/account/likes')).json())

    expect(put.status).toBe(204)
    expect(watches.items).toEqual([expect.objectContaining({ owner: 'vercel-labs', repository: 'agent-skills', reason: 'like' })])
    expect(likes).toEqual({
      items: [{
        owner: 'vercel-labs',
        repository: 'agent-skills',
        name: 'web-design-guidelines',
        displayName: 'Web Design Guidelines',
        description: null,
        stars: 18204,
        likes: 4,
        updatedAt: '2026-09-21T14:13:20.000Z',
        pageUrl: 'https://skilld.dev/gh/vercel-labs/agent-skills/web-design-guidelines',
        sourceUrl: 'https://github.com/vercel-labs/agent-skills/blob/abc123/skills/web-design-guidelines/SKILL.md',
        runCommand: 'npx skilld run vercel-labs/agent-skills/web-design-guidelines',
        installCommand: 'npx skilld install vercel-labs/agent-skills/web-design-guidelines',
        likedAt: NOW.toISOString(),
      }],
      total: 1,
    })
  })

  it('answers NOT_FOUND for a Skill the registry does not hold, and likes nothing', async () => {
    const response = await serve()('PUT', '/api/v1/account/likes/vercel-labs/agent-skills/invented')

    expect(response.status).toBe(404)
    expect(d1.raw.prepare(`SELECT COUNT(*) AS n FROM skill_likes`).get()).toEqual({ n: 0 })
  })

  it('keeps a watch made on purpose after the like that started it goes', async () => {
    const fetch = serve()
    await fetch('PUT', '/api/v1/account/likes/vercel-labs/agent-skills/web-design-guidelines')
    await fetch('PUT', '/api/v1/account/watches/vercel-labs/agent-skills')
    await fetch('DELETE', '/api/v1/account/likes/vercel-labs/agent-skills/web-design-guidelines')
    const watches = await (await fetch('GET', '/api/v1/account/watches')).json()

    expect(watches.items).toEqual([expect.objectContaining({ repository: 'agent-skills', reason: 'direct' })])
  })

  it('removes the watch a like added when the like goes', async () => {
    const fetch = serve()
    await fetch('PUT', '/api/v1/account/likes/vercel-labs/agent-skills/web-design-guidelines')
    await fetch('DELETE', '/api/v1/account/likes/vercel-labs/agent-skills/web-design-guidelines')

    expect(await (await fetch('GET', '/api/v1/account/watches')).json()).toEqual({ items: [], total: 0 })
  })

  it('lists a liked Skill the registry no longer holds by its reference alone', async () => {
    d1.raw.exec(`INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (9001, 'gone', 'repo', 'old-skill', ${NOW_SEC})`)
    const likes = likesV1.operations.list.response.body.producer.parse(await (await serve()('GET', '/api/v1/account/likes')).json())

    expect(likes.items[0]).toMatchObject({ name: 'old-skill', displayName: 'old-skill', sourceUrl: null, pageUrl: 'https://skilld.dev/gh/gone/repo/old-skill' })
  })
})

describe('watches.create', () => {
  it('answers NOT_FOUND for a Repository the registry does not hold', async () => {
    const response = await serve()('PUT', '/api/v1/account/watches/nobody/nothing')

    expect(response.status).toBe(404)
    expect(d1.raw.prepare(`SELECT COUNT(*) AS n FROM skill_subscriptions`).get()).toEqual({ n: 0 })
  })
})

describe('account.repositories.unpublish', () => {
  it('refuses a Repository another Owner holds', async () => {
    const response = await serve()('DELETE', '/api/v1/account/repositories/vercel-labs/agent-skills')

    expect(response.status).toBe(403)
    expect(d1.raw.prepare(`SELECT COUNT(*) AS n FROM skills WHERE owner = 'vercel-labs'`).get()).toEqual({ n: 2 })
  })

  it('removes the Skills of your own Repository, whatever the login case', async () => {
    const response = await serve()('DELETE', '/api/v1/account/repositories/Octo/skills')

    expect(response.status).toBe(204)
    expect(d1.raw.prepare(`SELECT COUNT(*) AS n FROM skills WHERE owner = 'octo'`).get()).toEqual({ n: 0 })
  })
})

describe('tokens.revoke', () => {
  beforeEach(() => {
    d1.raw.exec(`
      INSERT INTO cli_tokens (id, user_id, refresh_hash, kind, scopes, created_at, last_used_at) VALUES
        (10, 9001, 'hash-own', 'pat', 'cli', 1, 1),
        (20, 9002, 'hash-other', 'pat', 'cli', 1, 1);
    `)
  })

  it('answers NOT_FOUND for another account\'s token and leaves it working', async () => {
    const response = await serve()('DELETE', '/api/v1/account/tokens/20')

    expect(response.status).toBe(404)
    expect(d1.raw.prepare(`SELECT revoked_at FROM cli_tokens WHERE id = 20`).get()).toEqual({ revoked_at: null })
  })

  it('revokes your own token, and a second revoke keeps the first time', async () => {
    const fetch = serve()
    const first = await fetch('DELETE', '/api/v1/account/tokens/10')
    vi.setSystemTime(new Date(NOW.getTime() + 60_000))
    const second = await fetch('DELETE', '/api/v1/account/tokens/10')

    expect([first.status, second.status]).toEqual([204, 204])
    expect(d1.raw.prepare(`SELECT revoked_at FROM cli_tokens WHERE id = 10`).get()).toEqual({ revoked_at: NOW_SEC })
  })
})

describe('presentTokens', () => {
  const base = { kind: 'pat' as const, device_label: 'laptop', cli_version: null, scopes: 'cli', created_at: NOW_SEC - 100, last_used_at: NOW_SEC - 10 }

  it('lists only tokens that still work and marks the one that sent the request', () => {
    const answer = presentTokens([
      { ...base, id: 1, expires_at: null, revoked_at: null },
      { ...base, id: 2, expires_at: NOW_SEC - 1, revoked_at: null },
      { ...base, id: 3, expires_at: null, revoked_at: NOW_SEC - 5 },
      { ...base, id: 4, kind: 'oidc', device_label: null, expires_at: NOW_SEC + 3600, revoked_at: null },
    ], { currentTokenId: 4, now: NOW_SEC, page: { limit: 50, offset: 0 } })

    expect(tokensV1.operations.list.response.body.producer.parse(answer).items.map(token => [token.id, token.current]))
      .toEqual([[1, false], [4, true]])
    expect(answer.total).toBe(2)
  })
})

describe('presentIssuedToken', () => {
  const session = { tokenId: 7, accessToken: 'jwt', expiresAt: NOW_SEC + 86400, scopes: 'cli', userId: 1 }

  it.each([
    [undefined, null],
    [1, '2026-10-02T09:00:00.000Z'],
  ])('reports ttlDays %s as the end %s', (ttlDays, expiresAt) => {
    const answer = tokensV1.operations.create.response.body.producer.parse(presentIssuedToken(session, { label: 'ci', ttlDays }))

    expect(answer).toEqual({ id: 7, label: 'ci', expiresAt, token: 'jwt' })
  })
})

describe('presentWatches', () => {
  it.each([
    ['manual', 'direct'],
    ['cli', 'direct'],
    ['like', 'like'],
    ['star-import', 'star-import'],
    ['collection:nuxt', 'collection'],
  ])('names a watch with source %s as %s', (source, reason) => {
    const answer = presentWatches([{ owner: 'nuxt', repo: 'ui', source, muted_until: null, created_at: NOW_SEC }], { limit: 50, offset: 0 })

    expect(watchesV1.operations.list.response.body.producer.parse(answer).items[0]?.reason).toBe(reason)
  })

  it('pages the list and counts every watch', () => {
    const rows = ['a', 'b', 'c'].map(repo => ({ owner: 'nuxt', repo, source: 'manual', muted_until: null, created_at: NOW_SEC }))

    const answer = presentWatches(rows, { limit: 1, offset: 1 })

    expect(answer.items.map(item => item.repository)).toEqual(['b'])
    expect(answer.total).toBe(3)
  })
})

describe('presentStarredRepositories', () => {
  it('keeps starred Repositories that hold Skills, counts their Skills, newest star first', () => {
    const row = { has_skill: 1, watching: 0, skill_display: null, skill_slug: null }
    const answer = presentStarredRepositories([
      { ...row, owner: 'nuxt', repo: 'ui', starred_at: 100, skill_name: 'tailwind-v4' },
      { ...row, owner: 'nuxt', repo: 'ui', starred_at: 100, skill_name: 'nuxt-ui' },
      { ...row, owner: 'vercel-labs', repo: 'agent-skills', starred_at: 200, watching: 1, skill_name: 'web-design-guidelines' },
      { ...row, owner: 'someone', repo: 'skill-ideas', starred_at: 300, has_skill: 0, skill_name: null },
    ], { limit: 50, offset: 0 })

    expect(starsV1.operations.list.response.body.producer.parse(answer)).toEqual({
      items: [
        { owner: 'vercel-labs', repository: 'agent-skills', pageUrl: 'https://skilld.dev/gh/vercel-labs/agent-skills', starredAt: '1970-01-01T00:03:20.000Z', watching: true, skillCount: 1 },
        { owner: 'nuxt', repository: 'ui', pageUrl: 'https://skilld.dev/gh/nuxt/ui', starredAt: '1970-01-01T00:01:40.000Z', watching: false, skillCount: 2 },
      ],
      total: 2,
    })
  })
})

describe('presentStarsImport', () => {
  it.each([
    [{ page: 3, hasMore: true, importedAt: null }, { nextPage: 4, importedAt: null }],
    [{ page: 4, hasMore: false, importedAt: NOW_SEC }, { nextPage: null, importedAt: NOW.toISOString() }],
  ])('points at the next page until the import ends', (page, expected) => {
    const answer = presentStarsImport({ _tag: 'Imported', fetched: 2, total: 9, matched: 4, ...page })

    expect(starsV1.operations.import.response.body.producer.parse(answer)).toEqual({ page: page.page, imported: 9, withSkills: 4, ...expected })
  })
})

describe('presentRepositoryScan', () => {
  it('names a GitHub rate limit as a GitHub outcome', () => {
    const counts = {
      hits: 0,
      ownersScanned: 1,
      orgsScanned: 0,
      orgLookupError: null,
      reposFound: 5,
      reposSynced: 2,
      reposVerifiedOnly: 0,
      reposRejected: 0,
      reposFailed: 1,
      reposClaimedElsewhere: 0,
      reposAlreadyProcessed: 0,
      reposExhausted: 0,
      reposDeferred: 0,
      reposCandidateMissing: 0,
      reposCandidateStateFailed: 0,
    }
    const answer = presentRepositoryScan({ _tag: 'rate_limited', status: 403, rateLimitRemaining: 0, rateLimitReset: null, requestId: null, ...counts })

    expect(accountV1.operations.scanRepositories.response.body.producer.parse(answer))
      .toEqual({ outcome: 'github-rate-limited', repositoriesFound: 5, repositoriesIndexed: 2, repositoriesFailed: 1 })
  })
})

describe('changes', () => {
  it('reads Skill cards for more Skills than D1 allows bound parameters', async () => {
    const refs = Array.from({ length: 40 }, (_, index) => ({ owner: 'vercel-labs', repo: 'agent-skills', name: `missing-${index}` }))

    const rows = await loadSkillCardRows(d1.db, [...refs, { owner: 'vercel-labs', repo: 'agent-skills', name: 'web-design-guidelines' }])

    expect([...rows.keys()]).toEqual(['vercel-labs/agent-skills/web-design-guidelines'])
  })

  it('answers one Skill card per changed Skill, with the window to resume from', async () => {
    const skill = { owner: 'vercel-labs', repo: 'agent-skills', name: 'web-design-guidelines' }
    const selection = {
      user: { id: 9001, login: 'octo', digest_email: null, email: null, email_opt_in: 0, onboarded_at: null },
      windowStart: NOW_SEC - 86400,
      windowEnd: NOW_SEC,
      cursorStart: 0,
      cursorEnd: 9,
      entries: [{
        owner: skill.owner,
        repo: skill.repo,
        skillNames: [skill.name],
        changeCount: 2,
        skills: [{
          name: skill.name,
          description: null,
          changeCount: 2,
          commitMessages: ['docs: add focus ring rules'],
          changedAt: NOW_SEC - 60,
          sourceUrl: 'https://github.com/vercel-labs/agent-skills/blob/abc123/skills/web-design-guidelines/SKILL.md',
          changeUrl: 'https://github.com/vercel-labs/agent-skills/commit/abc123',
        }],
      }],
    }

    const answer = changesV1.operations.list.response.body.producer.parse(
      presentAccountChanges(selection, await loadSkillCardRows(d1.db, [skill])),
    )

    expect(answer).toMatchObject({
      since: '2026-09-30T09:00:00.000Z',
      until: NOW.toISOString(),
      items: [{
        name: 'web-design-guidelines',
        displayName: 'Web Design Guidelines',
        changedAt: '2026-10-01T08:59:00.000Z',
        changeCount: 2,
        commitMessages: ['docs: add focus ring rules'],
        changeUrl: 'https://github.com/vercel-labs/agent-skills/commit/abc123',
      }],
    })
  })
})
