import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalRepoSkillPath } from '#shared/skill-routes'
import { skillContentSha256 } from '../../layers/registry/server/utils/skill-content-hash'
import { syncRepo } from '../../layers/registry/server/utils/sync-repo'

const github = vi.hoisted(() => ({
  getBlobsBatch: vi.fn(),
  getCommitsBatch: vi.fn(),
  getRepoSummary: vi.fn(),
  getTree: vi.fn(),
  logRateLimit: vi.fn(),
}))
const renderer = vi.hoisted(() => ({
  parseSkillMd: vi.fn(async (raw: string) => ({ frontmatter: {}, body: raw, html: `<p>${raw}</p>` })),
}))

vi.mock('../../layers/registry/server/utils/github-client', () => github)
vi.mock('../../layers/registry/server/utils/skill-md-render', () => renderer)

const rawSkill = (name: string) => `---\nname: ${name}\ndescription: ${name} description\n---\n# ${name}`

function repoSummary(headTreeSha: string | null = 'new-tree') {
  return {
    status: 200,
    data: {
      repositoryId: 1,
      headTreeSha,
      meta: {
        name: 'skills',
        full_name: 'acme/skills',
        html_url: 'https://github.com/acme/skills',
        owner: { login: 'acme' },
        default_branch: 'main',
        description: 'Skills',
        stargazers_count: 1,
        forks_count: 0,
        pushed_at: '2026-07-12T12:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      },
    },
    rateLimit: null,
    notModified: false,
  }
}

function tree(entries: Array<{ path: string, sha: string }>, sha = 'new-tree') {
  return {
    status: 200,
    data: { sha, tree: entries.map(entry => ({ ...entry, type: 'blob' })) },
    rateLimit: null,
    notModified: false,
  }
}

describe('syncRepo content acknowledgement', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T00:00:00Z'))
    vi.clearAllMocks()
    sqlite = createDatabase()
    db = wrapSqlite(sqlite)
    github.getRepoSummary.mockResolvedValue(repoSummary())
    github.getCommitsBatch.mockImplementation(async (_owner, _repo, paths: string[]) => ({
      status: 200,
      data: new Map(paths.map(path => [path, []])),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    sqlite.close()
  })

  it('discovers a new nested skill inside a known verified repo', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/one/SKILL.md', sha: 'one-old' },
      { path: 'skills/two/SKILL.md', sha: 'two-new' },
    ]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([
        ['skills/one/SKILL.md', rawSkill('One')],
        ['skills/two/SKILL.md', rawSkill('Two')],
      ]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result.status).toBe('indexed')
    expect(sqlite.prepare(`SELECT name FROM skills ORDER BY name`).pluck().all()).toEqual(['one', 'two'])
    expect(sqlite.prepare(
      `SELECT is_official, source_resolved, rendered_raw_sha256 FROM skills WHERE name = 'two'`,
    ).get()).toEqual({
      is_official: 0,
      source_resolved: 1,
      rendered_raw_sha256: await skillContentSha256(rawSkill('Two')),
    })
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('new-tree')
  })

  it('does not advance last_tree_sha when the blob batch fails', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-new' }]))
    github.getBlobsBatch.mockResolvedValue({ status: 502, data: null, rateLimit: null, notModified: false })

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result).toMatchObject({ status: 'failed', reason: 'blob_batch_failed:502' })
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('old-tree')
  })

  it('does not quarantine or acknowledge when a successful blob response is partial', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    insertSkill(sqlite, 'two', 'two-old')
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/one/SKILL.md', sha: 'one-new' },
      { path: 'skills/two/SKILL.md', sha: 'two-new' },
    ]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result).toMatchObject({ status: 'failed', reason: 'blob_batch_partial:skills/two/SKILL.md' })
    expect(sqlite.prepare(`SELECT name, source_resolved FROM skills ORDER BY name`).all()).toEqual([
      { name: 'one', source_resolved: 1 },
      { name: 'two', source_resolved: 1 },
    ])
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('old-tree')
  })

  it('indexes a root SKILL.md as one skill named after the repository', async () => {
    // This shape used to be rejected as `root_skill_unsupported`. It is the
    // single-skill repository, which is the only layout that lets a star surge
    // or a bare install command name a skill unambiguously, and five of the six
    // highest-evidence repositories the ledger had written off were this.
    github.getTree.mockResolvedValue(tree([{ path: 'SKILL.md', sha: 'root-sha' }]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['SKILL.md', rawSkill('Sounds Human')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(result).toMatchObject({ status: 'indexed', skillsSeen: 1 })
    expect(sqlite.prepare(`SELECT name FROM skills`).pluck().get()).toBe('skills')
  })

  it('never reports a zero-upsert trust rejection as indexed or ok', async () => {
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-new' }]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result).toMatchObject({
      status: 'rejected',
      reason: 'trust_inputs_insufficient',
      skillsUpserted: 0,
    })
    expect(renderer.parseSkillMd).not.toHaveBeenCalled()
    expect(github.getCommitsBatch).not.toHaveBeenCalled()
  })

  it('admits a new skill after a curated repository review', async () => {
    sqlite.prepare(`
      INSERT INTO repo_trust_overrides (
        owner, repo, tier, reason
      ) VALUES ('acme', 'skills', 'trusted-curator', 'Reviewed generic skill repository')
    `).run()
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-new' }]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result).toMatchObject({
      status: 'indexed',
      skillsUpserted: 1,
    })
    expect(sqlite.prepare(`
      SELECT trust_tier, trust_source, seo_indexable
      FROM skills
      WHERE owner = 'acme' AND repo = 'skills' AND name = 'one'
    `).get()).toEqual({
      trust_tier: 'trusted-curator',
      trust_source: 'manual',
      seo_indexable: 1,
    })
  })

  it('admits new skills from a repository with an eligible leaderboard review', async () => {
    sqlite.prepare(`
      INSERT INTO skill_repo_eligibility (
        owner, repo, status, reason, reviewed_by
      ) VALUES ('acme', 'skills', 'eligible', 'Individual creator publishing reusable skills', 'harlan-zw')
    `).run()
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-new' }]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result).toMatchObject({
      status: 'indexed',
      skillsUpserted: 1,
    })
    // The review admits the skill to the registry without granting SEO
    // indexability; the scaled-content suppression bar still applies.
    expect(sqlite.prepare(`
      SELECT seo_indexable FROM skills
      WHERE owner = 'acme' AND repo = 'skills' AND name = 'one'
    `).get()).toEqual({ seo_indexable: 0 })
  })

  it('does not admit new skills from a repository whose review is rejected', async () => {
    sqlite.prepare(`
      INSERT INTO skill_repo_eligibility (
        owner, repo, status, reason, reviewed_by
      ) VALUES ('acme', 'skills', 'rejected', 'Aggregated third-party content', 'harlan-zw')
    `).run()
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-new' }]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result).toMatchObject({ status: 'rejected', reason: 'trust_inputs_insufficient' })
    expect(sqlite.prepare(`SELECT count(*) FROM skills`).pluck().get()).toBe(0)
  })

  it('fetches and renders only content whose tree SHA changed', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    insertSkill(sqlite, 'two', 'two-old')
    setRendered(sqlite, 'one', 'skills/one/SKILL.md')
    setRendered(sqlite, 'two', 'skills/two/SKILL.md')
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/one/SKILL.md', sha: 'one-new' },
      { path: 'skills/two/SKILL.md', sha: 'two-old' },
    ]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result.status).toBe('indexed')
    expect(github.getBlobsBatch).toHaveBeenCalledWith(
      'acme',
      'skills',
      'main',
      ['skills/one/SKILL.md'],
      {},
    )
    expect(renderer.parseSkillMd).toHaveBeenCalledTimes(1)
    expect(renderer.parseSkillMd.mock.calls[0]?.[0]).toBe(rawSkill('One'))
  })

  it('keeps unchanged names seen and refreshes their tree-derived fields', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    setRendered(sqlite, 'one', 'skills/one/SKILL.md')
    github.getTree.mockResolvedValue({
      ...tree([{ path: 'skills/one/SKILL.md', sha: 'one-old' }]),
      data: {
        sha: 'new-tree',
        tree: [
          { path: 'skills/one/SKILL.md', sha: 'one-old', type: 'blob' },
          { path: 'skills/one/reference.md', sha: 'ref', type: 'blob', size: 12 },
        ],
      },
    })

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result.status).toBe('indexed')
    expect(github.getBlobsBatch).not.toHaveBeenCalled()
    expect(renderer.parseSkillMd).not.toHaveBeenCalled()
    expect(sqlite.prepare(
      `SELECT source_resolved, references_count, assets, last_synced_at FROM skills WHERE name = 'one'`,
    ).get()).toEqual({
      source_resolved: 1,
      references_count: 1,
      assets: JSON.stringify([{ path: 'reference.md', size: 12, type: 'markdown' }]),
      last_synced_at: 1783900800,
    })
    expect(sqlite.prepare(`SELECT reason FROM skill_dirty`).pluck().all()).toEqual(['references_changed'])
  })

  // The sweep quarantined a removed skill but left `sync_status = 'ok'`, and
  // `recompute-scores` derives `source_resolved` from that column, so every
  // dirty-queue tick resurrected it. 342 removed skills were serving 200.
  it('records why a swept skill is unresolved so the recompute cannot undo it', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    insertSkill(sqlite, 'two', 'two-old')
    setRendered(sqlite, 'one', 'skills/one/SKILL.md')
    setRendered(sqlite, 'two', 'skills/two/SKILL.md')
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-old' }]))

    await syncRepo('acme', 'skills', {}, db)

    expect(sqlite.prepare(
      `SELECT name, source_resolved, sync_status FROM skills ORDER BY name`,
    ).all()).toEqual([
      { name: 'one', source_resolved: 1, sync_status: 'ok' },
      { name: 'two', source_resolved: 0, sync_status: 'path_missing' },
    ])
  })

  // harlan-zw/nuxt-ai-ready ships one Skill beside test fixtures. Counting the
  // fixtures moved its one Skill off the repository URL.
  // Broken means the tree could not be read. A readable tree with no Skills,
  // whether the author deleted them or only fixtures remain, is not broken.
  it.each([
    ['deleted every Skill', [{ path: 'README.md', sha: 'readme' }]],
    ['keeps only test fixtures', [{ path: 'test/fixtures/skills/one/SKILL.md', sha: 'fixture' }]],
  ])('retires the rows of a repository that %s without marking it broken', async (_, entries) => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    setRendered(sqlite, 'one', 'test/fixtures/skills/one/SKILL.md')
    sqlite.prepare(`UPDATE repos SET broken_since = 1`).run()
    github.getTree.mockResolvedValue(tree(entries))

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result).toMatchObject({ status: 'rejected', reason: 'no_supported_skill_paths' })
    expect(sqlite.prepare(`SELECT source_resolved, sync_status FROM skills`).get())
      .toEqual({ source_resolved: 0, sync_status: 'path_missing' })
    expect(sqlite.prepare(`SELECT broken_since, repo_skill_count FROM repos`).get())
      .toEqual({ broken_since: null, repo_skill_count: 0 })
  })

  it('indexes a Skill added back to a repository whose rows were all retired', async () => {
    insertRepo(sqlite, 'fixture-tree')
    insertSkill(sqlite, 'seo-audit', 'fixture-sha')
    setRendered(sqlite, 'seo-audit', 'test/fixtures/skills/seo-audit/SKILL.md')
    sqlite.prepare(`UPDATE skills SET source_resolved = 0, sync_status = 'path_missing'`).run()
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/nuxt-ai-ready/SKILL.md', sha: 'real-sha' },
      { path: 'test/fixtures/skills/seo-audit/SKILL.md', sha: 'fixture-sha' },
    ]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/nuxt-ai-ready/SKILL.md', rawSkill('nuxt-ai-ready')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db, { submitted: true })

    expect(result).toMatchObject({ status: 'indexed', skillsSeen: 1 })
    expect(sqlite.prepare(`SELECT name FROM skills WHERE source_resolved = 1`).pluck().all())
      .toEqual(['nuxt-ai-ready'])
  })

  it('ignores test fixture SKILL.md files and retires fixture rows it indexed before', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'nuxt-ai-ready', 'real-sha')
    insertSkill(sqlite, 'seo-audit', 'fixture-sha')
    setRendered(sqlite, 'nuxt-ai-ready', 'skills/nuxt-ai-ready/SKILL.md')
    setRendered(sqlite, 'seo-audit', 'test/fixtures/agent-skills/skills/seo-audit/SKILL.md')
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/nuxt-ai-ready/SKILL.md', sha: 'real-sha' },
      { path: 'test/fixtures/agent-skills/skills/seo-audit/SKILL.md', sha: 'fixture-sha' },
      { path: 'test/fixtures/agent-skills/skills/site-review/SKILL.md', sha: 'fixture-two' },
    ]))

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result).toMatchObject({ status: 'indexed', skillsSeen: 1 })
    expect(github.getBlobsBatch).not.toHaveBeenCalled()
    const resolved = sqlite.prepare(
      `SELECT name FROM skills WHERE source_resolved = 1 ORDER BY name`,
    ).pluck().all() as string[]
    expect(resolved).toEqual(['nuxt-ai-ready'])
    expect(sqlite.prepare(`SELECT sync_status FROM skills WHERE name = 'seo-audit'`).pluck().get())
      .toBe('path_missing')
    expect(sqlite.prepare(`SELECT repo_skill_count FROM repos`).pluck().get()).toBe(1)
    expect(canonicalRepoSkillPath({
      owner: 'acme',
      repo: 'skills',
      name: 'nuxt-ai-ready',
      repoSkillCount: resolved.length,
    })).toBe('/gh/acme/skills')
  })

  it('does not admit a skilld cache Skill and retires the cache rows it indexed before', async () => {
    const cacheSkill = (name: string) => `---\nname: ${name}\ndescription: ${name} cache\n---\n**References:** [package.json](./.skilld/pkg/package.json)`
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'nuxt-seo', 'real-sha')
    // Migration 0126 clears current_sha on cache rows, so their content is read again.
    insertSkill(sqlite, 'nuxt-skilld', null)
    setRendered(sqlite, 'nuxt-seo', 'skills/nuxt-seo/SKILL.md')
    setRendered(sqlite, 'nuxt-skilld', '.claude/skills/nuxt-skilld/SKILL.md')
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/nuxt-seo/SKILL.md', sha: 'real-sha' },
      { path: '.claude/skills/nuxt-skilld/SKILL.md', sha: 'cache-sha' },
      { path: '.claude/skills/shiki-skilld/SKILL.md', sha: 'cache-two' },
    ]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([
        ['.claude/skills/nuxt-skilld/SKILL.md', cacheSkill('nuxt-skilld')],
        ['.claude/skills/shiki-skilld/SKILL.md', cacheSkill('shiki-skilld')],
      ]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db, { submitted: true })

    expect(result.status).toBe('indexed')
    const resolved = sqlite.prepare(
      `SELECT name FROM skills WHERE source_resolved = 1 ORDER BY name`,
    ).pluck().all() as string[]
    expect(resolved).toEqual(['nuxt-seo'])
    expect(sqlite.prepare(`SELECT sync_status FROM skills WHERE name = 'nuxt-skilld'`).pluck().get())
      .toBe('path_missing')
    expect(sqlite.prepare(`SELECT COUNT(*) FROM skills WHERE name = 'shiki-skilld'`).pluck().get()).toBe(0)
    expect(canonicalRepoSkillPath({
      owner: 'acme',
      repo: 'skills',
      name: 'nuxt-seo',
      repoSkillCount: resolved.length,
    })).toBe('/gh/acme/skills')
  })

  // Repositories copy one Skill into Agent folders and plugin mirrors. Each
  // sync used to write every copy over the one row, so the stored path moved
  // to whichever copy was written last, and the next push moved it again.
  it('stores the canonical copy of a Skill copied into Agent folders, push after push', async () => {
    const copies = [
      '.claude/skills/modern-web-design/SKILL.md',
      'plugins/web/skills/modern-web-design/SKILL.md',
      'skills/modern-web-design/SKILL.md',
    ]
    insertRepo(sqlite, 'old-tree')
    github.getBlobsBatch.mockImplementation(async (_owner, _repo, _branch, paths: string[]) => ({
      status: 200,
      data: new Map(paths.map(path => [path, rawSkill('modern-web-design')])),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    }))

    const storedPaths: unknown[] = []
    for (const pushedAt of ['2026-07-12T12:00:00Z', '2026-07-12T13:00:00Z']) {
      const summary = repoSummary(`tree-at-${pushedAt}`)
      github.getTree.mockResolvedValue(tree(copies.map((path, index) => ({ path, sha: `copy-${index}` })), `tree-at-${pushedAt}`))
      github.getRepoSummary.mockResolvedValue({ ...summary, data: { ...summary.data, meta: { ...summary.data.meta, pushed_at: pushedAt } } })
      await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })
      storedPaths.push(sqlite.prepare(`SELECT rendered_skill_path FROM skills WHERE name = 'modern-web-design'`).pluck().get())
    }

    expect(storedPaths).toEqual(['skills/modern-web-design/SKILL.md', 'skills/modern-web-design/SKILL.md'])
  })

  it('refreshes the repository description when its skill tree is unchanged', async () => {
    insertRepo(sqlite, 'new-tree')
    insertSkill(sqlite, 'one', 'one-old')

    const result = await syncRepo('acme', 'skills', {}, db)

    expect(result.status).toBe('skipped-tree-sha')
    expect(sqlite.prepare(`SELECT description FROM repos`).pluck().get()).toBe('Skills')
    expect(github.getTree).not.toHaveBeenCalled()
  })

  it('falls back to content work for a null rendered path and self-heals it', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-old' }]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    await syncRepo('acme', 'skills', {}, db)

    expect(renderer.parseSkillMd).toHaveBeenCalledTimes(1)
    expect(sqlite.prepare(`SELECT rendered_skill_path FROM skills WHERE name = 'one'`).pluck().get())
      .toBe('skills/one/SKILL.md')
  })

  it('forces content repair through unchanged repo cursors without adding revisions', async () => {
    insertRepo(sqlite, 'same-tree')
    insertSkill(sqlite, 'one', 'one-old')
    setRendered(sqlite, 'one', 'skills/one/SKILL.md', 'fetch_failed')
    github.getRepoSummary.mockResolvedValue(repoSummary('same-tree'))
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-old' }], 'same-tree'))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const result = await syncRepo('acme', 'skills', {}, db, { forceContent: true })

    expect(result.status).toBe('indexed')
    expect(github.getTree).toHaveBeenCalledTimes(1)
    expect(renderer.parseSkillMd).toHaveBeenCalledTimes(1)
    expect(github.getCommitsBatch).not.toHaveBeenCalled()
    expect(sqlite.prepare(`SELECT count(*) FROM skill_revisions`).pluck().get()).toBe(0)
  })

  it('checkpoints a large repo without advancing its cursor or quarantining later paths', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    insertSkill(sqlite, 'two', 'two-old')
    setRendered(sqlite, 'one', 'skills/one/SKILL.md')
    setRendered(sqlite, 'two', 'skills/two/SKILL.md')
    github.getTree.mockResolvedValue(tree([
      { path: 'skills/one/SKILL.md', sha: 'one-old' },
      { path: 'skills/two/SKILL.md', sha: 'two-old' },
    ]))

    const first = await syncRepo('acme', 'skills', {}, db, { maxSkillFiles: 1 })

    expect(first).toMatchObject({
      status: 'continuing',
      continuation: {
        treeSha: 'new-tree',
        checkedAt: 1783900800,
        nextOffset: 1,
      },
    })
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('old-tree')
    expect(sqlite.prepare(`SELECT name, source_resolved FROM skills ORDER BY name`).all()).toEqual([
      { name: 'one', source_resolved: 1 },
      { name: 'two', source_resolved: 1 },
    ])

    const second = await syncRepo('acme', 'skills', {}, db, {
      continuation: first.continuation,
      maxSkillFiles: 1,
    })

    expect(second.status).toBe('indexed')
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('new-tree')
    expect(sqlite.prepare(`SELECT name, source_resolved FROM skills ORDER BY name`).all()).toEqual([
      { name: 'one', source_resolved: 1 },
      { name: 'two', source_resolved: 1 },
    ])
  })

  it('asks the durable job to restart when its tree changes between checkpoints', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    setRendered(sqlite, 'one', 'skills/one/SKILL.md')
    github.getTree.mockResolvedValue(tree(
      [{ path: 'skills/one/SKILL.md', sha: 'one-old' }],
      'replacement-tree',
    ))

    const result = await syncRepo('acme', 'skills', {}, db, {
      continuation: {
        treeSha: 'stale-tree',
        checkedAt: 1783900000,
        nextOffset: 1,
      },
      maxSkillFiles: 1,
    })

    expect(result).toMatchObject({
      status: 'restart-required',
      reason: 'tree_changed_during_continuation',
    })
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('old-tree')
  })

  it('emits one activity row across concurrent syncs', async () => {
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-new' }]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    const results = await Promise.all([
      syncRepo('acme', 'skills', {}, db, { ownerVerified: true }),
      syncRepo('acme', 'skills', {}, db, { ownerVerified: true }),
    ])

    expect(results.every(result => result.status === 'indexed')).toBe(true)
    expect(sqlite.prepare(`SELECT count(*) FROM activity`).pluck().get()).toBe(1)
  })

  it('rolls back last_tree_sha when a downstream D1 write fails', async () => {
    insertRepo(sqlite, 'old-tree')
    sqlite.exec(`
      CREATE TRIGGER reject_skill_write
      BEFORE INSERT ON skills
      BEGIN
        SELECT RAISE(ABORT, 'forced downstream failure');
      END;
    `)
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-new' }]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    await expect(
      syncRepo('acme', 'skills', {}, db, { ownerVerified: true }),
    )
      .rejects
      .toThrow('forced downstream failure')
    expect(sqlite.prepare(`SELECT last_tree_sha FROM repos`).pluck().get()).toBe('old-tree')
    expect(sqlite.prepare(`SELECT count(*) FROM activity`).pluck().get()).toBe(0)
  })

  it('queues owner verification recomputation when content changed', async () => {
    insertRepo(sqlite, 'old-tree')
    insertSkill(sqlite, 'one', 'one-old')
    github.getTree.mockResolvedValue(tree([{ path: 'skills/one/SKILL.md', sha: 'one-new' }]))
    github.getBlobsBatch.mockResolvedValue({
      status: 200,
      data: new Map([['skills/one/SKILL.md', rawSkill('One')]]),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    })

    await syncRepo('acme', 'skills', {}, db, { ownerVerified: true })

    expect(sqlite.prepare(`SELECT reason FROM skill_dirty`).pluck().all()).toEqual(['owner_verified'])
  })
})

function createDatabase(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE repos (
      owner TEXT NOT NULL, repo TEXT NOT NULL, default_branch TEXT, stars INTEGER NOT NULL DEFAULT 0,
      forks INTEGER NOT NULL DEFAULT 0, pushed_at INTEGER, repo_created_at INTEGER,
      repo_meta_synced_at INTEGER, description TEXT, last_tree_sha TEXT, repo_kind TEXT NOT NULL DEFAULT 'creator',
      repo_kind_source TEXT NOT NULL DEFAULT 'computed', repo_skill_count INTEGER NOT NULL DEFAULT 0,
      broken_since INTEGER, tree_truncated_at INTEGER, source_owner TEXT, source_repo TEXT, repository_id INTEGER, is_fork INTEGER, PRIMARY KEY (owner, repo)
    );
    CREATE TABLE skills (
      name TEXT NOT NULL, owner TEXT NOT NULL, repo TEXT NOT NULL, display_name TEXT NOT NULL,
      installs INTEGER NOT NULL DEFAULT 0, slug TEXT NOT NULL, description TEXT, current_sha TEXT,
      modified_at INTEGER, first_seen_at INTEGER, references_count INTEGER NOT NULL DEFAULT 0,
      assets TEXT NOT NULL DEFAULT '[]', last_synced_at INTEGER, sync_status TEXT,
      is_official INTEGER NOT NULL DEFAULT 0, source_resolved INTEGER NOT NULL DEFAULT 0,
      seo_index_score INTEGER NOT NULL DEFAULT 0, seo_indexable INTEGER NOT NULL DEFAULT 0,
      seo_index_reasons TEXT NOT NULL DEFAULT '[]', seo_index_synced_at INTEGER,
      trust_tier TEXT NOT NULL DEFAULT 'untrusted', trust_source TEXT NOT NULL DEFAULT 'computed',
      trust_score INTEGER NOT NULL DEFAULT 0, trust_reasons TEXT NOT NULL DEFAULT '[]', trust_synced_at INTEGER,
      rendered_skill_path TEXT, rendered_commit_sha TEXT, rendered_status TEXT, rendered_raw TEXT, rendered_raw_sha256 TEXT, rendered_frontmatter TEXT,
      rendered_html TEXT, rendered_at INTEGER, owner_verified INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (owner, repo, name)
    );
    CREATE TABLE skill_revisions (
      owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL, sha TEXT NOT NULL,
      modified_at INTEGER NOT NULL, author_login TEXT, message TEXT,
      PRIMARY KEY (owner, repo, name, sha)
    );
    CREATE TABLE activity (
      type TEXT NOT NULL, owner TEXT NOT NULL, repo TEXT, name TEXT NOT NULL,
      occurred_at INTEGER NOT NULL, ingested_at INTEGER NOT NULL, sha TEXT
    );
    CREATE TABLE skill_dirty (
      owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL, reason TEXT NOT NULL,
      queued_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (owner, repo, name, reason)
    );
    CREATE TABLE repo_trust_overrides (
      owner TEXT NOT NULL, repo TEXT NOT NULL, tier TEXT NOT NULL, reason TEXT,
      PRIMARY KEY (owner, repo)
    );
    CREATE TABLE repo_kind_overrides (
      owner TEXT NOT NULL, repo TEXT NOT NULL, kind TEXT NOT NULL,
      PRIMARY KEY (owner, repo)
    );
    CREATE TABLE skill_repo_eligibility (
      owner TEXT NOT NULL, repo TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('eligible', 'rejected')),
      reason TEXT NOT NULL, reviewed_by TEXT NOT NULL,
      reviewed_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (owner, repo)
    );
    CREATE TABLE repo_star_observations (
      owner TEXT NOT NULL, repo TEXT NOT NULL, observed_day INTEGER NOT NULL,
      stars INTEGER NOT NULL, PRIMARY KEY (owner, repo, observed_day)
    );
  `)
  return sqlite
}

function insertRepo(sqlite: Database.Database, treeSha: string): void {
  sqlite.prepare(
    `INSERT INTO repos (owner, repo, default_branch, pushed_at, last_tree_sha)
     VALUES ('acme', 'skills', 'main', 0, ?)`,
  ).run(treeSha)
}

function insertSkill(sqlite: Database.Database, name: string, sha: string | null): void {
  sqlite.prepare(
    `INSERT INTO skills (
       owner, repo, name, display_name, slug, current_sha, first_seen_at, source_resolved
     ) VALUES ('acme', 'skills', ?, ?, ?, ?, 1, 1)`,
  ).run(name, name, `acme/${name}`, sha)
}

function setRendered(
  sqlite: Database.Database,
  name: string,
  path: string,
  status = 'ok',
): void {
  sqlite.prepare(
    `UPDATE skills
     SET rendered_skill_path = ?, rendered_status = ?, rendered_raw = 'old', rendered_html = '<p>old</p>'
     WHERE owner = 'acme' AND repo = 'skills' AND name = ?`,
  ).run(path, status, name)
}

interface BoundStatement {
  executeSync: () => D1Result<unknown>
  run: () => Promise<D1Result<unknown>>
  all: <T>() => Promise<D1Result<T>>
  first: <T>() => Promise<T | null>
}

function wrapSqlite(sqlite: Database.Database): D1Database {
  const prepare = (sql: string) => ({
    bind(...params: unknown[]): BoundStatement {
      const executeSync = () => {
        const result = sqlite.prepare(sql).run(...params)
        return { meta: { changes: result.changes } } as D1Result<unknown>
      }
      return {
        executeSync,
        run: async () => executeSync(),
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...params) as T[] } as D1Result<T>
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null
        },
      }
    },
  })

  return {
    prepare,
    async batch<T>(statements: D1PreparedStatement[]) {
      const run = sqlite.transaction(() => statements.map(statement => (statement as unknown as BoundStatement).executeSync()))
      return run() as D1Result<T>[]
    },
  } as unknown as D1Database
}
