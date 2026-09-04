import { fileURLToPath } from 'node:url'
import { defineCollection, defineContentConfig } from '@harlan-zw/comark-content'
import { z } from 'zod'

const marketingContentRoot = fileURLToPath(new URL('./content', import.meta.url))

// One article shape for every Markdown page the marketing layer renders.
// `command` or `cta` names the page's one primary action; `label` and
// `author` feed the data line under the heading.
const articleSchema = z.object({
  description: z.string(),
  /** Visible H1 when it differs from the title tag. */
  heading: z.string().optional(),
  label: z.string().optional(),
  author: z.string().optional(),
  command: z.string().optional(),
  cta: z.object({ label: z.string(), to: z.string() }).optional(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

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
      schema: articleSchema,
    }),
    // Root-level marketing articles: /verify, /docs/cli, /vs/*. Each has a
    // static page file so the route lands in the pages sitemap.
    pages: defineCollection({
      type: 'page',
      source: {
        cwd: marketingContentRoot,
        include: 'pages/**/*.md',
        prefix: '/',
      },
      schema: articleSchema,
    }),
    // One page per Agent target with measured search demand. The route list
    // and the paths on each page live in `app/utils/agent-pages.ts`.
    agents: defineCollection({
      type: 'page',
      source: {
        cwd: marketingContentRoot,
        include: 'agents/*.md',
        prefix: '/agents',
      },
      schema: articleSchema,
    }),
  },
})
