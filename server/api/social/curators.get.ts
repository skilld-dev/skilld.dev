import { getAllCurators, refreshStaleCurators } from '../../utils/atproto/curator-index'

export default defineEventHandler(async (event) => {
  const db = getDB(event)

  // Trigger stale profile refresh in the background (non-blocking)
  refreshStaleCurators(db).then(
    (counts) => {
      if (counts.refreshed)
        console.info(`[curators] Refreshed ${counts.refreshed} stale profiles`)
    },
    (err) => { console.warn('[curators] Failed to refresh stale profiles:', err) },
  )

  const curators = await getAllCurators(db)

  // Sort by most recently published
  curators.sort((a, b) => b.lastPublished.localeCompare(a.lastPublished))

  return { curators, total: curators.length }
})
