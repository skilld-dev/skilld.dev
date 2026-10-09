import { diffLines } from 'diff'
import { highlightCodeLines } from './highlight'

type DiffLine = { text: string, html: string } & (
  | { kind: 'context', originalLine: number, updatedLine: number }
  | { kind: 'removed', originalLine: number, updatedLine: null }
  | { kind: 'added', originalLine: null, updatedLine: number }
)

/** Compare exact source files. Highlight each file before matching its lines. */
export function writingDiff(original: string, updated: string): DiffLine[] {
  const originalHtml = highlightCodeLines(original, 'md')
  const updatedHtml = highlightCodeLines(updated, 'md')
  let originalLine = 1
  let updatedLine = 1
  return diffLines(original, updated, { oneChangePerToken: true }).map(({ value: text, added, removed }) => {
    if (added)
      return { kind: 'added', originalLine: null, updatedLine, text, html: updatedHtml[updatedLine++ - 1]! }
    if (removed)
      return { kind: 'removed', originalLine, updatedLine: null, text, html: originalHtml[originalLine++ - 1]! }
    return { kind: 'context', originalLine: originalLine++, updatedLine, text, html: updatedHtml[updatedLine++ - 1]! }
  })
}
