import type {
  accountV1,
  changesV1,
  likesV1,
  OperationResult,
  starsV1,
  tokensV1,
  watchesV1,
} from 'skilld-sdk/contract'
import type { SkillCardRef, SkillCardRow, SkillCardSource, SkillSummary } from '#shared/server/skill-cards'
import type { CliTokenListRow, IssuedCliSession } from '../utils/cli-tokens'
import type { DigestSelection } from '../utils/digest-select'
import type { LikedSkillRef } from '../utils/likes'
import type { ScanResult } from '../utils/scan-owned-repos'
import type { StarredRow, StarsImportPage } from '../utils/starred-repos'
import type { UserRow } from '../utils/users'
import type { WatchRow } from '../utils/watches'
import { epochSecondsToIso, isAnswerableSkillSummary, presentCount, presentSkillSummary, skillCardKey, skillCardSourceFromRow } from '#shared/server/skill-cards'
import { repoHubPath, repoSkillPath } from '#shared/skill-routes'
import { weeklyDeliveryActive } from '../utils/weekly-select'

const SITE_ORIGIN = 'https://skilld.dev'

export interface PageWindow {
  limit: number
  offset: number
}

function isoFromEpoch(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function pageOf<T>(items: readonly T[], page: PageWindow): T[] {
  return items.slice(page.offset, page.offset + page.limit)
}

export function presentAccount(row: UserRow): OperationResult<typeof accountV1.operations.get> {
  return {
    login: row.login,
    name: row.name,
    avatarUrl: row.avatar || null,
    pageUrl: `${SITE_ORIGIN}/@${row.login}`,
    // The dashboard shows the same address: the saved one, else GitHub's.
    email: row.digest_email?.trim() || row.email?.trim() || null,
    digest: !!row.email_opt_in,
    // Effective delivery, the gate the send uses, not the raw switch.
    weekly: weeklyDeliveryActive(row),
    likesPublic: !!row.likes_public,
    repositoryIndexing: !!row.repo_indexing,
    starsImportedAt: epochSecondsToIso(row.stars_synced_at),
  }
}

const SCAN_OUTCOMES = {
  complete: 'complete',
  partial: 'partial',
  auth_failure: 'github-auth-failure',
  rate_limited: 'github-rate-limited',
  provider_failure: 'github-failure',
} as const satisfies Record<ScanResult['_tag'], string>

export function presentRepositoryScan(result: ScanResult): OperationResult<typeof accountV1.operations.scanRepositories> {
  return {
    outcome: SCAN_OUTCOMES[result._tag],
    repositoriesFound: presentCount(result.reposFound),
    repositoriesIndexed: presentCount(result.reposSynced),
    repositoriesFailed: presentCount(result.reposFailed),
  }
}

/**
 * The card for a Skill the registry no longer holds, such as one its Owner
 * unpublished after the like. Only the reference is known, so the card links
 * the Skill's own route and no SKILL.md.
 */
function removedSkillSource(ref: SkillCardRef): SkillCardSource {
  return {
    owner: ref.owner,
    repo: ref.repo,
    name: ref.name,
    displayName: null,
    description: null,
    stars: null,
    likeCount: null,
    modifiedAt: null,
    registryPath: repoSkillPath(ref.owner, ref.repo, ref.name),
    skillFileUrl: null,
  }
}

function presentSkillRef(ref: SkillCardRef, rows: ReadonlyMap<string, SkillCardRow>): SkillSummary {
  const row = rows.get(skillCardKey(ref))
  return presentSkillSummary(row ? skillCardSourceFromRow(row) : removedSkillSource(ref))
}

export function presentLikedSkills(
  page: { refs: readonly LikedSkillRef[], total: number },
  rows: ReadonlyMap<string, SkillCardRow>,
): OperationResult<typeof likesV1.operations.list> {
  return {
    items: page.refs.map(ref => ({ ...presentSkillRef(ref, rows), likedAt: isoFromEpoch(ref.likedAt) })).filter(isAnswerableSkillSummary),
    total: presentCount(page.total),
  }
}

export function watchReason(source: string): 'direct' | 'like' | 'star-import' | 'collection' {
  if (source === 'like')
    return 'like'
  if (source === 'star-import')
    return 'star-import'
  if (source.startsWith('collection:'))
    return 'collection'
  // 'manual', and 'cli' from the v2 CLI, are both a person watching on purpose.
  return 'direct'
}

export function presentWatches(rows: readonly WatchRow[], page: PageWindow): OperationResult<typeof watchesV1.operations.list> {
  return {
    items: pageOf(rows, page).map(row => ({
      owner: row.owner,
      repository: row.repo,
      pageUrl: `${SITE_ORIGIN}${repoHubPath(row.owner, row.repo)}`,
      reason: watchReason(row.source),
      watchedAt: isoFromEpoch(row.created_at),
    })),
    total: rows.length,
  }
}

/** Starred Repositories that hold Skills now, in import order: newest star first. */
export function presentStarredRepositories(rows: readonly StarredRow[], page: PageWindow): OperationResult<typeof starsV1.operations.list> {
  const byRepository = new Map<string, { owner: string, repo: string, starredAt: number, watching: boolean, skillCount: number }>()
  for (const row of rows) {
    const key = `${row.owner}/${row.repo}`
    const entry = byRepository.get(key) ?? { owner: row.owner, repo: row.repo, starredAt: row.starred_at, watching: !!row.watching, skillCount: 0 }
    if (row.skill_name)
      entry.skillCount += 1
    byRepository.set(key, entry)
  }
  const withSkills = [...byRepository.values()]
    .filter(entry => entry.skillCount > 0)
    .sort((a, b) => b.starredAt - a.starredAt)
  return {
    items: pageOf(withSkills, page).map(entry => ({
      owner: entry.owner,
      repository: entry.repo,
      pageUrl: `${SITE_ORIGIN}${repoHubPath(entry.owner, entry.repo)}`,
      starredAt: isoFromEpoch(entry.starredAt),
      watching: entry.watching,
      skillCount: entry.skillCount,
    })),
    total: withSkills.length,
  }
}

export function presentStarsImport(result: Extract<StarsImportPage, { _tag: 'Imported' }>): OperationResult<typeof starsV1.operations.import> {
  return {
    page: result.page,
    nextPage: result.hasMore ? result.page + 1 : null,
    imported: presentCount(result.total),
    withSkills: presentCount(result.matched),
    importedAt: epochSecondsToIso(result.importedAt),
  }
}

/** Every Skill the digest selection names, as `{ owner, repo, name }`. */
export function changedSkillRefs(selection: DigestSelection): SkillCardRef[] {
  return selection.entries.flatMap(entry => entry.skills.map(skill => ({ owner: entry.owner, repo: entry.repo, name: skill.name })))
}

export function presentAccountChanges(
  selection: DigestSelection,
  rows: ReadonlyMap<string, SkillCardRow>,
): OperationResult<typeof changesV1.operations.list> {
  return {
    since: isoFromEpoch(selection.windowStart),
    until: isoFromEpoch(selection.windowEnd),
    items: selection.entries.flatMap(entry => entry.skills.map(skill => ({
      ...presentSkillRef({ owner: entry.owner, repo: entry.repo, name: skill.name }, rows),
      changedAt: isoFromEpoch(skill.changedAt),
      changeCount: presentCount(skill.changeCount),
      commitMessages: skill.commitMessages,
      changeUrl: skill.changeUrl,
    }))).filter(isAnswerableSkillSummary),
  }
}

/** Tokens that still work. A revoked or expired row cannot act, so the list leaves it out. */
export function presentTokens(
  rows: readonly CliTokenListRow[],
  input: { currentTokenId: number | null, now: number, page: PageWindow },
): OperationResult<typeof tokensV1.operations.list> {
  const live = rows.filter(row => row.revoked_at === null && (row.expires_at === null || row.expires_at > input.now))
  return {
    items: pageOf(live, input.page).map(row => ({
      id: row.id,
      label: row.device_label,
      kind: row.kind,
      createdAt: isoFromEpoch(row.created_at),
      lastUsedAt: isoFromEpoch(row.last_used_at),
      expiresAt: epochSecondsToIso(row.expires_at),
      current: row.id === input.currentTokenId,
    })),
    total: live.length,
  }
}

/** A token without `ttlDays` stores no end, so it reports none, as `tokens.list` does. */
export function presentIssuedToken(
  session: IssuedCliSession,
  input: { label: string, ttlDays: number | undefined },
): OperationResult<typeof tokensV1.operations.create> {
  return {
    id: session.tokenId,
    label: input.label,
    expiresAt: input.ttlDays ? isoFromEpoch(session.expiresAt) : null,
    token: session.accessToken,
  }
}
