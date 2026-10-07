import { describe, expect, it } from 'vitest'
import { matchKnownSkills } from '../../shared/skill-name-match'

const skills = (...slugs: string[]) => slugs.map(slug => ({ slug }))

/** Every case here is a real post from the August 2026 Bluesky window. */
describe('matchKnownSkills on real posts', () => {
  it('finds a hyphenated name stated plainly in prose', () => {
    const matches = matchKnownSkills({
      text: 'in case it helps: i created and maintain this claude skill to help with oauth & atproto. GitHub - pixeline/atproto-oauth: AI Skill: implement an AT Protocol OAuth login',
      skills: skills('atproto-oauth', 'unrelated-thing'),
    })

    expect(matches.map(m => m.name)).toEqual(['atproto-oauth'])
    expect(matches[0]?.evidence).toBe('prose')
  })

  it('finds a name written with spaces instead of hyphens', () => {
    // "My Core Data Expert Agent Skill is open-source" names `core-data-expert`.
    const matches = matchKnownSkills({
      text: 'gives the agent better context before it edits persistence code. My Core Data Expert Agent Skill is open-source and built for maintainers',
      skills: skills('core-data-expert'),
    })

    expect(matches.map(m => m.name)).toEqual(['core-data-expert'])
  })

  it('finds a name inside a URL path', () => {
    const matches = matchKnownSkills({
      text: 'https://github.com/huytieu/COG-second-brain/blob/main/.claude/skills/museum-art/SKILL.md',
      skills: skills('museum-art', 'closed-loop'),
    })

    expect(matches.map(m => m.name)).toEqual(['museum-art'])
  })

  it('finds a name in a non-English post', () => {
    const matches = matchKnownSkills({
      text: 'commit、そもそもgit-commitスキルでAIに全部任せてる https://github.com/common-creation/skills',
      skills: skills('git-commit'),
    })

    expect(matches.map(m => m.name)).toEqual(['git-commit'])
  })

  it('reads a backticked name as stronger evidence than prose', () => {
    const matches = matchKnownSkills({
      text: 'Job | You\'d say ---|---|--- `skill-find` | Search project/personal/corporate skill libraries',
      skills: skills('skill-find'),
    })

    expect(matches[0]?.evidence).toBe('quoted')
  })

  it('reads a slash name as the strongest evidence', () => {
    const matches = matchKnownSkills({
      text: 'the /show-me skill is genuinely good',
      skills: skills('show-me'),
    })

    expect(matches[0]?.evidence).toBe('slash')
  })
})

describe('matchKnownSkills precision guards', () => {
  it('ignores a generic name appearing as an ordinary word', () => {
    // A repo really does ship a skill called `human`; "write like a human"
    // is not a mention of it.
    const matches = matchKnownSkills({
      text: 'I made a skill to make your AI write like a human. Beats humanizer and works with any model.',
      skills: skills('human'),
    })

    expect(matches).toEqual([])
  })

  it('ignores the word "skill" itself as a name', () => {
    const matches = matchKnownSkills({
      text: 'the commercial location platforms. Also comes with a Claude skill.',
      skills: skills('skill'),
    })

    expect(matches).toEqual([])
  })

  it('still accepts a generic name when it is slash-prefixed', () => {
    // Nobody writes "/research" by accident, so the convention rescues it.
    const matches = matchKnownSkills({
      text: 'reach for /research when you need sources',
      skills: skills('research'),
    })

    expect(matches[0]).toMatchObject({ name: 'research', evidence: 'slash' })
  })

  it('does not match a name starting mid-compound', () => {
    // `skill-repo` sits inside `agent-skill-repo`, which is a different name.
    const matches = matchKnownSkills({
      text: 'netresearch/agent-skill-repo v1.32.0 Guide for structuring skills',
      skills: skills('skill-repo'),
    })

    expect(matches).toEqual([])
  })

  it('does match a name a repo suffixed onto itself', () => {
    // `sega-genesis-sgdk` really is the skill in `sega-genesis-sgdk-skill-for-claude`.
    const matches = matchKnownSkills({
      text: 'GitHub - haroldo-ok/sega-genesis-sgdk-skill-for-claude: A Claude Skill for creating games',
      skills: skills('sega-genesis-sgdk'),
    })

    expect(matches.map(m => m.name)).toEqual(['sega-genesis-sgdk'])
  })

  it('ignores a short single-token name in prose', () => {
    const matches = matchKnownSkills({ text: 'this is a neat idea', skills: skills('neat') })

    expect(matches).toEqual([])
  })

  it('accepts a long single-token name in prose', () => {
    const matches = matchKnownSkills({
      text: 'blader / humanizer Agent skill that removes signs of AI-generated writing',
      skills: skills('humanizer'),
    })

    expect(matches.map(m => m.name)).toEqual(['humanizer'])
  })

  it('never invents a skill the repo does not ship', () => {
    const matches = matchKnownSkills({
      text: 'the atproto-oauth skill is great',
      skills: skills('something-else'),
    })

    expect(matches).toEqual([])
  })
})

describe('matchKnownSkills bookkeeping', () => {
  it('matches the frontmatter name as well as the slug', () => {
    // Directory `mars-claude` declares `name: mars-review`; people say the
    // latter, and the result still reports the routing slug.
    const matches = matchKnownSkills({
      text: 'give /mars-review a go',
      skills: [{ slug: 'mars-claude', canonicalName: 'mars-review' }],
    })

    expect(matches[0]).toMatchObject({ name: 'mars-claude', evidence: 'slash' })
  })

  it('reports one entry per skill, keeping the strongest evidence', () => {
    const matches = matchKnownSkills({
      text: 'the show-me skill, i.e. /show-me, is good',
      skills: skills('show-me'),
    })

    expect(matches).toHaveLength(1)
    expect(matches[0]?.evidence).toBe('slash')
  })

  it('carries a quote so a reviewer can judge without the post', () => {
    const matches = matchKnownSkills({
      text: 'a long preamble that goes on for a while before mentioning atproto-oauth and then continuing',
      skills: skills('atproto-oauth'),
    })

    expect(matches[0]?.quote).toContain('atproto-oauth')
  })

  it('finds several distinct skills in one post', () => {
    const matches = matchKnownSkills({
      text: 'Teach your agent to use Obsidian CLI and open formats including Markdown, Bases, JSON Canvas',
      skills: skills('obsidian-cli', 'json-canvas', 'unmentioned-one'),
    })

    expect(matches.map(m => m.name).sort()).toEqual(['json-canvas', 'obsidian-cli'])
  })

  it('returns nothing for an empty post', () => {
    expect(matchKnownSkills({ text: '', skills: skills('atproto-oauth') })).toEqual([])
  })
})
