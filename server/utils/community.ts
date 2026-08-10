export const COMMUNITY_DIRECTORY_LIMIT = 60
export const COMMUNITY_COLLECTION_SKILL_PREVIEW_LIMIT = 4

export const COMMUNITY_DIRECTORY_SQL = `
WITH user_keys AS (
  SELECT
    u.*,
    LOWER(REPLACE(REPLACE(u.login, '-', ''), '_', '')) AS login_key
  FROM users u
),
identity_users AS (
  SELECT
    legacy.*,
    COALESCE(
      (
        SELECT real.id
        FROM user_keys real
        WHERE legacy.github_id < 0
          AND real.github_id >= 0
          AND real.login_key = legacy.login_key
          AND (
            legacy.name IS NULL
            OR real.name IS NULL
            OR LOWER(real.name) = LOWER(legacy.name)
          )
        ORDER BY real.last_login_at DESC, real.id ASC
        LIMIT 1
      ),
      legacy.id
    ) AS identity_id
  FROM user_keys legacy
),
canonical_users AS (
  SELECT
    identity_users.*,
    ROW_NUMBER() OVER (
      PARTITION BY identity_id
      ORDER BY CASE WHEN github_id >= 0 THEN 1 ELSE 0 END DESC,
               last_login_at DESC,
               id ASC
    ) AS identity_rank
  FROM identity_users
),
ranked_collections AS (
  SELECT
    c.id,
    iu.identity_id,
    iu.login AS author_login,
    c.slug,
    c.name,
    c.preamble,
    c.featured,
    c.updated_at,
    COUNT(*) OVER (PARTITION BY iu.identity_id) AS collection_count,
    ROW_NUMBER() OVER (
      PARTITION BY iu.identity_id
      ORDER BY c.featured DESC, c.updated_at DESC, c.id DESC
    ) AS collection_rank
  FROM collections_v2 c
  JOIN identity_users iu ON iu.id = c.author_user_id
  WHERE c.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM collection_skills_v2 cs
      WHERE cs.collection_id = c.id
    )
),
ranked_skills AS (
  SELECT
    iu.identity_id,
    s.owner,
    s.repo,
    s.name,
    s.display_name,
    s.description,
    s.modified_at,
    r.stars,
    COUNT(*) OVER (PARTITION BY iu.identity_id) AS skill_count,
    ROW_NUMBER() OVER (
      PARTITION BY iu.identity_id
      ORDER BY r.stars DESC,
               COALESCE(s.modified_at, 0) DESC,
               s.name COLLATE NOCASE ASC,
               s.repo COLLATE NOCASE ASC
    ) AS skill_rank
  FROM identity_users iu
  JOIN skills s ON s.owner = iu.login COLLATE NOCASE
  JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
  WHERE s.source_resolved = 1
    AND s.rendered_status = 'ok'
    AND r.broken_since IS NULL
),
creators AS (
  SELECT
    u.id,
    u.login,
    u.name AS user_name,
    u.avatar,
    rc.id AS collection_id,
    rc.author_login AS collection_author_login,
    rc.slug AS collection_slug,
    rc.name AS collection_name,
    rc.preamble AS collection_preamble,
    rc.featured AS collection_featured,
    rc.updated_at AS collection_updated_at,
    rc.collection_count,
    (
      SELECT COUNT(*)
      FROM collection_skills_v2 cs
      WHERE cs.collection_id = rc.id
    ) AS collection_skill_count,
    rs.owner AS skill_owner,
    rs.repo AS skill_repo,
    rs.name AS skill_name,
    rs.display_name AS skill_display_name,
    rs.description AS skill_description,
    rs.modified_at AS skill_modified_at,
    rs.stars AS skill_stars,
    rs.skill_count
  FROM canonical_users u
  LEFT JOIN ranked_collections rc
    ON rc.identity_id = u.identity_id AND rc.collection_rank = 1
  LEFT JOIN ranked_skills rs
    ON rs.identity_id = u.identity_id AND rs.skill_rank = 1
  WHERE u.identity_rank = 1
    AND (rc.id IS NOT NULL OR rs.name IS NOT NULL)
)
SELECT creators.*, COUNT(*) OVER () AS total_creators
FROM creators
ORDER BY COALESCE(collection_featured, 0) DESC,
         CASE WHEN collection_id IS NOT NULL AND skill_name IS NOT NULL THEN 1 ELSE 0 END DESC,
         COALESCE(skill_stars, -1) DESC,
         MAX(COALESCE(collection_updated_at, 0), COALESCE(skill_modified_at, 0)) DESC,
         login COLLATE NOCASE ASC
LIMIT ${COMMUNITY_DIRECTORY_LIMIT}
`

export interface CommunityDirectoryRow {
  id: number
  login: string
  user_name: string | null
  avatar: string | null
  collection_id: number | null
  collection_author_login: string | null
  collection_slug: string | null
  collection_name: string | null
  collection_preamble: string | null
  collection_featured: number | null
  collection_updated_at: number | null
  collection_count: number | null
  collection_skill_count: number | null
  skill_owner: string | null
  skill_repo: string | null
  skill_name: string | null
  skill_display_name: string | null
  skill_description: string | null
  skill_modified_at: number | null
  skill_stars: number | null
  skill_count: number | null
  total_creators: number
}

export interface CommunityCollectionSkillRow {
  collection_id: number
  owner: string
  repo: string
  name: string
  display_name: string | null
  preview_rank: number
}

export interface CommunityCollectionSkill {
  owner: string
  repo: string
  name: string
  displayName: string | null
}

export interface CommunityDirectoryItem {
  id: number
  login: string
  name: string | null
  avatar: string | null
  collectionCount: number
  skillCount: number
  featured: boolean
  activityAt: number
  topCollection: {
    authorLogin: string
    slug: string
    name: string
    preamble: string | null
    skillCount: number
    skills: CommunityCollectionSkill[]
    updatedAt: number
  } | null
  topSkill: {
    owner: string
    repo: string
    name: string
    displayName: string | null
    description: string | null
    stars: number
    modifiedAt: number | null
  } | null
}

export function communityCollectionSkillPreviewSql(collectionCount: number): string {
  const placeholders = Array.from({ length: collectionCount }).fill('?').join(', ')

  return `
SELECT collection_id, owner, repo, COALESCE(name, repo) AS name, display_name, preview_rank
FROM (
  SELECT
    cs.collection_id,
    cs.owner,
    cs.repo,
    cs.name,
    s.display_name,
    ROW_NUMBER() OVER (
      PARTITION BY cs.collection_id
      ORDER BY cs.position ASC, cs.owner COLLATE NOCASE ASC,
               cs.repo COLLATE NOCASE ASC, cs.name COLLATE NOCASE ASC
    ) AS preview_rank
  FROM collection_skills_v2 cs
  LEFT JOIN skills s
    ON s.owner = cs.owner COLLATE NOCASE
   AND s.repo = cs.repo COLLATE NOCASE
   AND s.name = cs.name COLLATE NOCASE
  WHERE cs.collection_id IN (${placeholders})
)
WHERE preview_rank <= ${COMMUNITY_COLLECTION_SKILL_PREVIEW_LIMIT}
ORDER BY collection_id ASC, preview_rank ASC
`
}

export function communityDirectoryItem(
  row: CommunityDirectoryRow,
  collectionSkills: CommunityCollectionSkillRow[],
): CommunityDirectoryItem {
  const topCollection = row.collection_id !== null
    && row.collection_author_login !== null
    && row.collection_slug !== null
    && row.collection_name !== null
    && row.collection_updated_at !== null
    ? {
        authorLogin: row.collection_author_login,
        slug: row.collection_slug,
        name: row.collection_name,
        preamble: row.collection_preamble,
        skillCount: row.collection_skill_count ?? 0,
        skills: collectionSkills
          .filter(skill => skill.collection_id === row.collection_id)
          .map(skill => ({
            owner: skill.owner,
            repo: skill.repo,
            name: skill.name,
            displayName: skill.display_name,
          })),
        updatedAt: row.collection_updated_at,
      }
    : null

  const topSkill = row.skill_owner !== null
    && row.skill_repo !== null
    && row.skill_name !== null
    ? {
        owner: row.skill_owner,
        repo: row.skill_repo,
        name: row.skill_name,
        displayName: row.skill_display_name,
        description: row.skill_description,
        stars: row.skill_stars ?? 0,
        modifiedAt: row.skill_modified_at,
      }
    : null

  return {
    id: row.id,
    login: row.login,
    name: row.user_name,
    avatar: row.avatar,
    collectionCount: row.collection_count ?? 0,
    skillCount: row.skill_count ?? 0,
    featured: row.collection_featured === 1,
    activityAt: Math.max(row.collection_updated_at ?? 0, row.skill_modified_at ?? 0),
    topCollection,
    topSkill,
  }
}
