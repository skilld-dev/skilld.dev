import { describe, expect, it } from 'vitest'
import { parseSkillMd } from './skill-md-render'

describe('parseSkillMd', () => {
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
      'npx skilld add gh:owner/repo',
      '```',
    ].join('\n'))

    expect(html).toContain('class="shiki')
    // `defaultColor: false` emits per-span vars for both themes rather than
    // baking one theme's colours into the markup.
    expect(html).toContain('--shiki-light')
    expect(html).toContain('--shiki-dark')
  })

  it('resolves fence aliases onto their canonical grammar', async () => {
    const [ts, alias] = await Promise.all([
      parseSkillMd('```typescript\nconst a: number = 1\n```'),
      parseSkillMd('```ts\nconst a: number = 1\n```'),
    ])

    expect(alias.html).toContain('class="shiki')
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

  it('links valid same-repository skill references in prose', async () => {
    const parsed = await parseSkillMd(
      'Use /tdd before /diagnose. Keep `/tdd`, /unknown, and https://example.com/tdd unchanged.',
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
    expect(parsed.html).toContain('<code>/tdd</code>')
    expect(parsed.html).toContain('/diagnose')
    expect(parsed.html).toContain('/unknown')
    expect(parsed.html).toContain('https://example.com/tdd')
  })
})
