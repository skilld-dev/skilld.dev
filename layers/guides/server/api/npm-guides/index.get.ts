import { listGuides } from '#layers/guides/server/utils/npm-guides'
import { defineApiHandler } from '#shared/server/handler'

export default defineApiHandler({
  handler: ({ event }) => listGuides(event),
})
