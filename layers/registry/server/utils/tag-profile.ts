import type { RegistrySkill } from './skills-registry'
import { githubSkillFileUrl } from '#shared/skill-file-url'
import { canonicalRepoSkillPath } from './skill-routes'

export interface TagSkillRow {
  name: string
  owner: string
  repo: string
  repo_skill_count: number
  display_name: string
  slug: string
  stars: number | null
  like_count: number | null
  description: string | null
  rendered_raw_sha256: string | null
  pushed_at: number | null
  modified_at: number | null
  first_seen_at: number | null
  rendered_skill_path: string | null
  current_sha: string | null
  default_branch: string | null
  source_owner: string | null
  source_repo: string | null
  author_name: string | null
}

export type ParsedTagSkillRow
  = | { _tag: 'valid', skill: RegistrySkill }
    | { _tag: 'invalid', reason: 'missing-identity' }

export function parseTagSkillRow(row: TagSkillRow): ParsedTagSkillRow {
  const owner = row.owner.trim()
  const repo = row.repo.trim()
  const name = row.name.trim()

  if (!owner || !repo || !name)
    return { _tag: 'invalid', reason: 'missing-identity' }

  return {
    _tag: 'valid',
    skill: {
      name,
      owner,
      repo,
      registryPath: canonicalRepoSkillPath({
        owner,
        repo,
        name,
        repoSkillCount: row.repo_skill_count,
      }),
      displayName: row.display_name,
      slug: row.slug,
      stars: row.stars ?? 0,
      likeCount: row.like_count ?? 0,
      description: row.description ?? null,
      renderedRawSha256: row.rendered_raw_sha256 ?? null,
      pushedAt: row.pushed_at ?? null,
      modifiedAt: row.modified_at ?? null,
      firstSeenAt: row.first_seen_at ?? null,
      authorName: row.author_name ?? null,
      skillFileUrl: githubSkillFileUrl({
        owner: row.source_owner || owner,
        repo: row.source_repo || repo,
        skillPath: row.rendered_skill_path,
        ref: row.current_sha || row.default_branch,
      }),
      seoIndexScore: 0,
      seoIndexable: false,
      trustTier: 'untrusted',
      trustScore: 0,
    },
  }
}
