import { authenticated } from '~~/server/policies/authenticated'
import { createdCollectionPresenter } from '~~/server/presenters/collection'
import { CreateCollectionInput } from '~~/server/schemas/collection-input'
import { createCollection } from '~~/server/utils/collections'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  schema: CreateCollectionInput,
  policy: [authenticated],
  presenter: createdCollectionPresenter,
  handler: async ({ body, platform, user }) => {
    const { slug, name, preamble, skills } = body
    const outcome = await createCollection(platform.db, user!.id, {
      slug,
      name,
      preamble,
      skills: skills.map(skill => ({
        owner: skill.owner,
        repo: skill.repo,
        name: skill.name ?? null,
        reason: skill.reason ?? null,
      })),
    })
    if (outcome._tag === 'SlugTaken')
      throw createError({ statusCode: 409, message: 'Slug already in use' })

    return { id: outcome.id, login: user!.login as string, slug }
  },
})
