// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { extractRepoReferences } from '../../shared/x-references'

function refs(input: { urls?: string[], text?: string }) {
  return extractRepoReferences({ urls: input.urls ?? [], text: input.text ?? '' })
}

describe('extractRepoReferences', () => {
  it('reads owner and repo from a plain repository link', () => {
    expect(refs({ urls: ['https://github.com/samber/cc-skills-golang'] })).toEqual([
      { owner: 'samber', repo: 'cc-skills-golang', matchKind: 'link' },
    ])
  })

  it('resolves a deep link to a SKILL.md back to its repository', () => {
    expect(refs({
      urls: ['https://github.com/anthropics/skills/blob/main/pdf/SKILL.md'],
    })).toEqual([
      { owner: 'anthropics', repo: 'skills', matchKind: 'link' },
    ])
  })

  it('reads the raw content host, which deep links to skill files use', () => {
    expect(refs({
      urls: ['https://raw.githubusercontent.com/kepano/obsidian-skills/main/SKILL.md'],
    })).toEqual([
      { owner: 'kepano', repo: 'obsidian-skills', matchKind: 'link' },
    ])
  })

  it('finds a bare mention typed without a scheme', () => {
    expect(refs({ text: 'try github.com/voltagent/awesome-agent-skills today' })).toEqual([
      { owner: 'voltagent', repo: 'awesome-agent-skills', matchKind: 'link' },
    ])
  })

  it('drops trailing sentence punctuation from the repo name', () => {
    expect(refs({ text: 'shipped at github.com/harlan/my-skills.' })).toEqual([
      { owner: 'harlan', repo: 'my-skills', matchKind: 'link' },
    ])
  })

  it('strips a .git suffix so clone URLs collapse onto the same repo', () => {
    expect(refs({ urls: ['https://github.com/Owner/Repo.git'] })).toEqual([
      { owner: 'owner', repo: 'repo', matchKind: 'link' },
    ])
  })

  it('rejects GitHub site chrome that is not an account', () => {
    expect(refs({
      urls: [
        'https://github.com/features/copilot',
        'https://github.com/topics/claude-skills',
        'https://github.com/orgs/anthropics/repositories',
      ],
    })).toEqual([])
  })

  it('rejects an owner page with no repository segment', () => {
    expect(refs({ urls: ['https://github.com/anthropics'] })).toEqual([])
  })

  it('rejects owner sub-pages that are not repositories', () => {
    expect(refs({ urls: ['https://github.com/anthropics/repositories'] })).toEqual([])
  })

  it('reads a repo out of a skilld skill URL', () => {
    expect(refs({ urls: ['https://skilld.dev/skills/samber/cc-skills-golang/go-testing'] })).toEqual([
      { owner: 'samber', repo: 'cc-skills-golang', matchKind: 'skilld' },
    ])
  })

  it('reads a repo out of a skilld repository URL', () => {
    expect(refs({ urls: ['https://skilld.dev/gh/kepano/obsidian-skills'] })).toEqual([
      { owner: 'kepano', repo: 'obsidian-skills', matchKind: 'skilld' },
    ])
  })

  it('keeps the skilld attribution when the same repo is also linked on GitHub', () => {
    expect(refs({
      urls: [
        'https://github.com/kepano/obsidian-skills',
        'https://skilld.dev/gh/kepano/obsidian-skills',
      ],
    })).toEqual([
      { owner: 'kepano', repo: 'obsidian-skills', matchKind: 'skilld' },
    ])
  })

  it('reports one entry per repo when a thread links several', () => {
    const result = refs({
      text: 'three good ones',
      urls: [
        'https://github.com/a/one',
        'https://github.com/b/two',
        'https://github.com/a/one/tree/main',
      ],
    })
    expect(result).toHaveLength(2)
    expect(result.map(r => `${r.owner}/${r.repo}`).sort()).toEqual(['a/one', 'b/two'])
  })

  it('ignores links to unrelated hosts', () => {
    expect(refs({ urls: ['https://example.com/anthropics/skills', 'not a url'] })).toEqual([])
  })

  it('rejects path traversal segments that would escape a generated URL', () => {
    expect(refs({ urls: ['https://github.com/../etc'] })).toEqual([])
  })
})
