import { z } from 'zod'

const repositoryIdentitySchema = z.object({
  id: z.number().int().positive().safe(),
  name: z.string().min(1).max(100),
  private: z.literal(true),
  owner: z.object({
    id: z.number().int().positive().safe(),
    login: z.string().min(1).max(100),
  }).strict(),
}).strict()

const installationWebhookSchema = z.object({
  action: z.enum(['created', 'deleted', 'suspend', 'suspended', 'unsuspend', 'unsuspended']),
  installation: z.object({ id: z.number().int().positive().safe() }).passthrough(),
}).passthrough()

const installationRepositoriesWebhookSchema = z.object({
  action: z.enum(['added', 'removed']),
  installation: z.object({ id: z.number().int().positive().safe() }).passthrough(),
  repositories_added: z.array(repositoryIdentitySchema).max(500).optional(),
  repositories_removed: z.array(z.object({ id: z.number().int().positive().safe() }).passthrough()).max(500).optional(),
}).passthrough()

export interface PrivateRepositoryAccess {
  _tag: 'allowed'
  accountId: number
  installationId: number
  repositoryId: number
  owner: string
  repository: string
}

export type PrivateRepositoryAccessResult = PrivateRepositoryAccess | { _tag: 'not-found' }

export async function findPrivateRepositoryAccess(
  db: D1Database,
  accountId: number,
  owner: string,
  repository: string,
): Promise<PrivateRepositoryAccessResult> {
  const row = await db.prepare(
    `SELECT i.account_id, i.installation_id, r.repository_id, r.owner, r.repository
     FROM github_app_installations i
     JOIN github_app_repositories r ON r.installation_id = i.installation_id
     WHERE i.account_id = ?1
       AND i.state = 'active'
       AND i.revoked_at IS NULL
       AND r.owner = ?2 COLLATE NOCASE
       AND r.repository = ?3 COLLATE NOCASE
       AND r.visibility = 'private'
       AND r.state = 'selected'
       AND r.revoked_at IS NULL
     LIMIT 1`,
  ).bind(accountId, owner, repository).first<{
    account_id: number
    installation_id: number
    repository_id: number
    owner: string
    repository: string
  }>()
  if (!row)
    return { _tag: 'not-found' }
  return {
    _tag: 'allowed',
    accountId: row.account_id,
    installationId: row.installation_id,
    repositoryId: row.repository_id,
    owner: row.owner,
    repository: row.repository,
  }
}

export async function canReadPrivateResolution(
  db: D1Database,
  accountId: number,
  resolutionId: string,
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS allowed
     FROM artifact_resolutions ar
     JOIN github_app_installations i
       ON i.installation_id = ar.github_installation_id
       AND i.account_id = ar.account_id
     JOIN github_app_repositories r
       ON r.installation_id = i.installation_id
       AND r.repository_id = ar.repository_id
     WHERE ar.id = ?1
       AND ar.visibility = 'private'
       AND ar.account_id = ?2
       AND i.state = 'active'
       AND i.revoked_at IS NULL
       AND r.state = 'selected'
       AND r.revoked_at IS NULL
     LIMIT 1`,
  ).bind(resolutionId, accountId).first<{ allowed: number }>()
  return row?.allowed === 1
}

export interface ConnectedGithubInstallation {
  installationId: number
  githubAccountId: number
  repositories: Array<z.infer<typeof repositoryIdentitySchema>>
}

export async function connectGithubInstallation(
  db: D1Database,
  accountId: number,
  connection: ConnectedGithubInstallation,
  now: number,
): Promise<
  { _tag: 'connected', installationId: number, repositoryCount: number, state: 'active' }
  | { _tag: 'not-found' }
> {
  const repositories = z.array(repositoryIdentitySchema).max(500).parse(connection.repositories)
  const existing = await db.prepare(
    `SELECT account_id
     FROM github_app_installations
     WHERE installation_id = ?1
     LIMIT 1`,
  ).bind(connection.installationId).first<{ account_id: number }>()
  if (existing && existing.account_id !== accountId)
    return { _tag: 'not-found' }
  const selectedIds = repositories.map(repository => repository.id)
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO github_app_installations (
         installation_id, account_id, github_account_id, state,
         connected_at, verified_at, revoked_at
       ) VALUES (?1, ?2, ?3, 'active', ?4, ?4, NULL)
       ON CONFLICT(installation_id) DO UPDATE SET
         account_id = excluded.account_id,
         github_account_id = excluded.github_account_id,
         state = 'active',
         verified_at = excluded.verified_at,
         revoked_at = NULL`,
    ).bind(connection.installationId, accountId, connection.githubAccountId, now),
    db.prepare(
      `UPDATE github_app_repositories
       SET state = 'revoked', revoked_at = ?1
       WHERE installation_id = ?2
         AND state = 'selected'
         ${selectedIds.length ? `AND repository_id NOT IN (${selectedIds.map((_, index) => `?${index + 3}`).join(', ')})` : ''}`,
    ).bind(now, connection.installationId, ...selectedIds),
    ...repositories.map(repository => db.prepare(
      `INSERT INTO github_app_repositories (
         installation_id, repository_id, owner, repository,
         visibility, state, selected_at, revoked_at
       ) VALUES (?1, ?2, ?3, ?4, 'private', 'selected', ?5, NULL)
       ON CONFLICT(installation_id, repository_id) DO UPDATE SET
         owner = excluded.owner,
         repository = excluded.repository,
         visibility = 'private',
         state = 'selected',
         selected_at = excluded.selected_at,
         revoked_at = NULL`,
    ).bind(
      connection.installationId,
      repository.id,
      repository.owner.login,
      repository.name,
      now,
    )),
  ]
  await db.batch(statements)
  return {
    _tag: 'connected',
    installationId: connection.installationId,
    repositoryCount: repositories.length,
    state: 'active',
  }
}

export type GithubAppWebhookResult
  = { _tag: 'processed' | 'duplicate' | 'ignored' }
    | { _tag: 'invalid' }

export async function processGithubAppWebhook(
  db: D1Database,
  input: { deliveryId: string, event: string, payload: unknown, now: number },
): Promise<GithubAppWebhookResult> {
  if (!/^[A-Z0-9-]{1,100}$/i.test(input.deliveryId) || input.event.length > 100)
    return { _tag: 'invalid' }
  const installation = input.event === 'installation'
    ? installationWebhookSchema.safeParse(input.payload)
    : null
  const repositoryChange = input.event === 'installation_repositories'
    ? installationRepositoriesWebhookSchema.safeParse(input.payload)
    : null
  if (installation && !installation.success)
    return { _tag: 'invalid' }
  if (repositoryChange && !repositoryChange.success)
    return { _tag: 'invalid' }
  const claimed = await db.prepare(
    `INSERT OR IGNORE INTO github_app_webhook_deliveries
       (delivery_id, event, action, received_at)
     VALUES (?1, ?2, ?3, ?4)`,
  ).bind(
    input.deliveryId,
    input.event,
    webhookAction(input.payload),
    input.now,
  ).run()
  if (Number(claimed.meta.changes) !== 1)
    return { _tag: 'duplicate' }

  if (input.event === 'installation') {
    const data = installation!.data
    if (data.action === 'deleted' || data.action === 'suspend' || data.action === 'suspended') {
      await revokeInstallation(db, data.installation.id, input.now, data.action === 'deleted' ? 'revoked' : 'suspended')
      return { _tag: 'processed' }
    }
    if (data.action === 'unsuspend' || data.action === 'unsuspended') {
      await db.prepare(
        `UPDATE github_app_installations
         SET state = 'active', verified_at = ?1, revoked_at = NULL
         WHERE installation_id = ?2 AND state = 'suspended'`,
      ).bind(input.now, data.installation.id).run()
      return { _tag: 'processed' }
    }
    return { _tag: 'ignored' }
  }

  if (input.event === 'installation_repositories') {
    const data = repositoryChange!.data
    const installationId = data.installation.id
    if (data.action === 'removed') {
      const repositoryIds = (data.repositories_removed ?? []).map(repository => repository.id)
      await revokeRepositories(db, installationId, repositoryIds, input.now)
      return { _tag: 'processed' }
    }
    const installation = await db.prepare(
      `SELECT account_id FROM github_app_installations
       WHERE installation_id = ?1 AND state = 'active'`,
    ).bind(installationId).first<{ account_id: number }>()
    if (!installation)
      return { _tag: 'ignored' }
    const repositories = data.repositories_added ?? []
    if (repositories.length > 0) {
      await db.batch(repositories.map(repository => db.prepare(
        `INSERT INTO github_app_repositories (
           installation_id, repository_id, owner, repository,
           visibility, state, selected_at, revoked_at
         ) VALUES (?1, ?2, ?3, ?4, 'private', 'selected', ?5, NULL)
         ON CONFLICT(installation_id, repository_id) DO UPDATE SET
           owner = excluded.owner,
           repository = excluded.repository,
           state = 'selected',
           selected_at = excluded.selected_at,
           revoked_at = NULL`,
      ).bind(installationId, repository.id, repository.owner.login, repository.name, input.now)))
    }
    return { _tag: 'processed' }
  }

  return { _tag: 'ignored' }
}

async function revokeInstallation(
  db: D1Database,
  installationId: number,
  now: number,
  state: 'suspended' | 'revoked',
): Promise<void> {
  await db.batch([
    db.prepare(
      `UPDATE github_app_installations
       SET state = ?1, revoked_at = ?2
       WHERE installation_id = ?3`,
    ).bind(state, now, installationId),
    db.prepare(
      `UPDATE github_app_repositories
       SET state = 'revoked', revoked_at = ?1
       WHERE installation_id = ?2`,
    ).bind(now, installationId),
    ...revocationStatements(db, installationId, null, now),
  ])
}

async function revokeRepositories(
  db: D1Database,
  installationId: number,
  repositoryIds: number[],
  now: number,
): Promise<void> {
  if (repositoryIds.length === 0)
    return
  for (const repositoryId of repositoryIds) {
    await db.batch([
      db.prepare(
        `UPDATE github_app_repositories
         SET state = 'revoked', revoked_at = ?1
         WHERE installation_id = ?2 AND repository_id = ?3`,
      ).bind(now, installationId, repositoryId),
      ...revocationStatements(db, installationId, repositoryId, now),
    ])
  }
}

function revocationStatements(
  db: D1Database,
  installationId: number,
  repositoryId: number | null,
  now: number,
): D1PreparedStatement[] {
  const repositoryClause = repositoryId === null ? '' : ' AND repository_id = ?3'
  const values = repositoryId === null ? [now, installationId] : [now, installationId, repositoryId]
  return [
    db.prepare(
      `UPDATE artifact_resolutions
       SET state = 'revoked', error_code = 'ARTIFACT_REVOKED',
           state_version = state_version + 1, updated_at = ?1
       WHERE github_installation_id = ?2${repositoryClause}
         AND visibility = 'private'
         AND state NOT IN ('blocked', 'failed', 'revoked')`,
    ).bind(...values),
    db.prepare(
      `UPDATE private_artifacts
       SET delivery_status = 'revoked', updated_at = ?1
       WHERE resolution_id IN (
         SELECT id FROM artifact_resolutions
         WHERE github_installation_id = ?2${repositoryClause}
       )`,
    ).bind(...values),
    db.prepare(
      `UPDATE artifact_download_grants
       SET revoked_at = ?1
       WHERE resolution_id IN (
         SELECT id FROM artifact_resolutions
         WHERE github_installation_id = ?2${repositoryClause}
       ) AND revoked_at IS NULL`,
    ).bind(...values),
  ]
}

function webhookAction(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null)
    return 'unknown'
  const action = (payload as Record<string, unknown>).action
  return typeof action === 'string' ? action.slice(0, 100) : 'unknown'
}
