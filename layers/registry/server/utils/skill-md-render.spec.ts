import type { SkillImagePolicy } from './skill-md-render'
import { describe, expect, it } from 'vitest'
import { importImageProxyKey, signImageProxyUrl } from '#server/utils/image-proxy'
import { parseSkillMd } from './skill-md-render'

describe('parseSkillMd', () => {
  it('parses block descriptions and adjacent top-level fields', async () => {
    const parsed = await parseSkillMd(`---
description: >-
  Writes and refines a repository README in a concise style.
  Uses only sections supported by the repository.
license: MIT
---
# README skill`)

    expect(parsed.frontmatter).toMatchObject({
      description: 'Writes and refines a repository README in a concise style. Uses only sections supported by the repository.',
      license: 'MIT',
    })
  })

  it('adds column scope to rendered markdown table headers', async () => {
    const { html } = await parseSkillMd([
      '| Tool | Purpose |',
      '| --- | ---: |',
      '| Codex | Editing |',
    ].join('\n'))

    expect(html).toContain('<th scope="col">Tool</th>')
    expect(html).toContain('<th scope="col" align="right">Purpose</th>')
    expect(html).toContain('<td align="right">Editing</td>')
  })

  it('highlights fenced code for languages we bundle a grammar for', async () => {
    const { html } = await parseSkillMd([
      '```bash',
      'npx skilld add owner/repo',
      '```',
    ].join('\n'))

    expect(html).toContain('class="rangi shiki shj-lang-bash"')
    // The light colour is inlined and the dark one rides along as a variable,
    // so one block serves both themes.
    expect(html).toMatch(/style="color:#[0-9a-f]{3,8};--shiki-dark:#[0-9a-f]{3,8}"/i)
  })

  it('resolves fence aliases onto their canonical grammar', async () => {
    const [ts, alias] = await Promise.all([
      parseSkillMd('```typescript\nconst a: number = 1\n```'),
      parseSkillMd('```ts\nconst a: number = 1\n```'),
    ])

    expect(alias.html).toContain('class="rangi shiki shj-lang-ts"')
    expect(alias.html).toBe(ts.html)
  })

  it('falls back to a plain block for languages we do not bundle', async () => {
    const { html } = await parseSkillMd([
      '```brainfuck',
      '++++[>++++<-]',
      '```',
    ].join('\n'))

    expect(html).not.toContain('class="shiki')
    expect(html).toContain('<pre tabindex="0"><code>++++[&gt;++++&lt;-]')
  })

  it('keeps relative links scoped to each render', async () => {
    const [first, second] = await Promise.all([
      parseSkillMd('[Guide](guide.md)', {
        owner: 'first-owner',
        repo: 'first-repo',
        name: 'first-skill',
        branch: 'main',
        skillDir: 'skills/first',
        filePath: '',
      }),
      parseSkillMd('[Guide](guide.md)', {
        owner: 'second-owner',
        repo: 'second-repo',
        name: 'second-skill',
        branch: 'main',
        skillDir: 'skills/second',
        filePath: '',
      }),
    ])

    expect(first.html).toContain('/gh/first-owner/first-repo/first-skill/-/guide.md')
    expect(first.html).not.toContain('second-owner')
    expect(second.html).toContain('/gh/second-owner/second-repo/second-skill/-/guide.md')
    expect(second.html).not.toContain('first-owner')
  })

  it('preserves inline markdown while linking same-repository skill references', async () => {
    const parsed = await parseSkillMd(
      'Use `/tdd` before /diagnose with **care**. Keep `CONTEXT.md`, [linked `/tdd`](https://example.com/docs), /unknown, and https://example.com/tdd unchanged.',
      {
        owner: 'acme',
        repo: 'skills',
        name: 'diagnose',
        branch: 'main',
        skillDir: 'skills/diagnose',
        filePath: '',
        skillNames: ['diagnose', 'tdd'],
      },
    )

    expect(parsed.dependencies).toEqual(['tdd'])
    expect(parsed.html).toContain('<a href="/gh/acme/skills/tdd" data-skill-dependency="tdd">/tdd</a>')
    expect(parsed.html).not.toContain('`/tdd`')
    expect(parsed.html).toContain('<strong>care</strong>')
    expect(parsed.html).toContain('<code>CONTEXT.md</code>')
    expect(parsed.html.match(/data-skill-dependency/g)).toHaveLength(1)
    expect(parsed.html).toContain('linked <code>/tdd</code></a>')
    expect(parsed.html).toContain('/diagnose')
    expect(parsed.html).toContain('/unknown')
    expect(parsed.html).toContain('https://example.com/tdd')
  })

  describe('images', () => {
    const ctx = {
      owner: 'acme',
      repo: 'skills',
      name: 'diagnose',
      branch: 'main',
      skillDir: 'skills/diagnose',
      filePath: '',
    }

    async function render(markdown: string, images?: SkillImagePolicy): Promise<Document> {
      const { html } = await parseSkillMd(markdown, ctx, images)
      return new DOMParser().parseFromString(html, 'text/html')
    }

    async function proxy(): Promise<SkillImagePolicy> {
      const key = await importImageProxyKey('test-image-proxy-key')
      return { _tag: 'proxy', proxyUrl: href => signImageProxyUrl(key, href) }
    }

    function proxiedTarget(img: Element | null): string | null {
      const src = img?.getAttribute('src')
      if (!src?.startsWith('/_img/signed?'))
        return null
      return new URL(src, 'https://skilld.dev').searchParams.get('url')
    }

    it('shows a shields.io badge as an image loaded through the proxy', async () => {
      const badge = 'https://img.shields.io/npm/v/skilld.svg?style=flat'
      const doc = await render(`[![npm](${badge})](https://npmjs.com/package/skilld)`, await proxy())

      const img = doc.querySelector('a img')
      expect(proxiedTarget(img)).toBe(badge)
      expect(img?.getAttribute('alt')).toBe('npm')
      expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
      expect(img?.getAttribute('loading')).toBe('lazy')
      expect(doc.body.innerHTML).not.toContain('src="https://')
    })

    it.each([
      ['a relative path', './diagram.png', 'https://github.com/acme/skills/raw/main/skills/diagnose/diagram.png'],
      ['raw GitHub content', 'https://raw.githubusercontent.com/acme/skills/main/a.png', 'https://raw.githubusercontent.com/acme/skills/main/a.png'],
      ['a GitHub avatar', 'https://avatars.githubusercontent.com/u/1?v=4', 'https://avatars.githubusercontent.com/u/1?v=4'],
      ['a protocol relative URL', '//cdn.example.org/pixel.gif', 'https://cdn.example.org/pixel.gif'],
    ])('loads %s through the proxy, so GitHub never sees the visitor', async (_label, href, target) => {
      const doc = await render(`![diagram](${href})`, await proxy())

      expect(proxiedTarget(doc.querySelector('img'))).toBe(target)
    })

    it.each([
      ['plain http', 'http://raw.githubusercontent.com/acme/skills/main/a.png'],
      ['a localhost address', 'https://localhost/pixel.gif'],
      ['an IP address', 'https://127.0.0.1/pixel.gif'],
    ])('never loads an image from %s', async (_label, href) => {
      const doc = await render(`![status badge](${href})`, await proxy())

      expect(doc.querySelector('img')).toBeNull()
      expect(doc.querySelector('a')?.getAttribute('href')).toBe(href)
    })

    it('shows external images as links when the render has no proxy', async () => {
      const doc = await render('![status badge](https://img.shields.io/badge/a-b-blue)')

      expect(doc.querySelector('img')).toBeNull()
      const link = doc.querySelector('a')
      expect(link?.textContent).toBe('status badge')
      expect(link?.getAttribute('href')).toBe('https://img.shields.io/badge/a-b-blue')
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('shows an unproxied image with empty alt inside a link as visible text, not an empty anchor', async () => {
      const doc = await render('[![](https://tracker.example/pixel.gif)](https://ci.example/acme)')

      expect(doc.querySelector('img')).toBeNull()
      expect(doc.querySelectorAll('a')).toHaveLength(1)
      expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://ci.example/acme')
      expect(doc.querySelector('a')?.textContent).not.toBe('')
    })
    it.each([
      ['a mailto URL', 'mailto:badge@example.com'],
      ['a javascript URL', 'javascript:alert(1)'],
      ['a non-image data URL', 'data:text/plain,blocked'],
    ])('shows a scheme-blocked empty-alt image inside a link as visible text, not an empty anchor (%s)', async (_label, href) => {
      const doc = await render(`[![](${href})](https://ci.example/acme)`)

      expect(doc.querySelectorAll('a')).toHaveLength(1)
      expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://ci.example/acme')
      expect(doc.querySelector('a')?.textContent?.trim()).not.toBe('')
    })

    it('shows a blocked image with whitespace-only alt inside a link as visible text, not an invisible anchor', async () => {
      const doc = await render('[![ ](https://tracker.example/badge.svg)](https://ci.example/acme)')

      expect(doc.querySelector('img')).toBeNull()
      expect(doc.querySelectorAll('a')).toHaveLength(1)
      expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://ci.example/acme')
      expect(doc.querySelector('a')?.textContent?.trim()).not.toBe('')
    })
  })
})
