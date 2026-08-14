/**
 * Find the individual skills named by posts we have already paid for.
 *
 * Costs no X reads. Every post is already in `x_posts`, so this runs as a
 * separate pass rather than inside ingest: detection rules change often, and
 * re-scanning stored posts must never cost money.
 *
 * TWO PASSES, CHEAPEST AND BEST FIRST.
 *
 *   1. CLOSED VOCABULARY. Ask each repository the post linked what skills it
 *      ships, then look for those names in the text. Costs nothing at all for
 *      an indexed repo, needs no verification because the vocabulary is
 *      already verified, and finds nearly everything.
 *   2. OPEN VOCABULARY. Guess names out of the text and pay GitHub to check
 *      them. Only for repos we have not indexed, where pass one has no
 *      vocabulary to work from.
 *
 * The order is the whole design, and it is measured. Over 396 Bluesky posts
 * from a 30-day window, pass two alone produced 17 candidates and zero
 * verified skills; pass one produced 37 mentions of 32 distinct skills across
 * 30 posts, with no hand-written blocklist.
 *
 * The reason generalises beyond Bluesky. Extraction leans on conventions
 * people only use in long-form writing: a `/slash` name, a fenced install
 * command, "a skill called X". Most posts do none of that. They link a repo
 * and say the skill's name in an ordinary sentence, and a name only looks like
 * a name once you already know it is one.
 *
 * A post is scanned once. `skills_scanned_at` is set only on a definite
 * answer, so a GitHub outage leaves the post queued rather than silently
 * discarding it.
 */

import type { GithubBindings } from '#layers/registry/server/utils/github-client'
import type { SkillMention } from '#shared/skill-mentions'
import type { VerifiedSkill } from './skill-mention-verify'
import { extractSkillMentions } from '#shared/skill-mentions'
import { matchKnownSkills } from '#shared/skill-name-match'
import { verifySkillMention } from './skill-mention-verify'

/**
 * Posts scanned per run. Each unverified candidate can cost a few GitHub
 * calls, and GitHub allows 5,000 per hour, so this leaves ample headroom
 * alongside the repo sync that shares the same budget.
 */
export const DEFAULT_SCAN_BATCH = 100

export interface SkillScanDeps {
  db: D1Database
  bindings: GithubBindings
  /** Unix seconds. */
  now: number
  limit?: number
}

export interface SkillScanSummary {
  postsScanned: number
  /** Matches from the repo's own skill vocabulary. Free, and the main route. */
  closedVocabMatches: number
  candidates: number
  verified: number
  rejected: number
  /** Left unscanned because GitHub could not answer; retried next run. */
  deferred: number
  elapsedMs: number
}

interface PostRow {
  post_id: string
  text_extract: string
  article_title: string | null
}

export async function scanPostsForSkills(deps: SkillScanDeps): Promise<SkillScanSummary> {
  const startedAt = Date.now()
  const { db, now } = deps
  const limit = deps.limit ?? DEFAULT_SCAN_BATCH

  const summary: SkillScanSummary = {
    postsScanned: 0,
    closedVocabMatches: 0,
    candidates: 0,
    verified: 0,
    rejected: 0,
    deferred: 0,
    elapsedMs: 0,
  }

  const posts = (await db
    .prepare(
      `SELECT post_id, text_extract, NULL AS article_title
       FROM x_posts
       WHERE skills_scanned_at IS NULL
       ORDER BY posted_at DESC
       LIMIT ?1`,
    )
    .bind(limit)
    .all<PostRow>()).results ?? []

  for (const post of posts) {
    const linked = (await db
      .prepare(`SELECT owner, repo FROM x_post_repos WHERE post_id = ?1`)
      .bind(post.post_id)
      .all<{ owner: string, repo: string }>()).results ?? []

    const text = post.text_extract ?? ''

    // PASS 1, closed vocabulary. Ask each linked repo what skills it ships,
    // then look for those names in the post. Free for any indexed repo, needs
    // no verification because the vocabulary is already verified, and it is
    // where nearly all real matches come from: measured over 396 Bluesky posts
    // this found 37 mentions of 32 skills where the open-vocabulary extractor
    // below found zero.
    let closedVocabHits = 0
    for (const target of linked) {
      const known = await loadRepoSkills(db, target.owner, target.repo)
      if (known.length === 0)
        continue
      for (const match of matchKnownSkills({ text, skills: known })) {
        const skill = known.find(k => k.slug.toLowerCase() === match.name)
        if (!skill)
          continue
        closedVocabHits += 1
        summary.verified += 1
        await recordSkill(db, {
          postId: post.post_id,
          owner: target.owner,
          repo: target.repo,
          slug: skill.slug,
          canonicalName: skill.canonicalName || skill.slug,
          path: skill.path,
          // Evidence strength maps onto the same three detection kinds the
          // schema already knows, so nothing downstream needs to change.
          detection: match.evidence === 'slash' ? 'slash' : match.evidence === 'quoted' ? 'install' : 'prose',
          matchedOn: 'registry',
          now,
        })
      }
    }
    summary.closedVocabMatches += closedVocabHits

    // PASS 2, open vocabulary. Guess names out of the text and pay GitHub to
    // check them. Retained only for repos we have not indexed yet, where pass
    // one has no vocabulary to work from; running it everywhere would spend
    // GitHub calls re-deriving what the registry already knows.
    const unindexed = linked.length > 0 && closedVocabHits === 0
    const mentions = unindexed
      ? extractSkillMentions({ text, articleTitle: post.article_title })
      : []
    summary.candidates += mentions.length

    let deferred = false
    for (const mention of mentions) {
      const outcome = await resolveMention(deps, mention, linked)
      if (outcome === 'deferred') {
        deferred = true
        continue
      }
      if (outcome === 'rejected') {
        summary.rejected += 1
        continue
      }
      summary.verified += 1
      await recordSkill(db, {
        postId: post.post_id,
        owner: outcome.skill.owner,
        repo: outcome.skill.repo,
        slug: outcome.skill.slug,
        canonicalName: outcome.skill.canonicalName,
        path: outcome.skill.path,
        detection: mention.source,
        matchedOn: outcome.skill.matchedOn,
        now,
      })
    }

    // Only a definite answer marks the post done. Leaving it queued costs one
    // more scan; marking it prematurely loses the post for good.
    if (deferred) {
      summary.deferred += 1
      continue
    }
    summary.postsScanned += 1
    await db
      .prepare(`UPDATE x_posts SET skills_scanned_at = ?2 WHERE post_id = ?1`)
      .bind(post.post_id, now)
      .run()
  }

  summary.elapsedMs = Date.now() - startedAt
  return summary
}

interface RepoSkill {
  slug: string
  canonicalName: string | null
  path: string
}

/**
 * The skills a repository ships, from our own registry.
 *
 * Free, and authoritative for anything indexed. A repo we have not indexed
 * returns nothing, which is what routes the post to the open-vocabulary pass
 * instead of silently finding no skills.
 */
async function loadRepoSkills(db: D1Database, owner: string, repo: string): Promise<RepoSkill[]> {
  const rows = (await db
    .prepare(
      `SELECT name, display_name, rendered_skill_path
       FROM skills
       WHERE owner = ?1 AND repo = ?2 AND source_resolved = 1`,
    )
    .bind(owner, repo)
    .all<{ name: string, display_name: string | null, rendered_skill_path: string | null }>()).results ?? []

  return rows.map(row => ({
    slug: row.name,
    canonicalName: row.display_name,
    path: row.rendered_skill_path ?? `${row.name}/SKILL.md`,
  }))
}

async function recordSkill(db: D1Database, input: {
  postId: string
  owner: string
  repo: string
  slug: string
  canonicalName: string
  path: string
  detection: 'slash' | 'prose' | 'install'
  matchedOn: 'registry' | 'directory' | 'frontmatter'
  now: number
}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO x_post_skills (
         post_id, owner, repo, slug, canonical_name, skill_path,
         detection, matched_on, verified_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT (post_id, owner, repo, slug) DO UPDATE SET
         canonical_name = excluded.canonical_name,
         skill_path = excluded.skill_path,
         matched_on = excluded.matched_on`,
    )
    .bind(
      input.postId,
      input.owner,
      input.repo,
      input.slug,
      input.canonicalName,
      input.path,
      input.detection,
      input.matchedOn,
      input.now,
    )
    .run()
}

type MentionOutcome = 'rejected' | 'deferred' | { skill: VerifiedSkill }

/**
 * Try a mention against the repos available to it.
 *
 * An install command names its own repo, which is the strongest signal and is
 * tried alone. Otherwise every repo the post linked is a candidate, because a
 * thread naming several repos may name a skill in any of them.
 *
 * Never falls back to resolving the name globally. Skill names are not unique:
 * looking `thanos` up by name alone returns a stranger's repo, and attributing
 * a mention to the wrong author is the one error a provenance product cannot
 * make.
 */
async function resolveMention(
  deps: SkillScanDeps,
  mention: SkillMention,
  linked: Array<{ owner: string, repo: string }>,
): Promise<MentionOutcome> {
  const targets = mention.repo ? [mention.repo] : linked
  if (targets.length === 0)
    return 'rejected'

  let sawUnavailable = false
  for (const target of targets) {
    const result = await verifySkillMention(
      { db: deps.db, bindings: deps.bindings },
      { owner: target.owner, repo: target.repo, candidate: mention.name },
    )
    if (result._tag === 'verified')
      return { skill: result.skill }
    if (result._tag === 'unavailable')
      sawUnavailable = true
  }

  return sawUnavailable ? 'deferred' : 'rejected'
}
