import type { DuplicateCandidate } from '../../layers/registry/server/utils/skill-duplicate-canonical'
import { describe, expect, it } from 'vitest'
import { findDuplicateCanonicalGroups } from '../../layers/registry/server/utils/skill-duplicate-canonical'

function candidate(partial: Partial<DuplicateCandidate> & Pick<DuplicateCandidate, 'owner' | 'repo' | 'name'>): DuplicateCandidate {
  return {
    display_name: partial.name,
    description: null,
    rendered_raw_sha256: null,
    stars: 0,
    pushed_at: null,
    support_tier: null,
    trust_tier: 'candidate',
    ...partial,
  }
}

describe('findDuplicateCanonicalGroups', () => {
  it('does not infer canonical provenance from a shared skill name', () => {
    const groups = findDuplicateCanonicalGroups([
      candidate({
        owner: 'flutter',
        repo: 'skills',
        name: 'grill-with-docs',
        description: 'Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation inline as decisions crystallise.',
        rendered_raw_sha256: 'a'.repeat(64),
        support_tier: 'core-official',
        trust_tier: 'official',
        stars: 2768,
      }),
      candidate({
        owner: 'mattpocock',
        repo: 'skills',
        name: 'grill-with-docs',
        description: 'A relentless interview to sharpen a plan or design, which also creates docs as we go.',
        rendered_raw_sha256: 'b'.repeat(64),
        support_tier: 'trusted-author',
        trust_tier: 'official',
        stars: 201114,
      }),
    ])

    expect(groups).toEqual([])
  })

  it('does not infer canonical provenance from a shared description', () => {
    const description = 'PostHog is the leading platform for building self-driving products. Our developer tools capture all the context agents need to diagnose problems and ship fixes.'
    const groups = findDuplicateCanonicalGroups([
      candidate({ owner: 'posthog', repo: 'posthog', name: 'authenticating-as-the-user', description, rendered_raw_sha256: 'c'.repeat(64) }),
      candidate({ owner: 'posthog', repo: 'posthog', name: 'authoring-new-agents', description, rendered_raw_sha256: 'd'.repeat(64) }),
    ])

    expect(groups).toEqual([])
  })

  it('groups exact SKILL.md content identities', () => {
    const renderedRawSha256 = 'e'.repeat(64)
    const groups = findDuplicateCanonicalGroups([
      candidate({ owner: 'source', repo: 'skills', name: 'vue-testing', rendered_raw_sha256: renderedRawSha256, trust_tier: 'official' }),
      candidate({ owner: 'mirror', repo: 'skills', name: 'vue-testing', rendered_raw_sha256: renderedRawSha256, trust_tier: 'candidate' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      reason: 'duplicate_content',
      canonical: { owner: 'source' },
      duplicates: [{ owner: 'mirror' }],
    })
  })
})
