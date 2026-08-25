import { describe, expect, it } from 'vitest'
import { resolveRepoRouteTarget } from '../../layers/registry/server/utils/repo-route-target'

describe('resolveRepoRouteTarget', () => {
  it('routes a repository with one indexed skill to that skill', () => {
    expect(resolveRepoRouteTarget(['audit-writing'])).toEqual({
      _tag: 'skill',
      name: 'audit-writing',
    })
  })

  it.each([
    { names: [] },
    { names: ['one', 'two'] },
  ])('keeps zero or multiple indexed skills on the repository page', ({ names }) => {
    expect(resolveRepoRouteTarget(names)).toEqual({ _tag: 'repo' })
  })
})
