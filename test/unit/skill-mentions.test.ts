// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { extractSkillMentions, rootSkillAliases } from '../../shared/skill-mentions'

function names(input: Parameters<typeof extractSkillMentions>[0]) {
  return extractSkillMentions(input).map(m => m.name).sort()
}

describe('extractSkillMentions slash convention', () => {
  it('reads the /name form people use in prose', () => {
    expect(names({ text: 'Hey, man. Just try the /diagram-tour claude skill 😎' }))
      .toContain('diagram-tour')
  })

  it('reads several skills named in one post', () => {
    const found = names({ text: 'we use /beads-workflow and /beads-br daily' })
    expect(found).toEqual(['beads-br', 'beads-workflow'])
  })

  it('ignores a slash inside a URL path', () => {
    // URLs are stripped before display but reach the extractor intact.
    expect(names({ text: 'see https://github.com/owner/repo for details' }))
      .not
      .toContain('repo')
  })

  it('ignores a bare number, which came from real text like "7-100"', () => {
    expect(names({ text: 'pressure-tests ideas via a 7-step /100 process' }))
      .not
      .toContain('100')
  })
})

describe('extractSkillMentions prose convention', () => {
  it('reads "a skill called X"', () => {
    expect(names({ text: 'I made an agent skill yesterday called glossarize.' }))
      .toContain('glossarize')
  })

  it('reads "we call X", the phrasing in the show-me article', () => {
    expect(names({ text: 'publishing them in a skill we call show-me.' }))
      .toContain('show-me')
  })

  it('reads "built the X skill"', () => {
    expect(names({ text: 'i built a cartoon-ads skill last night' }))
      .toContain('cartoon-ads')
  })

  it('drops filler words the patterns inevitably catch', () => {
    // Verification rejects these anyway; dropping them here saves a lookup.
    const found = names({ text: 'the agent skill and this skill and my skill' })
    expect(found).not.toContain('agent')
    expect(found).not.toContain('this')
    expect(found).not.toContain('my')
  })
})

describe('extractSkillMentions install commands', () => {
  it('reads the repo and skill from an npx skills command', () => {
    // Verbatim from dexhorthy's /show-me article code block.
    const [mention] = extractSkillMentions({
      text: '',
      articleCode: ['npx skills add humanlayer/skills --skill show-me'],
    })
    expect(mention).toEqual({
      name: 'show-me',
      source: 'install',
      repo: { owner: 'humanlayer', repo: 'skills' },
    })
  })

  it.each([
    'npx skilld run kepano/obsidian-skills/obsidian-cli',
    'npx skilld install kepano/obsidian-skills/obsidian-cli --agent codex',
    'npx skilld@latest run kepano/obsidian-skills/obsidian-cli',
    'npx skilld run skilld:kepano/obsidian-skills/obsidian-cli',
    'npx skilld add gh:kepano/obsidian-skills/obsidian-cli',
  ])('reads our own CLI form: %s', (text) => {
    const [mention] = extractSkillMentions({ text })
    expect(mention).toMatchObject({
      name: 'obsidian-cli',
      source: 'install',
      repo: { owner: 'kepano', repo: 'obsidian-skills' },
    })
  })

  it('prefers an install match over a looser one for the same name', () => {
    const found = extractSkillMentions({
      text: 'try /show-me',
      articleCode: ['npx skills add humanlayer/skills --skill show-me'],
    })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ source: 'install', repo: { owner: 'humanlayer', repo: 'skills' } })
  })
})

describe('extractSkillMentions article handling', () => {
  it('finds the skill in an article title when the post body is only a link', () => {
    // The real shape: text is a bare t.co URL, everything else in `article`.
    expect(names({
      text: 'https://t.co/L0G15QT1Tv',
      articleTitle: '/show-me: compact visual representations for coding agents',
    })).toContain('show-me')
  })

  it('finds skills named only in the article body', () => {
    const found = names({
      text: 'https://t.co/abc',
      articleText: 'Dillon Mulroy even made a skill, /bro to ask the model to simplify language.',
    })
    expect(found).toContain('bro')
  })

  it('returns nothing for a post with no candidates', () => {
    expect(extractSkillMentions({ text: 'agents got more intelligent on paper' })).toEqual([])
  })
})

describe('rootSkillAliases', () => {
  it('lets a single-skill repo answer to its name without the suffix', () => {
    // People say "asd-ste100"; the repo is "asd-ste100-skill".
    expect(rootSkillAliases('asd-ste100-skill')).toEqual(['asd-ste100-skill', 'asd-ste100'])
  })

  it('handles the plural suffix', () => {
    expect(rootSkillAliases('obsidian-skills')).toEqual(['obsidian-skills', 'obsidian'])
  })

  it('leaves a repo with no suffix alone', () => {
    expect(rootSkillAliases('stockforge')).toEqual(['stockforge'])
  })
})
