/// <reference types="@cloudflare/workers-types" />
import type { skillSummarySchema } from 'skilld-sdk/contract'
import { SKILLD_V1_ORIGIN, skillSummaryShape } from 'skilld-sdk/contract'
import { z } from 'zod'
import { skillInstallCmd, skillRunCmd } from '#shared/skill-commands'
import { githubSkillFileUrl } from '#shared/skill-file-url'
import { canonicalRepoSkillPath } from '#shared/skill-routes'

/**
 * The public API Skill card, in one place. Every layer that answers a Skill
 * summary reads and presents it here, so `pageUrl` and `sourceUrl`, the
 * provenance fields (VISION principle 1), cannot differ between two
 * operations that show the same Skill.
 */

/** One exact Skill. */
export interface SkillCardRef {
  owner: string
  repo: string
  name: string
}

/** `owner/repo/name`, the key {@link loadSkillCardRows} answers by. */
export function skillCardKey(ref: SkillCardRef): string {
  return `${ref.owner}/${ref.repo}/${ref.name}`
}

/**
 * The registry fields one Skill card reads. A `RegistrySkill` carries all of
 * them, and so does its JSON form from a site route.
 */
export interface SkillCardSource {
  owner: string
  repo: string
  name: string
  displayName: string | null
  description: string | null
  stars: number | null
  likeCount: number | null
  /** Epoch seconds. */
  modifiedAt: number | null
  /** The final public route. Never rebuilt from the other fields. */
  registryPath: string
  skillFileUrl?: string | null
}

export type SkillSummary = z.input<typeof skillSummarySchema.producer>

/** The `skills` and `repos` columns that decide a Skill's public route and its SKILL.md link. */
export interface SkillLinkColumns {
  owner: string
  repo: string
  name: string
  /** Resolved Skills in the Repository. A Repository with one Skill routes to its hub. */
  repo_skill_count: number
  rendered_skill_path: string | null
  current_sha: string | null
  default_branch: string | null
  /** GitHub's current identity for a renamed or transferred Repository. */
  source_owner: string | null
  source_repo: string | null
}

/**
 * The public route and the SKILL.md link of one Skill row. The registry's own
 * row mapper calls this too, so a card built from any row agrees with it.
 */
export function skillCardLinks(row: SkillLinkColumns): { registryPath: string, skillFileUrl: string | null } {
  return {
    registryPath: canonicalRepoSkillPath({
      owner: row.owner,
      repo: row.repo,
      name: row.name,
      repoSkillCount: row.repo_skill_count,
    }),
    skillFileUrl: githubSkillFileUrl({
      owner: row.source_owner || row.owner,
      repo: row.source_repo || row.repo,
      skillPath: row.rendered_skill_path,
      ref: row.current_sha || row.default_branch,
    }),
  }
}

/** The columns one Skill card needs. */
export interface SkillCardRow extends SkillLinkColumns {
  display_name: string | null
  description: string | null
  stars: number | null
  like_count: number | null
  modified_at: number | null
}

/**
 * Card rows for many Skills in one statement, keyed by {@link skillCardKey}.
 *
 * The refs travel as one JSON parameter, because D1 refuses a statement with
 * more than 100 bound parameters and three per Skill would reach it at 34
 * Skills. CROSS JOIN pins the ref list as the outer loop, so each Skill is one
 * primary-key lookup. A ref with no Skill row is absent from the map, so the
 * caller decides what a removed Skill shows.
 */
export async function loadSkillCardRows(db: D1Database, refs: readonly SkillCardRef[]): Promise<Map<string, SkillCardRow>> {
  if (!refs.length)
    return new Map()
  const { results } = await db.prepare(
    `SELECT s.owner, s.repo, s.name, s.display_name, s.description, s.like_count, s.modified_at,
            s.rendered_skill_path, s.current_sha,
            r.stars, r.default_branch, r.source_owner, r.source_repo,
            (SELECT COUNT(*) FROM skills repo_skills
             WHERE repo_skills.owner = s.owner
               AND repo_skills.repo = s.repo
               AND repo_skills.source_resolved = 1) AS repo_skill_count
     FROM json_each(?1) ref
     CROSS JOIN skills s
       ON s.owner = json_extract(ref.value, '$[0]')
      AND s.repo = json_extract(ref.value, '$[1]')
      AND s.name = json_extract(ref.value, '$[2]')
     LEFT JOIN repos r ON r.owner = s.owner AND r.repo = s.repo`,
  ).bind(JSON.stringify(refs.map(ref => [ref.owner, ref.repo, ref.name]))).all<SkillCardRow>()
  return new Map((results ?? []).map(row => [skillCardKey(row), row]))
}

export function skillCardSourceFromRow(row: SkillCardRow): SkillCardSource {
  return {
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
    stars: row.stars,
    likeCount: row.like_count,
    modifiedAt: row.modified_at,
    ...skillCardLinks(row),
  }
}

export function presentCount(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0))
}

export function epochSecondsToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null
}

export function presentSkillSummary(skill: SkillCardSource): SkillSummary {
  return {
    owner: skill.owner,
    repository: skill.repo,
    name: skill.name,
    displayName: skill.displayName || skill.name,
    description: skill.description,
    stars: presentCount(skill.stars),
    likes: presentCount(skill.likeCount),
    updatedAt: epochSecondsToIso(skill.modifiedAt),
    pageUrl: `${SKILLD_V1_ORIGIN}${skill.registryPath}`,
    sourceUrl: skill.skillFileUrl ?? null,
    runCommand: skillRunCmd(skill.owner, skill.repo, skill.name),
    installCommand: skillInstallCmd(skill.owner, skill.repo, skill.name),
  }
}

/** The card fields alone. A list item may add its own fields, which the response check covers. */
const cardFields = z.object(skillSummaryShape)

/** True when the card fields hold to the contract, so the server can answer the item. */
export function isAnswerableSkillSummary(card: SkillSummary): boolean {
  return cardFields.safeParse(card).success
}

/**
 * Cards for a list. The registry stores what GitHub holds, and a Skill
 * directory name can carry a character the contract rejects, such as a space.
 * The server checks every answer and turns a bad field into a 500, so one
 * such row would fail the whole list. It is left out of the list instead.
 */
export function presentSkillSummaries(skills: readonly SkillCardSource[]): SkillSummary[] {
  return skills.map(presentSkillSummary).filter(isAnswerableSkillSummary)
}
