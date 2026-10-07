import { describe, expect, it } from 'vitest'
import { composeAgentSkillMarkdown } from './skill-agent-markdown'

const skill = { owner: 'nestyme', repo: 'awesome-prompts', name: 'carousel-styles' }

const SKILL_MD = `---
name: carousel-styles
description: Design photo-carousel slides.
---

# Carousel Styles

Full PIL primitives in [reference.md](reference.md).
`

describe('composeAgentSkillMarkdown', () => {
  it('keeps the frontmatter first and puts the guidance before the body', () => {
    const output = composeAgentSkillMarkdown({ ...skill, markdown: SKILL_MD, supportingFiles: [] })

    expect(output.startsWith('---\nname: carousel-styles\n')).toBe(true)
    const guidanceAt = output.indexOf('follow the instructions below for this session')
    const bodyAt = output.indexOf('# Carousel Styles')
    expect(guidanceAt).toBeGreaterThan(0)
    expect(bodyAt).toBeGreaterThan(guidanceAt)
    expect(output).toContain('You do not need to install anything.')
  })

  it('lists the files beside SKILL.md at the raw endpoint', () => {
    const output = composeAgentSkillMarkdown({
      ...skill,
      markdown: SKILL_MD,
      supportingFiles: [{ path: 'reference.md' }, { path: 'scripts/render.py' }],
    })

    expect(output).toContain('[reference.md](https://skilld.dev/api/skills-raw/nestyme/awesome-prompts/carousel-styles/reference.md)')
    expect(output).toContain('[scripts/render.py](https://skilld.dev/api/skills-raw/nestyme/awesome-prompts/carousel-styles/scripts/render.py)')
  })

  it('says nothing about supporting files when there are none', () => {
    const output = composeAgentSkillMarkdown({ ...skill, markdown: SKILL_MD, supportingFiles: [] })

    expect(output).not.toContain('Supporting files')
  })

  it('points at the raw endpoint pattern instead of listing a long inventory', () => {
    const supportingFiles = Array.from({ length: 21 }, (_, i) => ({ path: `refs/${i}.md` }))
    const output = composeAgentSkillMarkdown({ ...skill, markdown: SKILL_MD, supportingFiles })

    expect(output).toContain('21 supporting files')
    expect(output).toContain('https://skilld.dev/api/skills-raw/nestyme/awesome-prompts/carousel-styles/PATH')
    expect(output).not.toContain('refs/20.md')
  })

  it('rewrites relative links and images to the raw endpoint', () => {
    const output = composeAgentSkillMarkdown({
      ...skill,
      markdown: [
        'See [the reference](./reference.md#rules) and [api](refs/../refs/api.md "API").',
        '![diagram](assets/flow.png)',
      ].join('\n'),
      supportingFiles: [],
    })

    expect(output).toContain('[the reference](https://skilld.dev/api/skills-raw/nestyme/awesome-prompts/carousel-styles/reference.md#rules)')
    expect(output).toContain('[api](https://skilld.dev/api/skills-raw/nestyme/awesome-prompts/carousel-styles/refs/api.md "API")')
    expect(output).toContain('![diagram](https://skilld.dev/api/skills-raw/nestyme/awesome-prompts/carousel-styles/assets/flow.png)')
  })

  it('leaves absolute links, anchors, parent paths, and fenced code alone', () => {
    const markdown = [
      '[site](https://example.com/a.md) [root](/gh/x/y/z) [anchor](#rules) [parent](../other/SKILL.md)',
      '```md',
      '[inside a fence](reference.md)',
      '```',
    ].join('\n')
    const output = composeAgentSkillMarkdown({ ...skill, markdown, supportingFiles: [] })

    expect(output).toContain(markdown)
  })
})
