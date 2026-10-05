import { describe, expect, it } from 'vitest'
import { renderDigest } from '../../layers/identity/server/utils/digest-template'

describe('watched Repository digest', () => {
  it('describes watched source changes in HTML and plain text', () => {
    const result = renderDigest({
      login: 'example',
      windowStart: 90,
      windowEnd: 110,
      unsubscribeUrl: 'https://skilld.dev/me',
      entries: [{
        owner: 'example',
        repo: 'skills',
        skillNames: ['review'],
        changeCount: 1,
        skills: [{ name: 'review', description: null, changeCount: 1, changedAt: 100, commitMessages: ['Add keyboard checks'], sourceUrl: 'https://github.com/example/skills/blob/main/review/SKILL.md', changeUrl: 'https://github.com/example/skills/commit/abc' }],
      }],
    })
    for (const output of [result.html, result.text]) {
      expect(output).toContain('Add keyboard checks')
      expect(output).toContain('repos you watch')
      expect(output).not.toContain('Skills you like')
      expect(output).not.toContain('plus trending Skills')
    }
  })
})
