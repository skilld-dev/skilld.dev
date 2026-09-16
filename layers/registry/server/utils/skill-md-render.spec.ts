import { describe, expect, it } from 'vitest'
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

    async function render(markdown: string): Promise<Document> {
      const { html } = await parseSkillMd(markdown, ctx)
      return new DOMParser().parseFromString(html, 'text/html')
    }

    it.each([
      ['a relative path', './diagram.png', 'https://github.com/acme/skills/raw/main/skills/diagnose/diagram.png'],
      ['raw GitHub content', 'https://raw.githubusercontent.com/acme/skills/main/a.png', 'https://raw.githubusercontent.com/acme/skills/main/a.png'],
      ['a GitHub raw path', 'https://github.com/acme/skills/raw/main/a.png', 'https://github.com/acme/skills/raw/main/a.png'],
      ['a GitHub attachment', 'https://github.com/user-attachments/assets/0a1b2c', 'https://github.com/user-attachments/assets/0a1b2c'],
      ['a GitHub user image', 'https://user-images.githubusercontent.com/1/a.png', 'https://user-images.githubusercontent.com/1/a.png'],
      ['a private GitHub user image', 'https://private-user-images.githubusercontent.com/1/a.png?jwt=x', 'https://private-user-images.githubusercontent.com/1/a.png?jwt=x'],
      ['a GitHub avatar', 'https://avatars.githubusercontent.com/u/1?v=4', 'https://avatars.githubusercontent.com/u/1?v=4'],
    ])('shows %s as an image that sends no referrer', async (_label, href, src) => {
      const doc = await render(`![diagram](${href})`)

      const img = doc.querySelector('img')
      expect(img?.getAttribute('src')).toBe(src)
      expect(img?.getAttribute('alt')).toBe('diagram')
      expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
      expect(img?.getAttribute('loading')).toBe('lazy')
    })

    it.each([
      ['another host', 'https://tracker.example/pixel.gif'],
      ['plain http', 'http://raw.githubusercontent.com/acme/skills/main/a.png'],
      ['a protocol relative URL', '//tracker.example/pixel.gif'],
      ['a lookalike host', 'https://raw.githubusercontent.com.tracker.example/a.png'],
      ['a GitHub page that is not a raw file', 'https://github.com/acme/skills/issues/1'],
    ])('shows an image from %s as a link and never loads it', async (_label, href) => {
      const doc = await render(`![status badge](${href})`)

      expect(doc.querySelector('img')).toBeNull()
      const link = doc.querySelector('a')
      expect(link?.textContent).toBe('status badge')
      expect(link?.getAttribute('href')).toBe(href.startsWith('//') ? `https:${href}` : href)
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('shows a blocked image inside a link as the link text', async () => {
      const doc = await render('[![build](https://tracker.example/badge.svg)](https://ci.example/acme)')

      expect(doc.querySelector('img')).toBeNull()
      expect(doc.querySelectorAll('a')).toHaveLength(1)
      expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://ci.example/acme')
      expect(doc.querySelector('a')?.textContent).toBe('build')
    })
  })
})
