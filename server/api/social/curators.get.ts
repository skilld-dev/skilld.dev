import { getAllCurators, refreshStaleCurators } from '../../utils/atproto/curator-index'

export default defineEventHandler(async () => {
  // Trigger stale profile refresh in the background (non-blocking)
  refreshStaleCurators().catch(() => {})

  const curators = await getAllCurators()

  // Sort by most recently published
  curators.sort((a, b) => b.lastPublished.localeCompare(a.lastPublished))

  return { curators, total: curators.length }
})
