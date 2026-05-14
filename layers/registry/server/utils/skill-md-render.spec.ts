import { describe, expect, it } from 'vitest'
import { parseSkillMd } from './skill-md-render'

describe('parseSkillMd', () => {
  it('adds column scope to rendered markdown table headers', () => {
    const { html } = parseSkillMd([
      '| Tool | Purpose |',
      '| --- | ---: |',
      '| Codex | Editing |',
    ].join('\n'))

    expect(html).toContain('<th scope="col">Tool</th>')
    expect(html).toContain('<th scope="col" align="right">Purpose</th>')
    expect(html).toContain('<td align="right">Editing</td>')
  })
})
