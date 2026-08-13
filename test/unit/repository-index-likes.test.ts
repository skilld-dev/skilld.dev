import { describe, expect, it, vi } from 'vitest'
import { likeIndexedSkills } from '../../app/utils/repository-index-likes'

const repository = { owner: 'nuxt', repo: 'ui' }
const skills = [
  { name: 'design-tokens', slug: 'nuxt/ui/design-tokens', path: 'skills/design-tokens/SKILL.md', description: 'Design tokens', likeCount: 2 },
  { name: 'motion', slug: 'nuxt/ui/motion', path: 'skills/motion/SKILL.md', description: 'Motion', likeCount: 1 },
]

describe('likeIndexedSkills', () => {
  it('does not write likes for an anonymous visitor', async () => {
    const ensureLiked = vi.fn()

    const result = await likeIndexedSkills(repository, skills, {
      authenticated: false,
      ensureLiked,
    })

    expect(result).toEqual({ _tag: 'anonymous' })
    expect(ensureLiked).not.toHaveBeenCalled()
  })

  it('likes every indexed skill for a signed-in visitor', async () => {
    const ensureLiked = vi.fn().mockResolvedValue(true)

    const result = await likeIndexedSkills(repository, skills, {
      authenticated: true,
      ensureLiked,
    })

    expect(result).toEqual({ _tag: 'liked' })
    expect(ensureLiked.mock.calls.map(([ref]) => ref)).toEqual([
      { owner: 'nuxt', repo: 'ui', name: 'design-tokens' },
      { owner: 'nuxt', repo: 'ui', name: 'motion' },
    ])
  })

  it('keeps indexed results when one automatic like fails', async () => {
    const ensureLiked = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const result = await likeIndexedSkills(repository, skills, {
      authenticated: true,
      ensureLiked,
    })

    expect(result).toEqual({
      _tag: 'partial',
      failed: [{ owner: 'nuxt', repo: 'ui', name: 'motion' }],
    })
  })
})
