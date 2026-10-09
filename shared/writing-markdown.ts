import type { Renderer } from 'marked'
import { Marked } from 'marked'
import { escapeHtml, highlightToHtml } from './highlight'

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Recorded prose supports Markdown, never executable HTML or Vue components. */
export function renderWritingMarkdown(markdown: string): string {
  const renderer = new Marked({
    async: false,
    gfm: true,
    renderer: {
      html: () => '',
      code: ({ text, lang }) => highlightToHtml(text, lang) ?? `<pre tabindex="0"><code>${escapeHtml(text)}</code></pre>\n`,
      // Generated images are not part of a writing demo. Show their alt text without making a request.
      image: ({ text }) => escapeAttribute(text),
      link(this: Renderer, { href, tokens }) {
        const text = this.parser.parseInline(tokens)
        const url = URL.parse(href)
        if (!url || !['https:', 'http:'].includes(url.protocol))
          return text
        return `<a href="${escapeAttribute(url.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
      },
    },
  })
  return renderer.parse(markdown) as string
}
