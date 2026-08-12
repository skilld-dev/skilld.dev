export interface CreatedCollectionRow {
  id: number
  login: string
  slug: string
}

export function createdCollectionPresenter(row: CreatedCollectionRow) {
  return {
    ok: true as const,
    id: row.id,
    login: row.login,
    slug: row.slug,
  }
}

export interface CollectionListRow {
  slug: string
  name: string
  preamble: string | null
  featured: number
  updated_at: number
  skill_count: number
}

export function collectionListEntryPresenter(row: CollectionListRow) {
  return {
    slug: row.slug,
    name: row.name,
    preamble: row.preamble,
    featured: Boolean(row.featured),
    updatedAt: row.updated_at,
    skillCount: row.skill_count,
  }
}

export interface CollectionDetailRow {
  id: number
  author_login: string
  author_name: string | null
  author_avatar: string | null
  slug: string
  name: string
  preamble: string | null
  featured: number
  created_at: number
  updated_at: number
}

export interface CollectionSkillRow {
  position: number
  owner: string
  repo: string
  name: string | null
  display_name?: string | null
  reason: string | null
}

export function collectionDetailPresenter(collection: CollectionDetailRow, skills: CollectionSkillRow[]) {
  return {
    authorLogin: collection.author_login,
    authorName: collection.author_name,
    authorAvatar: collection.author_avatar,
    slug: collection.slug,
    name: collection.name,
    preamble: collection.preamble,
    featured: Boolean(collection.featured),
    createdAt: collection.created_at,
    updatedAt: collection.updated_at,
    skills: skills.map(s => ({
      position: s.position,
      owner: s.owner,
      repo: s.repo,
      name: s.name,
      displayName: s.display_name ?? null,
      reason: s.reason,
    })),
  }
}
