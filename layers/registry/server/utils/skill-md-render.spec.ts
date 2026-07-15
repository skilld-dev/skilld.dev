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
})
