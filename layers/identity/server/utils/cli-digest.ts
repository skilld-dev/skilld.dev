import type { DigestResponse } from 'skilld-protocol/wire'
import type { DigestSelection } from './digest-select'

export function toCliDigest(selection: DigestSelection): DigestResponse {
  return {
    user: { id: selection.user.id, login: selection.user.login },
    windowStart: selection.windowStart,
    windowEnd: selection.windowEnd,
    entries: selection.entries.flatMap(entry => entry.skills.map(skill => ({
      repo: `${entry.owner}/${entry.repo}`,
      skill: skill.name,
      at: new Date(skill.changedAt * 1000).toISOString(),
      summary: skill.commitMessages[0] ?? skill.description ?? undefined,
    }))),
  }
}
