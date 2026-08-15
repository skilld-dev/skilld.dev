/**
 * Measure how many skills a discovered repo would add, before we index it.
 *
 * WHY THIS EXISTS. Discovery auto-submits, which is correct for the ordinary
 * repo: measured against one day of real X posts, 198 of 246 discovered repos
 * held 20 skills or fewer. But eight repos carried 84% of all the SKILL.md
 * files found, topped by `sickn33/agentic-awesome-skills` at 6,341. The largest
 * curated repo in the registry has 18. Indexing one of those dumps would add
 * many times the entire curated registry from a single tweet: the scaled
 * content shape that suppressed the site in June 2026, and precisely the
 * volume play the brand positions against.
 *
 * The count uses the indexer's own predicate (`sync-repo.ts`), so the number
 * here is the number of rows that would actually be written, not an estimate.
 */

import type { GithubBindings } from '#layers/registry/server/utils/github-client'
import { getRepoSummary, getTree, hasBody } from '#layers/registry/server/utils/github-client'

/**
 * Skills a discovered repo may hold and still be indexed without review.
 *
 * Set from the data rather than taste: the largest legitimately curated repo
 * in the registry has 18 skills, and the 21-50 band holds only 4.7% of all
 * discovered skills. 25 clears every genuine case with headroom while parking
 * every aggregator. Raising it past ~50 starts admitting the dumps.
 */
export const AUTO_INDEX_SKILL_LIMIT = 25

/** Matches `sync-repo.ts`: a skill is a blob at `<dir>/SKILL.md`. */
const SKILL_FILE_SUFFIX = '/SKILL.md'

export type RepoSizeVerdict
  = | { _tag: 'sized', skillCount: number }
  /**
   * The repository no longer exists. Terminal, and distinct from `unknown`:
   * retrying a 404 every quarter hour forever is pure waste. Real case,
   * `0xwilliamortiz/claude-red`, which drew 162 likes and was then deleted.
   */
    | { _tag: 'gone' }
  /**
   * Size could not be established. Callers must fail closed and park the repo:
   * admitting an unmeasured repo defeats the guard, and the common cause is an
   * expired GitHub token, which would otherwise wave everything through.
   */
    | { _tag: 'unknown', reason: string }

export type MeasureRepoSize = (repo: { owner: string, repo: string }) => Promise<RepoSizeVerdict>

/**
 * Count skills via the GitHub tree.
 *
 * Two subrequests per repo, and only for repos about to be submitted, so at
 * the current submit ceiling this is well inside GitHub's hourly budget. The
 * tree is fetched with `recursive=1`; a truncated response is reported as
 * unknown rather than undercounted, because a truncated tree on a huge repo is
 * exactly the case the guard exists to catch.
 */
export function createGithubRepoSizer(bindings: GithubBindings): MeasureRepoSize {
  return async ({ owner, repo }) => {
    const summary = await getRepoSummary(owner, repo, bindings)
    // 404 means deleted, renamed or made private. Nothing to wait for.
    if (summary.status === 404)
      return { _tag: 'gone' }
    if (!hasBody(summary))
      return { _tag: 'unknown', reason: `repo-summary-${summary.status}` }

    const ref = summary.data.headTreeSha
    if (!ref)
      return { _tag: 'unknown', reason: 'no-head-tree' }

    const tree = await getTree(owner, repo, ref, bindings)
    if (!hasBody(tree))
      return { _tag: 'unknown', reason: `tree-${tree.status}` }

    if (tree.data.truncated)
      return { _tag: 'unknown', reason: 'tree-truncated' }

    let skillCount = 0
    for (const entry of tree.data.tree) {
      if (entry.type !== 'blob')
        continue
      // A root SKILL.md is one skill; nested ones are counted by suffix. This
      // mirrors sync-repo.ts so the guard and the indexer never disagree.
      if (entry.path === 'SKILL.md' || entry.path.endsWith(SKILL_FILE_SUFFIX))
        skillCount += 1
    }

    return { _tag: 'sized', skillCount }
  }
}
