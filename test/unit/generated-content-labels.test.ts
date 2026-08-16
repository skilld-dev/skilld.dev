import { describe, expect, it } from 'vitest'
import { renderDigest } from '../../layers/identity/server/utils/digest-template'

const digestInput = {
  login: 'maintainer',
  windowStart: 1_700_000_000,
  windowEnd: 1_700_086_400,
  unsubscribeUrl: 'https://skilld.dev/unsubscribe/test',
  entries: [{
    owner: 'maintainer',
    repo: 'agent-skills',
    skillNames: ['review'],
    skills: [{ name: 'review', changeCount: 1, commitMessages: ['Clarify review steps'] }],
    changeCount: 1,
    summary: 'Review guidance now covers source changes.',
  }],
}

describe('generated content labels', () => {
  it('labels generated digest summaries in HTML and plain text', () => {
    const digest = renderDigest(digestInput)

    expect(digest.html).toContain('Generated summary')
    expect(digest.text).toContain('Generated summary')
  })
})
