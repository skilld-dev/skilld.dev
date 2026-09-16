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
})
