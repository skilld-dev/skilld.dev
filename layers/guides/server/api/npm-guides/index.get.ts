import { defineApiHandler } from '#shared/server/handler'
import { listGuides } from '../../utils/npm-guides'

export default defineApiHandler({
  handler: ({ event }) => listGuides(event),
})
