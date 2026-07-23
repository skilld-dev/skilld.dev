// @vitest-environment node

import { learnContentPath } from '../../layers/marketing/app/utils/learn-content-path'

describe('learn content path', () => {
  it.each([
    ['', '/learn'],
    ['author-npm-package-skills', '/learn/author-npm-package-skills'],
    [['nested', 'guide'], '/learn/nested/guide'],
  ])('maps %j into the learn collection', (slug, expected) => {
    expect(learnContentPath(slug)).toBe(expected)
  })
})
