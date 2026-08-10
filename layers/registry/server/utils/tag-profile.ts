import type { RegistrySkill } from './skills-registry'

export interface TagSkillRow {
  name: string
  owner: string
  repo: string
  display_name: string
  slug: string
  stars: number | null
  description: string | null
  rendered_raw_sha256: string | null
  pushed_at: number | null
  modified_at: number | null
  first_seen_at: number | null
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
      displayName: row.display_name,
      slug: row.slug,
      stars: row.stars ?? 0,
      description: row.description ?? null,
      renderedRawSha256: row.rendered_raw_sha256 ?? null,
      pushedAt: row.pushed_at ?? null,
      modifiedAt: row.modified_at ?? null,
      firstSeenAt: row.first_seen_at ?? null,
      seoIndexScore: 0,
      seoIndexable: false,
      trustTier: 'untrusted',
      trustScore: 0,
    },
  }
}
