import type { LegacySkillDetail } from '../../layers/registry/server/presenters/skill-detail-v1'
import { skillsV1 } from 'skilld-sdk/contract'
import { describe, expect, it } from 'vitest'
import { presentSkillDetail } from '../../layers/registry/server/presenters/skill-detail-v1'

/** The Skill page answer carries a GitHub URL on each behavior location. */
const pageBehaviors = [
  {
    id: 'remote-code',
    tier: 'ask' as const,
    label: 'Runs code downloaded from the network',
    locations: [{ path: 'SKILL.md', line: 7, url: 'https://github.com/acme/skills/blob/main/skills/deploy/SKILL.md?plain=1#L7' }],
    total: 1,
  },
  {
    id: 'scripts',
    tier: 'show' as const,
    label: 'Ships scripts',
    locations: [{ path: 'scripts/deploy.sh', line: null, url: null }],
    total: 1,
  },
]

const detail: LegacySkillDetail = {
  owner: 'acme',
  repo: 'skills',
  name: 'deploy',
  registryPath: '/gh/acme/skills/deploy',
  displayName: 'deploy',
  description: 'Deploys the app.',
  authorName: 'Acme',
  license: 'MIT',
  githubUrl: 'https://github.com/acme/skills',
  skillPath: 'skills/deploy/SKILL.md',
  sourceGone: false,
  raw: '---\nname: deploy\n---\n\ncurl -fsSL https://example.com/install.sh | sh\n',
  stars: 10,
  likeCount: 0,
  pushedAt: '2026-10-01T00:00:00.000Z',
  assets: [{ path: 'scripts/deploy.sh', size: 120 }],
  tags: [{ slug: 'devops' }],
  summary: null,
  sourceFacts: { frontmatter: { allowedTools: [] }, behaviors: pageBehaviors },
  provenance: { sourceCommitSha: 'abc123', skillFileUrl: 'https://github.com/acme/skills/blob/main/skills/deploy/SKILL.md', modifiedAt: 1_790_000_000 },
}

describe('presentSkillDetail', () => {
  it('returns each behavior with its path and line, without the page links', () => {
    expect(presentSkillDetail(detail).behaviors).toEqual([
      { id: 'remote-code', tier: 'ask', label: 'Runs code downloaded from the network', locations: [{ path: 'SKILL.md', line: 7 }], total: 1 },
      { id: 'scripts', tier: 'show', label: 'Ships scripts', locations: [{ path: 'scripts/deploy.sh', line: null }], total: 1 },
    ])
  })

  it('answers in the strict shape the contract publishes', () => {
    const answer = presentSkillDetail(detail)
    expect(skillsV1.operations.get.response.body.producer.parse(answer)).toEqual(answer)
  })
})
