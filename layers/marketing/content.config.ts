import { fileURLToPath } from 'node:url'
import { defineCollection, defineContentConfig, z } from '@nuxt/content'

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
    frameworks: defineCollection({
      type: 'page',
      source: {
        cwd: marketingContentRoot,
        include: 'frameworks/*.md',
        prefix: '/frameworks',
      },
      schema: z.object({
        description: z.string(),
        framework: z.string(),
        npmPackage: z.string().optional(),
      }),
    }),
  },
})
