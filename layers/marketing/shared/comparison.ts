import { z } from 'zod'

const comparisonSourceSchema = z.object({
  selector: z.string().regex(/^[\w.-]+\/[\w.-]+\/[\w.-]+$/),
  revision: z.string().regex(/^[a-f0-9]{40}$/),
  url: z.url(),
}).refine((source) => {
  if (!URL.canParse(source.url))
    return false
  const [owner, repository] = source.selector.split('/')
  const url = new URL(source.url)
  return source.url.startsWith(`https://github.com/${owner}/${repository}/blob/${source.revision}/`)
    && url.pathname.startsWith(`/${owner}/${repository}/blob/${source.revision}/`)
    && url.pathname.endsWith('/SKILL.md')
    && !url.search && !url.hash
}, { message: 'Link each Skill to its reviewed commit and SKILL.md.' })

/** Evidence required before a comparison enters the content collection. */
export const comparisonSchema = z.object({
  targetQuery: z.string().min(1),
  reviewedAt: z.iso.date(),
  reviewDueAt: z.iso.date(),
  scope: z.string().min(1),
  methodology: z.literal('source-review'),
  disclosure: z.string().min(1),
  sources: z.array(comparisonSourceSchema).min(2),
}).refine(page => page.reviewDueAt > page.reviewedAt, {
  message: 'Set the review deadline after the source review.',
  path: ['reviewDueAt'],
}).refine(page => new Set(page.sources.map(source => source.selector)).size === page.sources.length, {
  message: 'Record each compared Skill once.',
  path: ['sources'],
})
