import type { collectionsV1, curatorsV1, OperationResult } from 'skilld-sdk/contract'
import type { SkillCardRow } from '#shared/server/skill-cards'
import type { CollectionEntryRef, CollectionPage, CuratorProfileRow } from '../utils/collections'
import type { CommunityDirectoryItem } from '../utils/community'
import type { CollectionListRow } from './collection'
import { SKILLD_V1_ORIGIN } from 'skilld-sdk/contract'
import { isAnswerableSkillSummary, presentCount, presentSkillSummary, skillCardKey, skillCardSourceFromRow } from '#shared/server/skill-cards'
import { collectionInstallCmd, curatorInstallCmd } from '#shared/skill-commands'

export interface PageWindow {
  limit: number
  offset: number
}

export function pageWindow<T>(items: readonly T[], window: PageWindow): T[] {
  return items.slice(window.offset, window.offset + window.limit)
}

/** Seeded accounts can hold an empty avatar. The contract answers a URL or null. */
function httpUrlOrNull(value: string | null): string | null {
  if (!value || !URL.canParse(value))
    return null
  const { protocol } = new URL(value)
  return protocol === 'https:' || protocol === 'http:' ? value : null
}

function curatorPageUrl(login: string): string {
  return `${SKILLD_V1_ORIGIN}/@${login}`
}

function collectionPageUrl(login: string, slug: string): string {
  return `${SKILLD_V1_ORIGIN}/@${login}/${slug}`
}

/**
 * Pairs each entry with its registry summary, in entry order. An entry with
 * no summary drops out: its Skill left the registry between the two reads.
 */
function withSummaries<T extends CollectionEntryRef>(entries: readonly T[], rows: ReadonlyMap<string, SkillCardRow>): Array<[T, SkillCardRow]> {
  return entries.flatMap((entry) => {
    const row = entry.name === null ? undefined : rows.get(skillCardKey({ ...entry, name: entry.name }))
    return row ? [[entry, row] as [T, SkillCardRow]] : []
  })
}

export function presentCollectionSkill(row: SkillCardRow, reason: string | null): OperationResult<typeof collectionsV1.operations.addSkill> {
  return { ...presentSkillSummary(skillCardSourceFromRow(row)), reason }
}

/** `entries` is the page, `total` counts the whole list. */
export function presentSkillPage(
  entries: readonly CollectionEntryRef[],
  rows: ReadonlyMap<string, SkillCardRow>,
  total: number,
): OperationResult<typeof curatorsV1.operations.likes> {
  return {
    items: withSummaries(entries, rows).map(([, row]) => presentSkillSummary(skillCardSourceFromRow(row))).filter(isAnswerableSkillSummary),
    total: presentCount(total),
  }
}

export function presentCollection(page: CollectionPage): OperationResult<typeof collectionsV1.operations.get> {
  const { collection } = page
  return {
    slug: collection.slug,
    title: collection.name,
    description: collection.preamble,
    pageUrl: collectionPageUrl(collection.author_login, collection.slug),
    installCommand: collectionInstallCmd(collection.author_login, collection.slug),
    curator: {
      login: collection.author_login,
      name: collection.author_name,
      avatarUrl: httpUrlOrNull(collection.author_avatar),
    },
    skills: {
      items: withSummaries(page.entries, page.summaries).map(([entry, row]) => presentCollectionSkill(row, entry.reason)).filter(isAnswerableSkillSummary),
      total: presentCount(page.total),
    },
  }
}

export function presentCurator(profile: CuratorProfileRow, collections: readonly CollectionListRow[]): OperationResult<typeof curatorsV1.operations.get> {
  return {
    login: profile.login,
    name: profile.name,
    avatarUrl: httpUrlOrNull(profile.avatar),
    pageUrl: curatorPageUrl(profile.login),
    installCommand: curatorInstallCmd(profile.login),
    collections: collections.map(collection => ({
      slug: collection.slug,
      title: collection.name,
      description: collection.preamble,
      pageUrl: collectionPageUrl(profile.login, collection.slug),
      installCommand: collectionInstallCmd(profile.login, collection.slug),
      skillCount: presentCount(collection.skill_count),
    })),
  }
}

/**
 * The directory answers a fixed list, so `total` counts that list. Its own
 * `total` counts every curator, also the ones past the list, which no page
 * can reach.
 */
export function presentCuratorDirectory(
  directory: { items: readonly CommunityDirectoryItem[] },
  window: PageWindow,
): OperationResult<typeof curatorsV1.operations.list> {
  return {
    items: pageWindow(directory.items, window).map(curator => ({
      login: curator.login,
      name: curator.name,
      avatarUrl: httpUrlOrNull(curator.avatar),
      pageUrl: curatorPageUrl(curator.login),
      collectionCount: presentCount(curator.collectionCount),
    })),
    total: directory.items.length,
  }
}
