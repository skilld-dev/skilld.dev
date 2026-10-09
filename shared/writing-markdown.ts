import { createMarkdownRenderer } from './markdown-renderer'

/** Recorded prose supports Markdown, never executable HTML or Vue components. */
export function renderWritingMarkdown(markdown: string): string {
  const renderer = createMarkdownRenderer({ html: () => '' })
  return renderer.parse(markdown) as string
}
