import { describe, expect, it } from 'vitest'
import { renderDigest } from '../../layers/identity/server/utils/digest-template'

const skill = {
  name: 'review',
  description: 'A generic description of what this Skill does.',
  changeCount: 2,
  commitMessages: ['fix: handle keyboard focus\n\nDetailed author explanation', 'feat: check dialog labels'],
  changedAt: 100,
  sourceUrl: 'https://github.com/acme/skills/blob/main/review/SKILL.md',
  changeUrl: 'https://github.com/acme/skills/commit/abc',
}
function render(commitMessages = skill.commitMessages) {
  const entry = {
    owner: 'acme',
    repo: 'skills',
    skillNames: ['review'],
    changeCount: 2,
    summary: 'A generated sentence that hides the actual commits.',
    skills: [{ ...skill, commitMessages }],
  }
  return renderDigest({ login: 'reader', windowStart: 1, windowEnd: 200, entries: [entry], unsubscribeUrl: 'https://skilld.dev/api/unsubscribe?t=example' })
}

describe('digest commit content', () => {
  it('shows author commit subjects even when delivery has a generated summary', () => {
    const rendered = render()
    for (const content of [rendered.html, rendered.text]) {
      expect(content).toContain('fix: handle keyboard focus')
      expect(content).toContain('feat: check dialog labels')
      expect(content).not.toContain('A generated sentence')
      expect(content).not.toContain(skill.description)
      expect(content).toContain('https://github.com/acme/skills/commits/main/review/SKILL.md')
    }
  })
  it('explains missing commit details without substituting a Skill description', () => {
    const rendered = render([])
    for (const content of [rendered.html, rendered.text]) {
      expect(content).toContain('Commit details are unavailable.')
      expect(content).not.toContain(skill.description)
    }
  })
})
