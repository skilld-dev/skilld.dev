import type { H3Event } from 'h3'
import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import registerPlugin from '../../server/plugins/robots-header'

vi.hoisted(() => {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
})

async function convert(html: string, initialRobots = 'index,follow') {
  let onMarkdown: ((context: { html: string, event?: H3Event }) => void) | undefined
  registerPlugin({ hooks: { hook(name: string, callback: typeof onMarkdown) {
    if (name === 'ai-ready:page:markdown')
      onMarkdown = callback
  } } } as unknown as Parameters<typeof registerPlugin>[0])
  const app = createApp()
  app.use(defineEventHandler((event) => {
    event.node.res.setHeader('x-robots-tag', initialRobots)
    onMarkdown?.({ html, event })
    return '# Converted page'
  }))
  return toWebHandler(app)(new Request('http://localhost/gh/author/repository.md'))
}

describe('converted Markdown indexing directives', () => {
  it('keeps an excluded HTML page excluded after conversion', async () => {
    const response = await convert('<meta name="robots" content="noindex,follow"><h1>Repository</h1>')
    expect(response.headers.get('x-robots-tag')).toBe('noindex,follow')
  })

  it('retains the index directive from an admitted HTML page', async () => {
    const response = await convert('<meta name="robots" content="index,follow"><h1>Skill</h1>', 'noindex,follow')
    expect(response.headers.get('x-robots-tag')).toBe('index,follow')
  })

  it('preserves the response policy when the HTML has no directive', async () => {
    const response = await convert('<h1>Page</h1>', 'noindex,follow')
    expect(response.headers.get('x-robots-tag')).toBe('noindex,follow')
  })
})
