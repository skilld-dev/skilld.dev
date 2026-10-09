import { z } from 'zod'

export const documentLabels = ['reading-list.md', 'README.md', 'pr.md'] as const
export const rewritePrompt = 'Rewrite these Markdown documents to remove AI writing tells and make them clear and natural. Preserve all facts, uncertainty, code, links, identifiers, and useful document structure. Return only the requested documents, without review notes.'
const markdown = z.string().refine(text => text.trim().length > 0, 'A document needs Markdown.')
export const evalDocumentsSchema = z.object({
  'reading-list.md': markdown,
  'README.md': markdown,
  'pr.md': markdown,
}).strict()
export type EvalDocuments = z.infer<typeof evalDocumentsSchema>

/** Refuse malformed responses and tool activity rather than silently recording a partial run. */
export function parseWritingResponse(events: string): EvalDocuments {
  const rows = events.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string, part?: { text?: string }, error?: unknown })
  const failure = rows.find(row => row.type === 'error' || row.type === 'tool_use')
  if (failure)
    throw new Error(`OpenCode returned ${failure.type}: ${JSON.stringify(failure.error ?? failure.part)}`)
  const text = rows.filter(row => row.type === 'text').map(row => row.part?.text ?? '').join('\n').trim()
  return evalDocumentsSchema.parse(JSON.parse(text.replace(/^```json\s*\n/, '').replace(/\n```$/, '')))
}

/** Exact material is checked separately from prose. This does not score writing quality or factual completeness. */
export function checkWritingMaterial(original: EvalDocuments, output: EvalDocuments): { file: string, missing: string[] }[] {
  return documentLabels.map((file) => {
    const code = [...original[file].matchAll(/^```[^\n]*\n[\s\S]*?^```/gm)].map(match => match[0])
    const outsideCode = original[file].replace(/^```[^\n]*\n[\s\S]*?^```/gm, '')
    const identifiers = [...outsideCode.matchAll(/`([^`\n]+)`/g)].map(match => match[1]!)
    const links = [...original[file].matchAll(/https?:\/\/[^\s)>'"`]+/g)].map(match => match[0])
    return { file, missing: [...new Set([...code, ...identifiers, ...links])].filter(value => !output[file].includes(value)) }
  })
}
