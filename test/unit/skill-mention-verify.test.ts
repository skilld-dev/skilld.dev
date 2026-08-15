// @vitest-environment node
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from './helpers/d1-sqlite'

const github = vi.hoisted(() => ({
  getRepoSummary: vi.fn(),
  getTree: vi.fn(),
  getBlobsBatch: vi.fn(),
  GRAPHQL_BATCH_SIZE: 50,
  // The real predicate, not a stub. It decides whether a response counts as
  // readable, so faking it here would test the fake instead of the rule.
  hasBody: (outcome: { data: unknown }) => outcome.data !== null && outcome.data !== undefined,
}))
vi.mock('#layers/registry/server/utils/github-client', () => github)

const { verifySkillMention } = await import('../../shared/server/skill-mention-verify')

let harness: SqliteD1 | null = null
function db() {
  if (!harness) {
    harness = createSqliteD1([])
    harness.raw.exec(`CREATE TABLE skills (
      owner TEXT, repo TEXT, name TEXT, display_name TEXT,
      rendered_skill_path TEXT, source_resolved INTEGER DEFAULT 1
    )`)
  }
  return harness
}
afterEach(() => {
  harness?.close()
  harness = null
  vi.clearAllMocks()
})

const bindings = {} as never

function tree(paths: string[]) {
  github.getRepoSummary.mockResolvedValue({
    status: 200,
    data: { headTreeSha: 'sha', meta: { default_branch: 'main' } },
  })
  github.getTree.mockResolvedValue({
    status: 200,
    data: { tree: paths.map(p => ({ path: p, type: 'blob', sha: 'x' })), truncated: false },
  })
}

describe('verifySkillMention registry path', () => {
  it('matches an indexed skill by slug without touching GitHub', async () => {
    db().raw.prepare(`INSERT INTO skills VALUES ('kepano','obsidian-skills','obsidian-cli','Obsidian CLI','obsidian-cli/SKILL.md',1)`).run()

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'kepano',
      repo: 'obsidian-skills',
      candidate: 'obsidian-cli',
    })

    expect(result).toEqual({
      _tag: 'verified',
      skill: {
        owner: 'kepano',
        repo: 'obsidian-skills',
        slug: 'obsidian-cli',
        canonicalName: 'Obsidian CLI',
        path: 'obsidian-cli/SKILL.md',
        matchedOn: 'registry',
      },
    })
    expect(github.getRepoSummary).not.toHaveBeenCalled()
  })

  it('matches an indexed skill by its frontmatter display name', async () => {
    // display_name comes from frontmatter via migration 0088, so the registry
    // already knows the canonical name people actually say.
    db().raw.prepare(`INSERT INTO skills VALUES ('kunpai','mars-claude','mars-claude','mars-review','SKILL.md',1)`).run()

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'kunpai',
      repo: 'mars-claude',
      candidate: 'mars-review',
    })
    expect(result._tag === 'verified' && result.skill.canonicalName).toBe('mars-review')
    expect(result._tag === 'verified' && result.skill.slug).toBe('mars-claude')
  })
})

describe('verifySkillMention directory path', () => {
  it('matches a nested skill directory and reads only that one blob', async () => {
    tree(['skills/thanos/SKILL.md', 'skills/other/SKILL.md', 'README.md'])
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/thanos/SKILL.md', '---\nname: thanos\n---\n']]),
    })

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'thanospapage',
      repo: 'thanos',
      candidate: 'thanos',
    })
    expect(result._tag === 'verified' && result.skill).toMatchObject({
      slug: 'thanos',
      path: 'skills/thanos/SKILL.md',
      matchedOn: 'directory',
    })
    // Only the matched file, never the whole repo, so a directory hit stays cheap.
    expect(github.getBlobsBatch).toHaveBeenCalledTimes(1)
    expect(github.getBlobsBatch.mock.calls[0]?.[3]).toEqual(['skills/thanos/SKILL.md'])
  })

  it('surfaces the frontmatter name even when the directory matched', async () => {
    // The directory found the file, but the author named the skill something
    // else. Returning the directory name here would show the wrong canonical
    // name on every trending row for that skill.
    tree(['skills/foo/SKILL.md'])
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/foo/SKILL.md', '---\nname: Bar Tool\n---\n']]),
    })

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'o',
      repo: 'r',
      candidate: 'foo',
    })
    expect(result._tag === 'verified' && result.skill.canonicalName).toBe('Bar Tool')
    // Routing identity still comes from the directory.
    expect(result._tag === 'verified' && result.skill.slug).toBe('foo')
  })

  it('still verifies when the matched blob cannot be read', async () => {
    // A confirmed directory match must not be thrown away because the display
    // name lookup failed; the name degrades, the match does not.
    tree(['skills/thanos/SKILL.md'])
    github.getBlobsBatch.mockResolvedValue({ status: 502, data: null })

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'thanospapage',
      repo: 'thanos',
      candidate: 'thanos',
    })
    expect(result._tag === 'verified' && result.skill.canonicalName).toBe('thanos')
  })

  it('treats a root SKILL.md as the repo-named skill', async () => {
    tree(['SKILL.md'])
    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'centraltowerlabs',
      repo: 'diagram-tour',
      candidate: 'diagram-tour',
    })
    expect(result._tag === 'verified' && result.skill.matchedOn).toBe('directory')
  })
})

describe('verifySkillMention frontmatter path', () => {
  it('matches a name that only the frontmatter knows', async () => {
    // Real case: dir is mars-claude, the author named it mars-review.
    tree(['SKILL.md'])
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['SKILL.md', '---\nname: mars-review\ndescription: peer review\n---\nbody']]),
    })

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'kunpai',
      repo: 'mars-claude',
      candidate: 'mars-review',
    })

    expect(result._tag === 'verified' && result.skill).toMatchObject({
      canonicalName: 'mars-review',
      matchedOn: 'frontmatter',
    })
  })

  it('keeps the directory slug for routing even when frontmatter differs', async () => {
    tree(['SKILL.md'])
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['SKILL.md', '---\nname: asd-ste100\n---\n']]),
    })

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'danyuchn',
      repo: 'asd-ste100-skill',
      candidate: 'asd-ste100',
    })
    // URLs must not move: the slug stays directory-derived.
    expect(result._tag === 'verified' && result.skill.slug).toBe('asd-ste100-skill')
    expect(result._tag === 'verified' && result.skill.canonicalName).toBe('asd-ste100')
  })

  it('rejects a slash-command that no skill answers to', async () => {
    // /spec /plan /build on addyosmani/agent-skills are commands, not skills.
    tree(['skills/api-and-interface-design/SKILL.md', 'skills/code-review-and-quality/SKILL.md'])
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([
        ['skills/api-and-interface-design/SKILL.md', '---\nname: api-and-interface-design\n---\n'],
        ['skills/code-review-and-quality/SKILL.md', '---\nname: code-review-and-quality\n---\n'],
      ]),
    })

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'addyosmani',
      repo: 'agent-skills',
      candidate: 'spec',
    })
    expect(result).toEqual({ _tag: 'no-match' })
  })
})

describe('verifySkillMention failure handling', () => {
  it('separates "cannot answer" from "no such skill"', async () => {
    // A rate-limited lookup is not evidence a skill is absent, and recording
    // it as such would poison the ledger with false negatives.
    github.getRepoSummary.mockResolvedValue({ status: 403, data: null })

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'o',
      repo: 'r',
      candidate: 'x',
    })
    expect(result).toEqual({ _tag: 'unavailable', reason: 'repo-summary-403' })
  })

  it('refuses to guess from a truncated tree', async () => {
    github.getRepoSummary.mockResolvedValue({ status: 200, data: { headTreeSha: 's', meta: { default_branch: 'main' } } })
    github.getTree.mockResolvedValue({ status: 200, data: { tree: [], truncated: true } })

    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'o',
      repo: 'r',
      candidate: 'x',
    })
    expect(result).toEqual({ _tag: 'unavailable', reason: 'tree-truncated' })
  })

  it('reports no-match for a repo holding no skills at all', async () => {
    tree(['README.md'])
    const result = await verifySkillMention({ db: db().db, bindings }, {
      owner: 'o',
      repo: 'r',
      candidate: 'x',
    })
    expect(result).toEqual({ _tag: 'no-match' })
  })
})
