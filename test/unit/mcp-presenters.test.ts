import type { Presented } from '../../layers/mcp/shared/mcp-presenters'
import { readFileSync } from 'node:fs'
import { indexRequestsV1 } from 'skilld-sdk/contract'
import { describe, expect, it } from 'vitest'
import {
  indexRequestOutputSchema,
  installCommandOutputSchema,
  presentIndexRequest,
  presentInstallCommand,
  presentRepository,
  presentSearch,
  presentSkill,
  presentTrack,
  presentTrackList,
  presentTrending,
  repositoryOutputSchema,
  searchOutputSchema,
  skillOutputSchema,
  trackListOutputSchema,
  trackOutputSchema,
  trendingOutputSchema,
} from '../../layers/mcp/shared/mcp-presenters'

// Production answers recorded on 2026-10-07.
function fixture<T = any>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../fixtures/mcp/${name}.json`, import.meta.url), 'utf8')) as T
}

/** Rough model tokens for one tool answer: the Markdown plus the structured copy. */
function tokens(presented: Presented<unknown>): number {
  return Math.ceil((presented.text.length + JSON.stringify(presented.structured).length) / 4)
}

const LONG = `${'Builds accessible interfaces with careful motion and type. '.repeat(10)}Ends here.`

describe('search_skills answer', () => {
  const answer = fixture('search-tailwind')

  it('names each Skill with its repository, stars, page, and run command', () => {
    const presented = presentSearch('tailwind', answer)
    for (const item of answer.items) {
      const { owner, repository, selector } = item.source
      expect(presented.text).toContain(`${owner}/${repository}`)
      expect(presented.text).toContain(`https://skilld.dev/gh/${owner}/${repository}/${selector.name}`)
      expect(presented.text).toContain(`npx skilld run ${owner}/${repository}/${selector.name}`)
    }
    expect(presented.text).toContain(`${answer.items[0].stargazerCount} stars`)
    expect(searchOutputSchema.parse(presented.structured)).toEqual(presented.structured)
  })

  it('leaves install commands to the tools that install', () => {
    expect(JSON.stringify(presentSearch('tailwind', answer).structured)).not.toContain('installCommand')
  })

  it('trims a long description at a word boundary', () => {
    const item = { ...answer.items[0], description: LONG }
    const presented = presentSearch('tailwind', { items: [item], total: 1 })
    const description = presented.structured.items[0]!.description!
    expect(description.length).toBeLessThanOrEqual(201)
    expect(description.endsWith('…')).toBe(true)
    expect(LONG.startsWith(description.slice(0, -1))).toBe(true)
    expect(LONG[description.length - 1]).toBe(' ')
  })

  it('fits five results in about 900 tokens, down from 1,500', () => {
    expect(tokens(presentSearch('tailwind', answer))).toBeLessThanOrEqual(900)
  })
})

describe('get_skill answer', () => {
  const answer = fixture('skill-web-design-guidelines')

  it('preserves Skill behaviors in text and schema-checked data', () => {
    const behaviors = [{
      id: 'network-access',
      tier: 'ask' as const,
      label: 'Network access',
      locations: [{ path: 'SKILL.md', line: 12 }, { path: 'scripts/deploy.sh', line: null }],
      total: 3,
    }]
    const presented = presentSkill({ ...answer, behaviors })
    expect(skillOutputSchema.parse(presented.structured)).toMatchObject({ behaviors })
    expect(presented.text).toContain('Network access')
    expect(presented.text).toContain('ask')
    expect(presented.text).toContain('SKILL.md:12')
    expect(presented.text).toContain('scripts/deploy.sh')
    expect(presented.text).toContain('3 matches')
  })

  it('leads with provenance, freshness, and both commands', () => {
    const { text } = presentSkill(answer)
    expect(text).toContain('by Vercel Labs')
    expect(text).toContain(answer.sourceUrl)
    expect(text).toContain(answer.sourceCommit.slice(0, 7))
    expect(text).toContain('Last skill change 2026-01-16')
    expect(text).toContain('last repository push 2026-08-28')
    expect(text).toContain(answer.runCommand)
    expect(text).toContain(answer.installCommand)
    expect(text).toContain('does not check whether a skill is safe')
    expect(text.indexOf(answer.runCommand)).toBeLessThan(text.indexOf(answer.installCommand))
  })

  it('drops empty fields', () => {
    const { structured } = presentSkill(answer)
    expect(structured).not.toHaveProperty('likes')
    expect(structured).not.toHaveProperty('tags')
    expect(structured).not.toHaveProperty('files')
    expect(structured).not.toHaveProperty('allowedTools')
    expect(structured).not.toHaveProperty('license')
    expect(structured).not.toHaveProperty('sourceGone')
    expect(skillOutputSchema.parse(structured)).toEqual(structured)
  })

  it('keeps the facts a reader needs when they exist', () => {
    const presented = presentSkill({
      ...answer,
      license: 'MIT',
      sourceGone: true,
      allowedTools: ['Bash'],
      files: [{ path: 'references/rules.md', size: 2048 }],
    })
    expect(presented.structured).toMatchObject({ license: 'MIT', sourceGone: true, allowedTools: ['Bash'], files: [{ path: 'references/rules.md', size: 2048 }] })
    expect(presented.text).toContain('MIT')
    expect(presented.text).toContain('references/rules.md')
    expect(presented.text).toContain('gone upstream')
    expect(skillOutputSchema.parse(presented.structured)).toEqual(presented.structured)
  })

  it('fences SKILL.md so its own code blocks stay inside', () => {
    const markdown = '# Rules\n\n```js\nconst a = 1\n```\n\nAfter the block.'
    const { text, structured } = presentSkill({ ...answer, markdown })
    const opening = text.indexOf('````markdown\n')
    expect(opening).toBeGreaterThan(-1)
    const body = text.slice(opening + '````markdown\n'.length, text.lastIndexOf('\n````'))
    expect(body).toBe(markdown)
    expect(structured.skillMarkdown).toBe(markdown)
  })

  it('omits the SKILL.md section when the registry holds no copy', () => {
    const presented = presentSkill({ ...answer, markdown: null })
    expect(presented.text).not.toContain('SKILL.md text')
    expect(presented.structured).not.toHaveProperty('skillMarkdown')
  })
})

describe('list_trending answer', () => {
  const answer = fixture('trending-week')
  const card = answer.items[0]
  const post = card.signal.post

  it('ranks rows in board order with a page and run command each', () => {
    const presented = presentTrending('week', answer)
    presented.structured.items.forEach((row, index) => {
      expect(row.rank).toBe(index + 1)
      expect(presented.text).toContain(row.pageUrl)
      expect(presented.text).toContain(row.runCommand)
    })
    expect(trendingOutputSchema.parse(presented.structured)).toEqual(presented.structured)
  })

  it.each([
    [{ kind: 'social', authorCount: 6, mentionCount: 9, post }, '6 devs talked about it in 9 posts'],
    [{ kind: 'social', authorCount: 1, mentionCount: 1, post }, '1 dev talked about it in 1 post'],
    [{ kind: 'star-surge', starGain: 327, surgedOn: '2026-10-05T00:00:00.000Z' }, '327 GitHub stars'],
    [{ kind: 'social-and-star-surge', authorCount: 3, mentionCount: 3, starGain: 120, surgedOn: '2026-10-05T00:00:00.000Z', post }, '3 devs talked about it in 3 posts'],
    [{ kind: 'star-count' }, 'Nobody posted about it'],
  ])('states why the row is there: %o', (signal, reason) => {
    const presented = presentTrending('week', { items: [{ ...card, signal }], total: 1 })
    expect(presented.text).toContain(reason)
    expect(trendingOutputSchema.parse(presented.structured)).toEqual(presented.structured)
  })

  it('quotes a short excerpt of the post with its author, network, and link', () => {
    const presented = presentTrending('week', { items: [{ ...card, signal: { ...card.signal, post: { ...post, text: LONG } } }], total: 1 })
    const excerpt = presented.text.match(/Post: [^\n]*?: "([^"]*)"/)?.[1] ?? ''
    expect(excerpt.length).toBeGreaterThan(100)
    expect(excerpt.length).toBeLessThanOrEqual(141)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(presented.text).toContain(`@${post.authorHandle}`)
    expect(presented.text).toContain(post.url)
    expect(presented.structured.items[0]!.reason).toMatchObject({ kind: 'social', post: { url: post.url, author: post.authorHandle } })
  })

  it('makes no popularity or safety claim of its own', () => {
    // Descriptions and post excerpts are the authors' words. Check skilld's own lines.
    const own = presentTrending('week', answer).text.split('\n').filter(line => !/^ {3}(?:Post:|Page:|Run:)/.test(line) && !/^ {3}[^W]/.test(line))
    expect(own.join('\n')).not.toMatch(/\b(?:popular|hot|top|safe)\b/i)
  })

  it('fits a ten-row board in about 2,800 tokens, down from 8,700', () => {
    expect(tokens(presentTrending('week', answer))).toBeLessThanOrEqual(2800)
  })
})

describe('list_tracks and get_track answers', () => {
  it('lists every track with its slug, goal, size, and page', () => {
    const answer = fixture('tracks')
    const presented = presentTrackList(answer)
    for (const track of answer.items) {
      expect(presented.text).toContain(track.label)
      expect(presented.text).toContain(`\`${track.slug}\``)
      expect(presented.text).toContain(track.pageUrl)
      expect(presented.text).toContain(`${track.skillCount} skills`)
    }
    expect(trackListOutputSchema.parse(presented.structured)).toEqual(presented.structured)
  })

  it('pages one track and fits ten Skills in about 1,850 tokens, down from 4,200', () => {
    const answer = fixture('track-testing')
    const presented = presentTrack(answer, 0)
    expect(presented.text).toContain(`1–${answer.items.length} of ${answer.total}`)
    expect(presented.text).toContain(answer.pageUrl)
    expect(trackOutputSchema.parse(presented.structured)).toEqual(presented.structured)
    expect(tokens(presented)).toBeLessThanOrEqual(1850)
  })
})

describe('get_repository answer', () => {
  const answer = fixture('repository-vercel-agent-skills')

  it('states the repository facts once and lists each Skill without repeating them', () => {
    const presented = presentRepository(answer, 30)
    expect(presented.text).toContain(answer.installCommand)
    expect(presented.text).toContain('last push 2026-08-28')
    expect(presented.structured.items.every(item => item.stars === undefined)).toBe(true)
    expect(presented.structured.total).toBe(answer.skills.length)
    expect(repositoryOutputSchema.parse(presented.structured)).toEqual(presented.structured)
  })

  it('bounds the Skills it lists', () => {
    const presented = presentRepository(answer, 2)
    expect(presented.structured.items).toHaveLength(2)
    expect(presented.text).toContain(`2 of ${answer.skills.length}`)
  })

  it('fits a nine-Skill repository in about 1,850 tokens, down from 4,400', () => {
    expect(tokens(presentRepository(answer, 30))).toBeLessThanOrEqual(1850)
  })
})

describe('submit_repository answer', () => {
  const [queued, indexed] = indexRequestsV1.operations.create.docs.examples

  it('counts the Skills of an indexed repository instead of echoing them', () => {
    const answer = indexed!.response as any
    const presented = presentIndexRequest(answer)
    expect(presented.structured).toEqual({
      status: 'indexed',
      repository: `${answer.owner}/${answer.repository}`,
      skillCount: answer.skills.length,
      pageUrl: `https://skilld.dev/gh/${answer.owner}/${answer.repository}`,
    })
    expect(presented.text).toContain('Nothing was queued')
    expect(indexRequestOutputSchema.parse(presented.structured)).toEqual(presented.structured)
  })

  it('returns the status URL and stage of a queued request', () => {
    const answer = queued!.response as any
    const presented = presentIndexRequest(answer)
    expect(presented.structured).toMatchObject({
      status: 'queued',
      id: answer.id,
      stage: answer.progress.stage,
      statusUrl: `https://skilld.dev/api/v1/index-requests/${answer.id}`,
    })
    expect(presented.text).toContain(`https://skilld.dev/api/v1/index-requests/${answer.id}`)
    expect(presented.text).toContain('A person reviews')
    expect(indexRequestOutputSchema.parse(presented.structured)).toEqual(presented.structured)
  })
})

describe('install_command answer', () => {
  it('leads with the run command for one Skill', () => {
    const presented = presentInstallCommand({ kind: 'skill', owner: 'anthropics', repo: 'skills', name: 'skill-creator' }, 'anthropics/skills/skill-creator')
    expect(presented.structured).toEqual({
      ref: 'anthropics/skills/skill-creator',
      kind: 'skill',
      runCommand: 'npx skilld run anthropics/skills/skill-creator',
      command: 'npx skilld install anthropics/skills/skill-creator',
    })
    expect(presented.text.indexOf('skilld run')).toBeLessThan(presented.text.indexOf('skilld install'))
    expect(presented.text).toContain('writes no files')
    expect(installCommandOutputSchema.parse(presented.structured)).toEqual(presented.structured)
  })

  it('offers only the install command for a repository', () => {
    const presented = presentInstallCommand({ kind: 'repo', owner: 'nuxt', repo: 'nuxt' }, 'nuxt/nuxt')
    expect(presented.structured).toEqual({ ref: 'nuxt/nuxt', kind: 'repo', command: 'npx skilld add nuxt/nuxt --all' })
    expect(presented.text).not.toContain('skilld run')
  })
})
