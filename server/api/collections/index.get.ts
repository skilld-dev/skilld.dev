import { getCollectionsIndex } from '../../utils/atproto/collections'
import { getDB } from '../../utils/db'

export default defineEventHandler(async (event) => {
  return getCollectionsIndex(getDB(event))
})
