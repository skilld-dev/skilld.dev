import { describe, expect, it } from 'vitest'
import { parseMdxg } from '../src/runtime/utils/mdxg'

describe('parseMdxg', () => {
  it('parses Comark documents into renderable virtual pages', async () => {
    const result = await parseMdxg(`---
title: Guide
---

# Start

\`\`\`ts
const enabled = true
\`\`\`

## Finish
`)

    expect(result.document.frontmatter.title).toBe('Guide')
    expect(result.pages.map(page => page.slug)).toEqual(['start', 'finish'])
    expect(result.pages[0]!.document.nodes).toEqual(expect.arrayContaining([
      expect.arrayContaining(['h1', expect.objectContaining({ id: 'start' })]),
      expect.arrayContaining(['pre', expect.any(Object)]),
    ]))
  })
})
