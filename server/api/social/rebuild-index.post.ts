import { rebuildIndex } from '../../utils/atproto/curator-index'

/** Admin endpoint to rebuild the curator index from network state. */
export default defineEventHandler(async (event) => {
  // Require admin secret to prevent abuse
  const config = useRuntimeConfig(event)
  const auth = getHeader(event, 'authorization')
  if (!config.adminSecret || auth !== `Bearer ${config.adminSecret}`)
    throw createError({ statusCode: 403, message: 'Forbidden' })

  const result = await rebuildIndex()
  return result
})
