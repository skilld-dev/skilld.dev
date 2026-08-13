import { describe, expect, it } from 'vitest'
import { resolveOwnerProfileHandoff } from '../../layers/registry/app/utils/owner-profile-handoff'

describe('resolveOwnerProfileHandoff', () => {
  it('invites an anonymous visitor to sign in on a person profile', () => {
    expect(resolveOwnerProfileHandoff('user', 'JonathanXDR', { _tag: 'anonymous' })).toEqual({
      _tag: 'sign-in',
    })
  })

  it('recognizes the matching signed-in GitHub user without case sensitivity', () => {
    expect(resolveOwnerProfileHandoff('user', 'JonathanXDR', {
      _tag: 'signed-in',
      login: 'jonathanxdr',
    })).toEqual({ _tag: 'owner' })
  })

  it('hides the handoff from a different signed-in user', () => {
    expect(resolveOwnerProfileHandoff('user', 'JonathanXDR', {
      _tag: 'signed-in',
      login: 'someone-else',
    })).toEqual({ _tag: 'hidden' })
  })

  it.each([
    { _tag: 'anonymous' as const },
    { _tag: 'signed-in' as const, login: 'nuxt' },
  ])('hides the personal handoff on organization profiles', (viewer) => {
    expect(resolveOwnerProfileHandoff('org', 'nuxt', viewer)).toEqual({ _tag: 'hidden' })
  })
})
