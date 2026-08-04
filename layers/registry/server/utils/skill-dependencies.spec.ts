import { describe, expect, it } from 'vitest'
import { buildSkillDependencyMap, extractSkillDependenciesFromMarkdown, skillDependencyKey } from './skill-dependencies'

describe('skill dependencies', () => {
  it('finds valid same-repository references once in first-seen order', () => {
    const raw = [
      '---',
      'note: /linked',
      '---',
      'Use /tdd, then **/review** and /tdd again.',
      '',
      '`/linked`',
      '',
      '[Existing /linked](/elsewhere)',
      '',
      'https://example.com/linked',
      '',
      '```text',
      '/linked',
      '```',
    ].join('\n')

    expect(extractSkillDependenciesFromMarkdown(
      raw,
      ['current', 'tdd', 'review', 'linked'],
      'current',
    )).toEqual(['tdd', 'review'])
  })

  it('excludes unknown skills, path segments, and self references', () => {
    expect(extractSkillDependenciesFromMarkdown(
      'Use /current, /unknown, docs/tdd, /tdd/guide, and /tdd.',
      ['current', 'tdd'],
      'current',
    )).toEqual(['tdd'])
  })

  it('resolves references only against skills from the same repository', () => {
    const dependencies = buildSkillDependencyMap([
      { owner: 'acme', repo: 'skills', name: 'plan', raw: 'Then use /ship and /external.' },
      { owner: 'acme', repo: 'skills', name: 'ship', raw: '' },
      { owner: 'other', repo: 'skills', name: 'external', raw: '' },
    ])

    expect(dependencies.get(skillDependencyKey('acme', 'skills', 'plan'))).toEqual(['ship'])
    expect(dependencies.get(skillDependencyKey('acme', 'skills', 'ship'))).toEqual([])
  })
})
