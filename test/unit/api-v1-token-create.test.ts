import type { SqliteD1 } from './helpers/d1-sqlite'
import { createApp, createError, eventHandler, readBody, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import createToken from '../../layers/identity/server/api/v1/account/tokens/index.post'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const resolveRequestUser = vi.hoisted(() => vi.fn())
vi.mock('../../shared/server/handler', async importOriginal => ({
  ...await importOriginal<typeof import('../../shared/server/handler')>(),
  resolveRequestUser,
}))
const issuePersonalToken = vi.hoisted(() => vi.fn())
vi.mock('../../layers/identity/server/utils/cli-tokens', async importOriginal => ({
  ...await importOriginal<typeof import('../../layers/identity/server/utils/cli-tokens')>(),
  issuePersonalToken,
}))

let d1: SqliteD1

/** Serves the route as a request authenticated by `callerTokenId`, or by a sign-in cookie when it is undefined. */
function create(callerTokenId: number | undefined) {
  const app = createApp()
  app.use(eventHandler((event) => {
    event.context.platform = { db: d1.db, requestId: 'req_test' } as never
    if (callerTokenId !== undefined)
      event.context.cliTokenId = callerTokenId
  }))
  app.use('/api/v1/account/tokens', createToken)
  return toWebHandler(app)(new Request('http://localhost/api/v1/account/tokens', {
    method: 'POST',
    body: JSON.stringify({ label: 'deploy' }),
    headers: { 'content-type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('readBody', readBody)
  resolveRequestUser.mockResolvedValue({ id: 9001, login: 'octo' })
  issuePersonalToken.mockReset()
  issuePersonalToken.mockResolvedValue({ tokenId: 77, accessToken: 'jwt', expiresAt: 4_000_000_000, scopes: 'cli', userId: 9001 })
  d1 = createSqliteD1(allMigrations())
  d1.raw.exec(`
    INSERT INTO users (id, github_id, login, created_at, last_login_at) VALUES (9001, 900100, 'octo', 1, 1);
    INSERT INTO cli_tokens (id, user_id, refresh_hash, kind, scopes, created_at, last_used_at) VALUES
      (1, 9001, 'hash-ci', 'oidc', 'cli', 1, 1),
      (2, 9001, 'hash-cli', 'oauth', 'cli', 1, 1);
  `)
})

afterEach(() => {
  d1.close()
  vi.unstubAllGlobals()
})

describe('tokens.create', () => {
  it('refuses a GitHub Actions token, so a workflow cannot keep access after its job', async () => {
    const response = await create(1)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' })
    expect(issuePersonalToken).not.toHaveBeenCalled()
  })

  it('creates a token for a signed-in CLI', async () => {
    const response = await create(2)

    expect(response.status).toBe(201)
    expect(issuePersonalToken).toHaveBeenCalledWith(expect.anything(), 9001, { label: 'deploy', ttlDays: undefined })
  })

  it('creates a token for a browser sign-in', async () => {
    expect((await create(undefined)).status).toBe(201)
  })
})
