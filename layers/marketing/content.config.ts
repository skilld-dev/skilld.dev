import { fileURLToPath } from 'node:url'
import { defineCollection, defineContentConfig } from '@harlan-zw/comark-content'
import { z } from 'zod'

const marketingContentRoot = fileURLToPath(new URL('./content', import.meta.url))

// Marketing content collections.
// See docs/adr/0001-url-pillars-and-layers.md
export default defineContentConfig({
  collections: {
    learn: defineCollection({
      type: 'page',
      source: {
        cwd: marketingContentRoot,
        include: 'learn/*.md',
        prefix: '/learn',
      },
      schema: z.object({
        description: z.string(),
        publishedAt: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    }),
  },
})
