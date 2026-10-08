import { z } from 'zod'

const context = {
  surface: z.enum(['home-hero-demo', 'home-demos', 'demos', 'demos-page']),
  slug: z.string().max(384).regex(/^[\w.-]+\/[\w.-]+\/[\w.-]+$/),
  campaign: z.enum(['direct', 'demo-component', 'demo-page', 'demo-motion']),
}
const elapsed = z.enum(['unseen', 'under-10s', '10-29s', '30-119s', '120s-plus'])
export const DemoEngagementInput = z.discriminatedUnion('event', [
  z.object({ ...context, event: z.literal('exposure') }).strict(),
  z.object({ ...context, event: z.literal('share'), elapsed }).strict(),
  z.object({ ...context, event: z.literal('copy'), format: z.enum(['agent', 'terminal']), elapsed }).strict(),
])
