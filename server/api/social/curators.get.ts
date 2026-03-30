import { getAllCurators, refreshStaleCurators } from '../../utils/atproto/curator-index'

export default defineEventHandler(async (event) => {
  const db = getDB(event)

  // Trigger stale profile refresh in the background (non-blocking)
  refreshStaleCurators(db).catch(() => {})

  const curators = await getAllCurators(db)

  // Sort by most recently published
  curators.sort((a, b) => b.lastPublished.localeCompare(a.lastPublished))

  return { curators, total: curators.length }
})
