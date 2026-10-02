import type { CollectionEntryRef } from '../../../../utils/collections'
import { curatorsV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { loadSkillCardRows } from '#shared/server/skill-cards'
import { pageWindow, presentSkillPage } from '../../../../presenters/collection-v1'
import { exactSkillRefs } from '../../../../utils/collections'

/** The fields of the `/api/likes/by-user/<login>` answer that v1 reads. */
interface LegacyLikedList {
  items: CollectionEntryRef[]
}

function nullWhenNotFound(error: unknown): null {
  const record = typeof error === 'object' && error !== null ? error as { statusCode?: unknown } : {}
  if (record.statusCode === 404)
    return null
  throw error
}

/**
 * Likes belong to the identity layer, so v1 reads its route in process. The
 * global `$fetch` sends no cookie and no token, so the route answers as it
 * does to an anonymous visitor: a private list is 404 even for its owner.
 * That keeps a private list out of the shared cache this operation allows.
 */
export default defineApiOperation({
  operation: curatorsV1.operations.likes,
  handler: async ({ platform, input }) => {
    const { login } = input.params
    const list = await $fetch<LegacyLikedList>(`/api/likes/by-user/${encodeURIComponent(login)}`)
      .catch(nullWhenNotFound)
    if (!list)
      return operationFailure('NOT_FOUND', `@${login} has no public list of likes.`)
    const entries = pageWindow(list.items, input.query)
    return presentSkillPage(entries, await loadSkillCardRows(platform.db, exactSkillRefs(entries)), list.items.length)
  },
})
