import type { SkillCardRef, SkillCardRow } from '#shared/server/skill-cards'
/// <reference types="@cloudflare/workers-types" />
import type { CollectionDetailRow, CollectionListRow, CollectionSkillRow } from '../presenters/collection'
import { loadSkillCardRows } from '#shared/server/skill-cards'
import { enqueueSkillDirtyStatement } from './skill-dirty'

/**
 * Collection reads and writes. The site routes under `/api/collections` and
 * the public `/api/v1` operations both call these, so both answer from the
 * same SQL.
 */

/** One Skill as a collection stores it. A null name names the whole Repository. */
export interface CollectionEntryRef {
  owner: string
  repo: string
  name: string | null
}

/** One exact Skill. */
export type ExactSkillRef = SkillCardRef

export interface CollectionEntry {
  position: number
  reason: string | null
}

export interface CollectionDetail {
  collection: CollectionDetailRow
  /** The entries the registry can show now, in the curator's order. */
  skills: CollectionSkillRow[]
}

export interface CuratorProfileRow {
  login: string
  name: string | null
  avatar: string | null
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function touchCollectionStatement(db: D1Database, collectionId: number): D1PreparedStatement {
  return db.prepare(`UPDATE collections_v2 SET updated_at = ? WHERE id = ?`).bind(nowSeconds(), collectionId)
}

export function loadCuratorProfile(db: D1Database, login: string): Promise<CuratorProfileRow | null> {
  // A seeded placeholder row (negative github_id) can share a login with the
  // real account, so the account that signed in wins.
  return db.prepare(
    `SELECT login, name, avatar FROM users
     WHERE login = ?1
     ORDER BY CASE WHEN github_id >= 0 THEN 0 ELSE 1 END, last_login_at DESC
     LIMIT 1`,
  ).bind(login).first<CuratorProfileRow>()
}

export async function loadCuratorCollections(db: D1Database, login: string): Promise<CollectionListRow[]> {
  const { results } = await db.prepare(
    `SELECT c.slug, c.name, c.preamble, c.featured, c.updated_at,
            (SELECT COUNT(*) FROM collection_skills_v2 cs WHERE cs.collection_id = c.id) AS skill_count
     FROM collections_v2 c
     JOIN users u ON u.id = c.author_user_id
     WHERE u.login = ? AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
  ).bind(login).all<CollectionListRow>()
  return results ?? []
}

export function loadCollectionHead(db: D1Database, login: string, slug: string): Promise<CollectionDetailRow | null> {
  return db.prepare(
    `SELECT c.id, u.login AS author_login, u.name AS author_name, u.avatar AS author_avatar,
            c.slug, c.name, c.preamble, c.featured, c.created_at, c.updated_at
     FROM collections_v2 c
     JOIN users u ON u.id = c.author_user_id
     WHERE u.login = ? AND c.slug = ? AND c.deleted_at IS NULL
     LIMIT 1`,
  ).bind(login, slug).first<CollectionDetailRow>()
}

/**
 * The entries the registry can show now. A whole-Repository entry shows the
 * Repository's most recently changed Skill.
 */
export async function loadCollectionSkills(db: D1Database, collectionId: number): Promise<CollectionSkillRow[]> {
  // The CTE is limited to the collection's repositories. Unfiltered, it ranked
  // every Skill in the registry and ran the correlated repo count for each,
  // about 1.69M rows read per call. `rn` partitions by repository, so the
  // filter leaves every rank unchanged.
  const { results } = await db.prepare(
    `WITH ranked_skills AS (
       SELECT s.owner, s.repo, s.name, s.display_name,
              ROW_NUMBER() OVER (
                PARTITION BY s.owner, s.repo
                ORDER BY s.modified_at DESC, s.name ASC
              ) AS rn
       FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
       WHERE (r.broken_since IS NULL OR r.broken_since > unixepoch() - 604800)
         AND s.source_resolved = 1
         AND s.rendered_status = 'ok'
         AND (s.owner, s.repo) IN (
           SELECT owner, repo FROM collection_skills_v2 WHERE collection_id = ?1
         )
     )
     SELECT cs.position, cs.owner, cs.repo, rs.name, rs.display_name, cs.reason,
            (SELECT COUNT(*) FROM skills repo_skills
             WHERE repo_skills.owner = cs.owner
               AND repo_skills.repo = cs.repo
               AND repo_skills.source_resolved = 1) AS repo_skill_count
     FROM collection_skills_v2 cs
     JOIN ranked_skills rs
       ON rs.owner = cs.owner
      AND rs.repo = cs.repo
      AND (
        (cs.name IS NOT NULL AND rs.name = cs.name)
        OR (cs.name IS NULL AND rs.rn = 1)
      )
     WHERE cs.collection_id = ?1
     ORDER BY cs.position ASC`,
  ).bind(collectionId).all<CollectionSkillRow>()
  return results ?? []
}

export async function loadCollectionDetail(db: D1Database, login: string, slug: string): Promise<CollectionDetail | null> {
  const collection = await loadCollectionHead(db, login, slug)
  if (!collection)
    return null
  return { collection, skills: await loadCollectionSkills(db, collection.id) }
}

/** The entries that name one Skill. A whole-Repository entry names none, so it has no card of its own. */
export function exactSkillRefs(entries: readonly CollectionEntryRef[]): ExactSkillRef[] {
  return entries.flatMap(entry => entry.name === null ? [] : [{ owner: entry.owner, repo: entry.repo, name: entry.name }])
}

/** One page of a collection, with the registry summary of each Skill on it. */
export interface CollectionPage {
  collection: CollectionDetailRow
  entries: CollectionSkillRow[]
  /** Keyed by `skillCardKey`. */
  summaries: Map<string, SkillCardRow>
  /** Every entry the registry can show now, on any page. */
  total: number
}

export async function loadCollectionPage(
  db: D1Database,
  login: string,
  slug: string,
  window: { limit: number, offset: number },
): Promise<CollectionPage | null> {
  const detail = await loadCollectionDetail(db, login, slug)
  if (!detail)
    return null
  const entries = detail.skills.slice(window.offset, window.offset + window.limit)
  return {
    collection: detail.collection,
    entries,
    summaries: await loadSkillCardRows(db, exactSkillRefs(entries)),
    total: detail.skills.length,
  }
}

/** The signed-in curator's own collection. Another curator's collection with the same slug never matches. */
export async function findAuthorCollectionId(db: D1Database, userId: number, slug: string): Promise<number | null> {
  const row = await db.prepare(
    `SELECT id FROM collections_v2
     WHERE slug = ? AND author_user_id = ? AND deleted_at IS NULL LIMIT 1`,
  ).bind(slug, userId).first<{ id: number }>()
  return row?.id ?? null
}

/** The stored entries that name exactly `ref`. A null name matches only whole-Repository entries. */
export async function findCollectionEntries(db: D1Database, collectionId: number, ref: CollectionEntryRef): Promise<CollectionEntry[]> {
  const { results } = await db.prepare(
    `SELECT position, reason FROM collection_skills_v2
     WHERE collection_id = ?1 AND owner = ?2 AND repo = ?3
       AND (name IS ?4 OR name = ?4)`,
  ).bind(collectionId, ref.owner, ref.repo, ref.name).all<CollectionEntry>()
  return results ?? []
}

/** Appends an entry after the last one. */
export async function addCollectionEntry(
  db: D1Database,
  collectionId: number,
  entry: CollectionEntryRef & { reason: string | null },
): Promise<void> {
  const next = await db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
     FROM collection_skills_v2 WHERE collection_id = ?`,
  ).bind(collectionId).first<{ next_position: number }>()

  const stmts = [
    db.prepare(
      `INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name, reason)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(collectionId, next?.next_position ?? 0, entry.owner, entry.repo, entry.name, entry.reason),
    touchCollectionStatement(db, collectionId),
  ]
  // NULL name rows don't participate in the curator-count formula (NULL =
  // NULL is false), so we only enqueue when we have a concrete name to
  // recompute against.
  if (entry.name) {
    stmts.push(enqueueSkillDirtyStatement(db, {
      owner: entry.owner,
      repo: entry.repo,
      name: entry.name,
      reason: 'curator',
    }))
  }
  await db.batch(stmts)
}

/**
 * The entries that show `skill`: entries that name it, and whole-Repository
 * entries that show it now. A reader sees a whole-Repository entry as that
 * one Skill, so a change to the Skill changes that entry.
 */
export async function findCollectionSkillHolders(db: D1Database, collectionId: number, skill: ExactSkillRef): Promise<CollectionEntry[]> {
  const named = await findCollectionEntries(db, collectionId, skill)
  const shown = await loadCollectionSkills(db, collectionId)
  const holders = new Map(named.map(entry => [entry.position, entry]))
  for (const row of shown) {
    if (row.owner === skill.owner && row.repo === skill.repo && row.name === skill.name && !holders.has(row.position))
      holders.set(row.position, { position: row.position, reason: row.reason })
  }
  return [...holders.values()].sort((a, b) => a.position - b.position)
}

/**
 * Puts `skill` in the collection and answers the reason it now has. A new
 * Skill goes after the last entry. A Skill the collection already shows keeps
 * its place. An undefined `reason` keeps the stored one.
 */
export async function putCollectionSkill(
  db: D1Database,
  collectionId: number,
  skill: ExactSkillRef,
  reason: string | null | undefined,
): Promise<string | null> {
  const [holder] = await findCollectionSkillHolders(db, collectionId, skill)
  if (!holder) {
    await addCollectionEntry(db, collectionId, { ...skill, reason: reason ?? null })
    return reason ?? null
  }
  if (reason === undefined || reason === holder.reason)
    return holder.reason
  await db.batch([
    db.prepare(
      `UPDATE collection_skills_v2 SET reason = ?3 WHERE collection_id = ?1 AND position = ?2`,
    ).bind(collectionId, holder.position, reason),
    touchCollectionStatement(db, collectionId),
    // The reason feeds the curator-reason count.
    enqueueSkillDirtyStatement(db, { ...skill, reason: 'curator' }),
  ])
  return reason
}

/** Removes every entry that shows `skill`. A Skill the collection does not show changes nothing. */
export async function removeCollectionSkill(db: D1Database, collectionId: number, skill: ExactSkillRef): Promise<void> {
  const holders = await findCollectionSkillHolders(db, collectionId, skill)
  if (holders.length === 0)
    return
  await db.batch([
    db.prepare(
      `DELETE FROM collection_skills_v2
       WHERE collection_id = ?1 AND position IN (SELECT value FROM json_each(?2))`,
    ).bind(collectionId, JSON.stringify(holders.map(holder => holder.position))),
    touchCollectionStatement(db, collectionId),
    enqueueSkillDirtyStatement(db, { ...skill, reason: 'curator' }),
  ])
}

export interface NewCollection {
  slug: string
  name: string
  preamble: string | null
  skills: ReadonlyArray<CollectionEntryRef & { reason: string | null }>
}

export type CreateCollectionOutcome
  = | { _tag: 'Created', id: number }
    | { _tag: 'SlugTaken' }

/** A deleted collection keeps its slug, so its old URL never names a new collection. */
export async function createCollection(db: D1Database, userId: number, input: NewCollection): Promise<CreateCollectionOutcome> {
  const now = nowSeconds()
  const existing = await db.prepare(
    `SELECT id FROM collections_v2 WHERE author_user_id = ?1 AND slug = ?2`,
  ).bind(userId, input.slug).first<{ id: number }>()
  if (existing)
    return { _tag: 'SlugTaken' }

  const insert = await db.prepare(
    `INSERT INTO collections_v2 (author_user_id, slug, name, preamble, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     RETURNING id`,
  ).bind(userId, input.slug, input.name, input.preamble, now).first<{ id: number }>()
  if (!insert)
    throw new Error(`collections_v2 insert for ${input.slug} returned no row`)

  if (input.skills.length) {
    const stmts = input.skills.flatMap((skill, position) => {
      const row = [db.prepare(
        `INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name, reason)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      ).bind(insert.id, position, skill.owner, skill.repo, skill.name, skill.reason)]
      // Only enqueue when name is concrete — NULL-name rows don't feed the
      // curator-count formula (NULL = NULL is false in the integrity check).
      if (skill.name) {
        row.push(enqueueSkillDirtyStatement(db, {
          owner: skill.owner,
          repo: skill.repo,
          name: skill.name,
          reason: 'curator',
        }))
      }
      return row
    })
    await db.batch(stmts)
  }

  return { _tag: 'Created', id: insert.id }
}

export type WatchCollectionOutcome
  = | { _tag: 'NotFound' }
    | { _tag: 'Watched', repositories: number }

/**
 * Watches every Repository the collection names. The digest is
 * Repository-grained, so each Repository is one subscription however many of
 * its Skills the collection names.
 */
export async function watchCollection(db: D1Database, userId: number, login: string, slug: string): Promise<WatchCollectionOutcome> {
  const collection = await loadCollectionHead(db, login, slug)
  if (!collection)
    return { _tag: 'NotFound' }

  const { results } = await db.prepare(
    `SELECT DISTINCT owner, repo FROM collection_skills_v2 WHERE collection_id = ?1`,
  ).bind(collection.id).all<{ owner: string, repo: string }>()

  const now = nowSeconds()
  const source = `collection:${collection.slug}`
  const stmts = (results ?? []).map(repository => db.prepare(
    `INSERT OR IGNORE INTO skill_subscriptions (user_id, owner, repo, source, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  ).bind(userId, repository.owner, repository.repo, source, now))
  if (stmts.length)
    await db.batch(stmts)
  return { _tag: 'Watched', repositories: stmts.length }
}
