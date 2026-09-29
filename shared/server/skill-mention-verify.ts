/**
 * Turn a candidate skill name from a post into a real, named skill.
 *
 * A candidate is only ever a guess: `extractSkillMentions` is deliberately
 * generous and this module is the filter. Nothing becomes a trending skill
 * until a `SKILL.md` in a repo the post actually linked answers to that name.
 *
 * THREE WAYS A NAME CAN MATCH, cheapest first.
 *
 *   1. Our own registry. Free. Covers every repo already indexed, and matches
 *      the frontmatter name too because `skills.display_name` is populated
 *      from it by migration 0088.
 *   2. The repo's SKILL.md directory names, from the tree we already fetch.
 *   3. The frontmatter `name:` inside each SKILL.md, batch-fetched only when
 *      the cheaper paths miss.
 *
 * Step 3 is not optional. Measured on real repos, the frontmatter name and the
 * directory name disagree often enough to matter:
 *
 *     kunpai/mars-claude         dir mars-claude        name: mars-review
 *     danyuchn/asd-ste100-skill  dir asd-ste100-skill   name: asd-ste100
 *
 * Someone posting "/mars-review" is naming the skill its author named. Only
 * the frontmatter knows that. An earlier heuristic that stripped a `-skill`
 * suffix caught the second case by luck and would never have caught the first.
 *
 * URLS ARE UNAFFECTED. `parseSkillFile` derives the slug from the directory,
 * and that stays the identity used in routes. The frontmatter name is the
 * canonical *display* name, which is what a trending row should show.
 */

import type { GithubBindings } from '#layers/registry/server/utils/github-client'
import { getBlobsBatch, getRepoSummary, getTree, GRAPHQL_BATCH_SIZE, hasBody } from '#layers/registry/server/utils/github-client'
import { parseSkillFile, slugifySkillName } from '#layers/registry/server/utils/skill-frontmatter'
import { isRegistrySkillPath } from '#shared/skill-path'

/** Matches `sync-repo.ts`, so this module and the indexer agree on what a skill is. */
const SKILL_FILE_SUFFIX = '/SKILL.md'

export interface VerifiedSkill {
  owner: string
  repo: string
  /** Directory-derived slug. The routing identity; never taken from frontmatter. */
  slug: string
  /** Frontmatter `name:` when present, else the slug. What the UI should show. */
  canonicalName: string
  /** Path to the SKILL.md that matched. */
  path: string
  /** Which index the candidate matched on, for provenance and debugging. */
  matchedOn: 'registry' | 'directory' | 'frontmatter'
}

export type VerifyResult
  = | { _tag: 'verified', skill: VerifiedSkill }
    | { _tag: 'no-match' }
    | { _tag: 'unavailable', reason: string }

export interface VerifyDeps {
  db: D1Database
  bindings: GithubBindings
}

/** Registry lookup. Free, and authoritative for anything already indexed. */
async function matchInRegistry(
  db: D1Database,
  owner: string,
  repo: string,
  candidate: string,
): Promise<VerifiedSkill | null> {
  const row = await db
    .prepare(
      `SELECT name, display_name, rendered_skill_path
       FROM skills
       WHERE owner = ?1 AND repo = ?2 AND source_resolved = 1
         AND (LOWER(name) = ?3 OR LOWER(display_name) = ?3)
       LIMIT 1`,
    )
    .bind(owner, repo, candidate)
    .first<{ name: string, display_name: string | null, rendered_skill_path: string | null }>()

  if (!row)
    return null

  return {
    owner,
    repo,
    slug: row.name,
    canonicalName: row.display_name || row.name,
    path: row.rendered_skill_path ?? `${row.name}${SKILL_FILE_SUFFIX}`,
    matchedOn: 'registry',
  }
}

function dirNameFor(path: string, repo: string): string {
  if (path === 'SKILL.md')
    return repo
  return path.slice(0, -SKILL_FILE_SUFFIX.length).split('/').pop() ?? repo
}

/**
 * Resolve one candidate name against one repository.
 *
 * Returns `unavailable` rather than `no-match` when GitHub could not answer,
 * so callers can retry instead of recording a false negative. The distinction
 * matters: a rate-limited lookup is not evidence that a skill does not exist.
 */
export async function verifySkillMention(
  deps: VerifyDeps,
  input: { owner: string, repo: string, candidate: string },
): Promise<VerifyResult> {
  const owner = input.owner.toLowerCase()
  const repo = input.repo.toLowerCase()
  const candidate = slugifySkillName(input.candidate) || input.candidate.toLowerCase()

  const fromRegistry = await matchInRegistry(deps.db, owner, repo, candidate)
  if (fromRegistry)
    return { _tag: 'verified', skill: fromRegistry }

  const summary = await getRepoSummary(owner, repo, deps.bindings)
  if (!hasBody(summary) || !summary.data.headTreeSha)
    return { _tag: 'unavailable', reason: `repo-summary-${summary.status}` }

  const tree = await getTree(owner, repo, summary.data.headTreeSha, deps.bindings)
  if (!hasBody(tree))
    return { _tag: 'unavailable', reason: `tree-${tree.status}` }
  if (tree.data.truncated)
    return { _tag: 'unavailable', reason: 'tree-truncated' }

  const skillPaths = tree.data.tree
    .filter(entry => entry.type === 'blob' && isRegistrySkillPath(entry.path))
    .map(entry => entry.path)

  if (skillPaths.length === 0)
    return { _tag: 'no-match' }

  const branch = summary.data.meta.default_branch || 'main'

  // Directory pass. The tree is already in hand, so finding the file is free,
  // but the canonical name still comes from the file: a skill at
  // `skills/foo/SKILL.md` may well declare `name: bar`, and `bar` is what its
  // author calls it. Only the matched blob is fetched, not the whole repo.
  const byDirectory = skillPaths.find(path => slugifySkillName(dirNameFor(path, repo)) === candidate)
  if (byDirectory) {
    const blobs = await getBlobsBatch(owner, repo, branch, [byDirectory], deps.bindings)
    const raw = hasBody(blobs) ? blobs.data.get(byDirectory) : undefined
    const parsed = raw === undefined ? null : parseSkillFile(raw, dirNameFor(byDirectory, repo))
    const dirName = dirNameFor(byDirectory, repo)
    return {
      _tag: 'verified',
      skill: {
        owner,
        repo,
        slug: parsed?.name ?? slugifySkillName(dirName),
        // Falls back to the directory name when the blob could not be read.
        // A missing canonical name is a display nicety; failing the whole
        // match over it would discard a confirmed skill.
        canonicalName: parsed?.displayName ?? dirName,
        path: byDirectory,
        matchedOn: 'directory',
      },
    }
  }

  // Frontmatter pass. One batched GraphQL request per 50 files, reached only
  // when no directory answered to the candidate.
  for (let i = 0; i < skillPaths.length; i += GRAPHQL_BATCH_SIZE) {
    const batch = skillPaths.slice(i, i + GRAPHQL_BATCH_SIZE)
    const blobs = await getBlobsBatch(owner, repo, branch, batch, deps.bindings)
    if (!hasBody(blobs))
      return { _tag: 'unavailable', reason: `blobs-${blobs.status}` }

    for (const [path, raw] of blobs.data) {
      const parsed = parseSkillFile(raw, dirNameFor(path, repo))
      if (!parsed)
        continue
      if (slugifySkillName(parsed.displayName) === candidate || parsed.name === candidate) {
        return {
          _tag: 'verified',
          skill: {
            owner,
            repo,
            slug: parsed.name,
            canonicalName: parsed.displayName,
            path,
            matchedOn: 'frontmatter',
          },
        }
      }
    }
  }

  return { _tag: 'no-match' }
}
