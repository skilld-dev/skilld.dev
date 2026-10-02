import { authenticated } from '~~/server/policies/authenticated'
import { CollectionSkillRefInput } from '~~/server/schemas/collection-skill-input'
import { addCollectionEntry, findAuthorCollectionId, findCollectionEntries } from '~~/server/utils/collections'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  schema: CollectionSkillRefInput,
  policy: [authenticated],
  handler: async ({ event, body, platform, user }) => {
    const login = getRouterParam(event, 'login') ?? ''
    const slug = getRouterParam(event, 'slug') ?? ''
    if (!login || !slug)
      throw createError({ statusCode: 400, message: 'Missing login or slug' })
    if (login !== user!.login)
      throw createError({ statusCode: 403, message: 'Not your collection' })

    const collectionId = await findAuthorCollectionId(platform.db, user!.id, slug)
    if (collectionId === null)
      throw createError({ statusCode: 404, message: 'Collection not found' })

    if ((await findCollectionEntries(platform.db, collectionId, body)).length)
      return { ok: true, alreadyPresent: true }

    await addCollectionEntry(platform.db, collectionId, body)
    return { ok: true, alreadyPresent: false }
  },
})
