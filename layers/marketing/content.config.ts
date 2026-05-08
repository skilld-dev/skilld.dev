import { defineCollection, defineContentConfig, z } from '@nuxt/content'

// Marketing content collections.
// See docs/adr/0001-url-pillars-and-layers.md
export default defineContentConfig({
  collections: {
    learn: defineCollection({
      type: 'page',
      source: 'learn/*.md',
      schema: z.object({
        description: z.string(),
        publishedAt: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    }),
    frameworks: defineCollection({
      type: 'page',
      source: 'frameworks/*.md',
      schema: z.object({
        description: z.string(),
        framework: z.string(),
        npmPackage: z.string().optional(),
      }),
    }),
  },
})
