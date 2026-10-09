import type { Renderer, RendererObject } from 'marked'
import { Marked } from 'marked'
import { escapeHtml, highlightToHtml } from './highlight'

/** Shared GFM and code rendering. Callers supply source-specific links and HTML policy. */
export function createMarkdownRenderer(overrides: RendererObject = {}): Marked {
  return new Marked({
    async: false,
    gfm: true,
    renderer: {
      html: ({ text }) => escapeHtml(text),
      image: ({ text }) => escapeHtml(text),
      code: ({ text, lang }) => highlightToHtml(text, lang) ?? `<pre tabindex="0"><code>${escapeHtml(text)}</code></pre>`,
      link(this: Renderer, { href, tokens }) {
        const text = this.parser.parseInline(tokens)
        const url = URL.parse(href)
        if (!url || !['https:', 'http:'].includes(url.protocol))
          return text
        return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
      },
      tablecell(this: Renderer, token) {
        const tag = token.header ? 'th' : 'td'
        const scope = token.header ? ' scope="col"' : ''
        const align = token.align ? ` align="${token.align}"` : ''
        return `<${tag}${scope}${align}>${this.parser.parseInline(token.tokens)}</${tag}>\n`
      },
      ...overrides,
    },
  })
}
