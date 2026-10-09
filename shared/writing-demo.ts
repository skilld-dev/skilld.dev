import { z } from 'zod'

const markdown = z.string().refine(value => value.trim().length > 0, 'A document needs Markdown.')

/** The same input, a rewrite without a Skill, and the Skill's final document. */
export const writingDemoSchema = z.object({
  documents: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    label: z.string().trim().min(1),
    original: markdown,
    baseline: markdown,
    output: markdown,
  })).min(1).refine(documents => new Set(documents.map(document => document.id)).size === documents.length, 'Document identifiers must be unique.'),
})

export type WritingDemo = z.infer<typeof writingDemoSchema>
