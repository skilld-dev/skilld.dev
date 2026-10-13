/// <reference types="@cloudflare/workers-types" />

import type { KeyedTable, MoveStatement } from './repository-move'
import { namedStatements, SKILL_TABLES } from './repository-move'

/** A Skill the registry holds, with the SKILL.md it last rendered. */
export interface SkillCopy {
  name: string
  raw: string
}

/** One Skill folder an author renamed inside a Repository (ADR-0017). */
export interface SkillRename {
  owner: string
  repo: string
  from: string
  to: string
  /** Unix seconds. */
  renamedAt: number
}

/**
 * Two SKILL.md bodies that share at least this share of their lines are the
 * same Skill. Brundlefly's two renamed Skills scored 0.97 and 0.99 against
 * their old copies, and 0.00 against each other and an unrelated new Skill.
 */
export const RENAME_SIMILARITY = 0.6

// Short lines, such as headings and list markers, recur across unrelated Skills.
const MIN_LINE_LENGTH = 20
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

function bodyLines(raw: string): Set<string> {
  return new Set(
    raw.replace(FRONTMATTER, '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length >= MIN_LINE_LENGTH),
  )
}

/**
 * The share of distinct body lines two SKILL.md files hold in common, from 0
 * to 1. Frontmatter does not count, because a rename edits the name in it.
 */
export function skillBodySimilarity(left: string, right: string): number {
  const a = bodyLines(left)
  const b = bodyLines(right)
  const union = new Set([...a, ...b]).size
  if (union === 0)
    return 0
  let shared = 0
  for (const line of a) {
    if (b.has(line))
      shared++
  }
  return shared / union
}

/** The index of the single best score at or above the threshold, or -1. */
function singleBest(scores: readonly number[], threshold: number): number {
  const top = Math.max(...scores)
  if (!(top >= threshold) || scores.filter(score => score === top).length !== 1)
    return -1
  return scores.indexOf(top)
}

/**
 * Pair each removed Skill with the added Skill it became. A pair needs a
 * similarity at or above the threshold, and each side must be the other's
 * single best match. An ambiguous case stays a removal and an addition.
 */
export function matchSkillRenames(
  removed: readonly SkillCopy[],
  added: readonly SkillCopy[],
  threshold = RENAME_SIMILARITY,
): Array<{ from: string, to: string }> {
  if (!removed.length || !added.length)
    return []
  const scores = removed.map(old => added.map(fresh => skillBodySimilarity(old.raw, fresh.raw)))
  const pairs: Array<{ from: string, to: string }> = []
  removed.forEach((old, row) => {
    const column = singleBest(scores[row]!, threshold)
    if (column < 0)
      return
    if (singleBest(scores.map(rowScores => rowScores[column]!), threshold) === row)
      pairs.push({ from: old.name, to: added[column]!.name })
  })
  return pairs
}

/**
 * The renames one sync made, judged once it knows every name the tree still
 * holds. `missing` are the names the tree no longer holds. A Skill first seen
 * at `checkedAt` was added by this sync, in whichever invocation wrote it.
 *
 * A missing name can already be marked gone: a scheduled sync can sweep the
 * old name before an index request admits the new one. Its cached copy still
 * pairs it, so its tombstone becomes a redirect.
 */
export async function findSkillRenames(
  db: D1Database,
  input: { owner: string, repo: string, missing: readonly string[], checkedAt: number },
): Promise<SkillRename[]> {
  if (!input.missing.length)
    return []
  const added = await db.prepare(
    `SELECT name, rendered_raw AS raw FROM skills
     WHERE owner = ? AND repo = ? AND first_seen_at = ?
       AND source_resolved = 1 AND rendered_raw IS NOT NULL`,
  ).bind(input.owner, input.repo, input.checkedAt).all<SkillCopy>()
  if (!added.results?.length)
    return []
  const removed = await db.prepare(
    `SELECT name, rendered_raw AS raw FROM skills
     WHERE owner = ? AND repo = ? AND name IN (SELECT value FROM json_each(?))
       AND rendered_raw IS NOT NULL`,
  ).bind(input.owner, input.repo, JSON.stringify(input.missing)).all<SkillCopy>()
  return matchSkillRenames(removed.results ?? [], added.results).map(pair => ({
    owner: input.owner,
    repo: input.repo,
    ...pair,
    renamedAt: input.checkedAt,
  }))
}

function renameRows({ table, repo = 'repo', name = 'name', keep }: KeyedTable): string[] {
  const where = `owner = :owner AND ${repo} = :repo AND ${name} = :from_name${keep ? ` AND NOT (${keep})` : ''}`
  return [
    `UPDATE OR IGNORE ${table} SET ${name} = :to_name WHERE ${where}`,
    `DELETE FROM ${table} WHERE ${where}`,
  ]
}

const RENAME_SQL: string[] = [
  // The new name is live, so it is nobody's alias. This also ends a rename back,
  // and runs first so the retarget below cannot point an alias at itself.
  `DELETE FROM skill_aliases WHERE owner = :owner AND repo = :repo AND name = :to_name`,
  // The old name becomes an alias. A repeat of the same rename keeps the first date.
  `INSERT INTO skill_aliases (owner, repo, name, target_name, renamed_at)
   VALUES (:owner, :repo, :from_name, :to_name, :renamed_at)
   ON CONFLICT (owner, repo, name) DO UPDATE SET
     target_name = excluded.target_name,
     renamed_at = CASE
       WHEN skill_aliases.target_name = excluded.target_name THEN skill_aliases.renamed_at
       ELSE excluded.renamed_at
     END`,
  // An older alias points straight at the new name, so no redirect chains.
  `UPDATE skill_aliases SET target_name = :to_name
   WHERE owner = :owner AND repo = :repo AND target_name = :from_name`,

  // Social posts key a Skill by its `owner/name` slug.
  `UPDATE OR IGNORE skill_social_posts SET skill_slug = :owner || '/' || :to_name
   WHERE skill_slug = :owner || '/' || :from_name`,
  `DELETE FROM skill_social_posts WHERE skill_slug = :owner || '/' || :from_name`,

  // A collection that already lists the new name keeps one entry.
  `DELETE FROM collection_skills_v2
   WHERE owner = :owner AND repo = :repo AND name = :from_name
     AND EXISTS (
       SELECT 1 FROM collection_skills_v2 kept
       WHERE kept.collection_id = collection_skills_v2.collection_id
         AND kept.owner = :owner AND kept.repo = :repo AND kept.name = :to_name)`,
  ...SKILL_TABLES.flatMap(renameRows),

  // The new name keeps the date the registry first saw the Skill.
  `UPDATE skills
   SET first_seen_at = MIN(
     COALESCE(first_seen_at, :renamed_at),
     COALESCE((SELECT old.first_seen_at FROM skills old
       WHERE old.owner = :owner AND old.repo = :repo AND old.name = :from_name), :renamed_at))
   WHERE owner = :owner AND repo = :repo AND name = :to_name`,
  `DELETE FROM skills WHERE owner = :owner AND repo = :repo AND name = :from_name`,
  // Counters, trust, and indexability read the merged rows.
  `INSERT OR REPLACE INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
   VALUES (:owner, :repo, :to_name, 'skill_renamed', :renamed_at, 0)`,
  // The agent sitemap lists these routes, and the old ones now answer 301.
  // '0' sorts right after '/', so the range is every route under the old name.
  `DELETE FROM ai_ready_pages
   WHERE route = :old_route OR (route >= :old_route || '/' AND route < :old_route || '0')`,
]

/**
 * The statements of one rename, in order. Run them in the sync's final batch,
 * so the rename lands with the tree cursor or not at all.
 */
export function skillRenameStatements(rename: SkillRename): MoveStatement[] {
  if (rename.from.toLowerCase() === rename.to.toLowerCase())
    throw new Error(`A Skill cannot be renamed to its own name: ${rename.owner}/${rename.repo}/${rename.from}`)
  return namedStatements(RENAME_SQL, {
    owner: rename.owner,
    repo: rename.repo,
    from_name: rename.from,
    to_name: rename.to,
    renamed_at: rename.renamedAt,
    old_route: `/gh/${rename.owner}/${rename.repo}/${rename.from}`.toLowerCase(),
  })
}
