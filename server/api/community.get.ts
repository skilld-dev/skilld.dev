import type {
  CommunityCollectionSkillRow,
  CommunityDirectoryItem,
  CommunityDirectoryRow,
} from '../utils/community'
import { getDB } from '#server/utils/db'
import {
  COMMUNITY_DIRECTORY_SQL,
  communityCollectionSkillPreviewSql,
  communityDirectoryItem,
} from '../utils/community'

export interface CommunityDirectoryResponse {
  items: CommunityDirectoryItem[]
  total: number
  ranking: 'featured_collections_then_github_stars'
  fetchedAt: string
}

export default defineCachedEventHandler(
  async (event): Promise<CommunityDirectoryResponse> => {
    const db = getDB(event)
    const result = await db
      .prepare(COMMUNITY_DIRECTORY_SQL)
      .all<CommunityDirectoryRow>()
    const rows = result.results ?? []
    const collectionIds = rows.flatMap(row => row.collection_id === null ? [] : [row.collection_id])
    const skillResult = collectionIds.length
      ? await db
          .prepare(communityCollectionSkillPreviewSql(collectionIds.length))
          .bind(...collectionIds)
          .all<CommunityCollectionSkillRow>()
      : null
    const collectionSkills = skillResult?.results ?? []

    return {
      items: rows.map(row => communityDirectoryItem(row, collectionSkills)),
      total: rows[0]?.total_creators ?? 0,
      ranking: 'featured_collections_then_github_stars',
      fetchedAt: new Date().toISOString(),
    }
  },
  { maxAge: 60, swr: false, name: 'community-directory-origin-v2' },
)
