import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { indexSkillAliases, resolveRenamedSkillRoute } from '../../layers/registry/server/utils/skill-aliases'
import { matchSkillRenames, skillBodySimilarity } from '../../layers/registry/server/utils/skill-rename'
import { findRenamedSkill, findSkillRunIdentity } from '../../layers/registry/server/utils/skill-run-identity'
import { syncRepo } from '../../layers/registry/server/utils/sync-repo'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const github = vi.hoisted(() => ({
  getBlobsBatch: vi.fn(),
  getCommitsBatch: vi.fn(),
  getRepoSummary: vi.fn(),
  getTree: vi.fn(),
  logRateLimit: vi.fn(),
}))

vi.mock('../../layers/registry/server/utils/github-client', () => github)

const NOW = 1_790_000_000

const EDIT_BODY = [
  '# Edit prose for its reader',
  'Read the complete text, request, and supplied reader preferences first.',
  'Edit only where a change solves a reading problem for this reader.',
  'Preserve distinctive vocabulary, humor, rhythm, and deliberate voice.',
  'Verify material facts and relevant assumptions before rewriting them.',
  'Never invent an actor, experience, example, or supporting detail.',
].join('\n')

const COMPRESS_BODY = [
  '# Compress text for agents',
  'Produce the shortest clear text that preserves the source meaning.',
  'Record each distinct claim or rule and its source section first.',
  'Merge duplicates only when meaning, scope, and exceptions all match.',
  'Preserve frontmatter, code, commands, and links exactly as written.',
  'Count tokens with the target tokenizer before claiming any savings.',
].join('\n')

const NAMING_BODY = [
  '# Recover names from user tasks',
  'Find implementation names that hide the tasks users actually perform.',
  'Write one plain sentence naming the person, the thing, and the task.',
  'Rank proposals by user impact and confidence, not by occurrence count.',
].join('\n')

const skillMd = (name: string, body: string) => `---\nname: ${name}\ndescription: ${name} description\n---\n${body}\n`

describe('skill rename matching', () => {
  it('scores a body that kept its lines under a new frontmatter name as the same Skill', () => {
    expect(skillBodySimilarity(skillMd('im-not-a-fly', EDIT_BODY), skillMd('im-part-human', EDIT_BODY))).toBe(1)
    expect(skillBodySimilarity(skillMd('im-not-a-fly', EDIT_BODY), skillMd('slop-naming-recovery', NAMING_BODY))).toBe(0)
  })

  it('pairs each renamed Skill with the one it became and leaves a new Skill unpaired', () => {
    const removed = [
      { name: 'im-not-a-fly', raw: skillMd('im-not-a-fly', EDIT_BODY) },
      { name: 'im-a-fly', raw: skillMd('im-a-fly', COMPRESS_BODY) },
    ]
    const added = [
      { name: 'im-part-human', raw: skillMd('im-part-human', `${EDIT_BODY}\nKeep explanations the reader needs to understand.`) },
      { name: 'im-not-a-human', raw: skillMd('im-not-a-human', COMPRESS_BODY) },
      { name: 'slop-naming-recovery', raw: skillMd('slop-naming-recovery', NAMING_BODY) },
    ]

    expect(matchSkillRenames(removed, added)).toEqual([
      { from: 'im-not-a-fly', to: 'im-part-human' },
      { from: 'im-a-fly', to: 'im-not-a-human' },
    ])
  })

  it('leaves an ambiguous pair as a removal and two additions', () => {
    const removed = [{ name: 'edit', raw: skillMd('edit', EDIT_BODY) }]
    const added = [
      { name: 'edit-blog', raw: skillMd('edit-blog', EDIT_BODY) },
      { name: 'edit-docs', raw: skillMd('edit-docs', EDIT_BODY) },
    ]

    expect(matchSkillRenames(removed, added)).toEqual([])
  })

  it('leaves a body rewritten past the threshold unpaired', () => {
    const removed = [{ name: 'edit', raw: skillMd('edit', EDIT_BODY) }]
    const added = [{ name: 'prose', raw: skillMd('prose', `${EDIT_BODY.split('\n').slice(0, 2).join('\n')}\n${COMPRESS_BODY}`) }]

    expect(matchSkillRenames(removed, added)).toEqual([])
  })
})

describe('renamed skill route', () => {
  const aliases = indexSkillAliases([{ owner: 'harlan-zw', repo: 'brundlefly', name: 'im-not-a-fly', targetName: 'im-part-human' }])

  it('sends the Skill page, its deep links, and its agent copy to the new name', () => {
    expect(resolveRenamedSkillRoute('/gh/harlan-zw/brundlefly/im-not-a-fly', '?tab=files', aliases))
      .toEqual({ _tag: 'redirect', location: '/gh/harlan-zw/brundlefly/im-part-human?tab=files' })
    expect(resolveRenamedSkillRoute('/gh/Harlan-ZW/Brundlefly/IM-NOT-A-FLY/references/storytelling.md', '', aliases))
      .toEqual({ _tag: 'redirect', location: '/gh/Harlan-ZW/Brundlefly/im-part-human/references/storytelling.md' })
    expect(resolveRenamedSkillRoute('/gh/harlan-zw/brundlefly/im-not-a-fly.md', '', aliases))
      .toEqual({ _tag: 'redirect', location: '/gh/harlan-zw/brundlefly/im-part-human.md' })
  })

  it('leaves the Repository hub and other Skills alone', () => {
    expect(resolveRenamedSkillRoute('/gh/harlan-zw/brundlefly', '', aliases)).toEqual({ _tag: 'pass' })
    expect(resolveRenamedSkillRoute('/gh/harlan-zw/brundlefly/readme', '', aliases)).toEqual({ _tag: 'pass' })
    expect(resolveRenamedSkillRoute('/gh/other/brundlefly/im-not-a-fly', '', aliases)).toEqual({ _tag: 'pass' })
  })
})

describe('sync follows a renamed Skill', () => {
  let d1: SqliteD1
  let blobs: Map<string, string>

  function exec(sql: string): void {
    d1.raw.exec(sql)
  }

  function rows<T>(sql: string): T[] {
    return d1.raw.prepare(sql).all() as T[]
  }

  function seedSkill(name: string, body: string, options: { firstSeenAt?: number, resolved?: boolean } = {}): void {
    d1.raw.prepare(`
      INSERT INTO skills (owner, repo, name, display_name, slug, description, current_sha, source_resolved,
        sync_status, rendered_skill_path, rendered_status, rendered_raw, first_seen_at, seo_indexable)
      VALUES ('acme', 'skills', ?, ?, ?, 'Does it.', ?, ?, ?, ?, 'ok', ?, ?, 1)`)
      .run(name, name, `acme/${name}`, `blob-${name}`, options.resolved === false ? 0 : 1, options.resolved === false ? 'path_missing' : 'ok', `skills/${name}/SKILL.md`, skillMd(name, body), options.firstSeenAt ?? NOW - 5000)
  }

  /** GitHub serves these Skill folders, each with the body given. */
  function serveTree(skills: Record<string, string>, treeSha = 'tree-2'): void {
    blobs = new Map(Object.entries(skills).map(([name, body]) => [`skills/${name}/SKILL.md`, skillMd(name, body)]))
    github.getRepoSummary.mockResolvedValue({
      status: 200,
      data: {
        repositoryId: 7,
        headTreeSha: treeSha,
        meta: {
          name: 'skills',
          full_name: 'acme/skills',
          html_url: 'https://github.com/acme/skills',
          owner: { login: 'acme' },
          default_branch: 'main',
          description: 'Skills',
          stargazers_count: 3,
          forks_count: 0,
          pushed_at: '2026-10-01T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
        },
      },
      rateLimit: null,
      notModified: false,
    })
    github.getTree.mockResolvedValue({
      status: 200,
      data: { sha: treeSha, tree: Object.keys(skills).map(name => ({ path: `skills/${name}/SKILL.md`, sha: `blob-${name}`, type: 'blob' })) },
      rateLimit: null,
      notModified: false,
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW * 1000)
    vi.clearAllMocks()
    d1 = createSqliteD1(allMigrations())
    exec(`
      INSERT INTO users (id, github_id, login, created_at, last_login_at) VALUES (101, 101, 'user-101', 1, 1);
      INSERT INTO repos (owner, repo, default_branch, stars, last_tree_sha, pushed_at, repo_meta_synced_at, repo_skill_count, repository_id)
        VALUES ('acme', 'skills', 'main', 3, 'tree-1', ${NOW - 100}, ${NOW - 100}, 2, 7);
    `)
    github.getBlobsBatch.mockImplementation(async (_owner: string, _repo: string, _ref: string, paths: string[]) => ({
      status: 200,
      data: new Map(paths.flatMap(path => blobs.has(path) ? [[path, blobs.get(path)!]] : [])),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    }))
    github.getCommitsBatch.mockImplementation(async (_owner: string, _repo: string, paths: string[]) => ({
      status: 200,
      data: new Map(paths.map(path => [path, []])),
      unreadable: new Set(),
      rateLimit: null,
      notModified: false,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    d1.close()
  })

  it('moves the old Skill to its new folder name and keeps the old name as an alias', async () => {
    seedSkill('edit', EDIT_BODY, { firstSeenAt: NOW - 9000 })
    seedSkill('naming', NAMING_BODY)
    exec(`INSERT INTO skill_likes (user_id, owner, repo, name, created_at) VALUES (101, 'acme', 'skills', 'edit', 1)`)
    serveTree({ prose: EDIT_BODY, naming: NAMING_BODY, compress: COMPRESS_BODY })

    const stats = await syncRepo('acme', 'skills', {}, d1.db, { submitted: true })

    expect(stats).toMatchObject({ status: 'indexed', skillsRenamed: 1 })
    expect(rows(`SELECT name, source_resolved FROM skills ORDER BY name`)).toEqual([
      { name: 'compress', source_resolved: 1 },
      { name: 'naming', source_resolved: 1 },
      { name: 'prose', source_resolved: 1 },
    ])
    expect(rows(`SELECT name, target_name, renamed_at FROM skill_aliases`)).toEqual([{ name: 'edit', target_name: 'prose', renamed_at: NOW }])
    expect(rows(`SELECT name FROM skill_likes`)).toEqual([{ name: 'prose' }])
    expect(rows(`SELECT first_seen_at FROM skills WHERE name = 'prose'`)).toEqual([{ first_seen_at: NOW - 9000 }])
    expect(rows(`SELECT name FROM skill_dirty WHERE reason = 'skill_renamed'`)).toEqual([{ name: 'prose' }])
  })

  it('answers an old run command with the new name and delivers nothing under the old one', async () => {
    seedSkill('edit', EDIT_BODY)
    serveTree({ prose: EDIT_BODY })
    await syncRepo('acme', 'skills', {}, d1.db, { submitted: true })

    expect(await findSkillRunIdentity(d1.db, { owner: 'acme', repository: 'skills', name: 'edit' })).toBeNull()
    expect(await findRenamedSkill(d1.db, { owner: 'acme', repository: 'skills', name: 'edit' })).toBe('prose')
    expect(await findRenamedSkill(d1.db, { owner: 'acme', repository: 'skills', name: 'prose' })).toBeNull()
  })

  it('turns a tombstone into an alias when the new name is admitted after the old one was swept', async () => {
    seedSkill('edit', EDIT_BODY, { resolved: false })
    serveTree({ prose: EDIT_BODY })

    await syncRepo('acme', 'skills', {}, d1.db, { submitted: true })

    expect(rows(`SELECT name FROM skills`)).toEqual([{ name: 'prose' }])
    expect(rows(`SELECT name, target_name FROM skill_aliases`)).toEqual([{ name: 'edit', target_name: 'prose' }])
  })

  it('ends the alias and points the other way when the author renames the folder back', async () => {
    seedSkill('edit', EDIT_BODY)
    serveTree({ prose: EDIT_BODY }, 'tree-2')
    await syncRepo('acme', 'skills', {}, d1.db, { submitted: true })
    vi.setSystemTime((NOW + 60) * 1000)
    serveTree({ edit: EDIT_BODY }, 'tree-3')

    await syncRepo('acme', 'skills', {}, d1.db, { submitted: true })

    expect(rows(`SELECT name FROM skills`)).toEqual([{ name: 'edit' }])
    expect(rows(`SELECT name, target_name FROM skill_aliases`)).toEqual([{ name: 'prose', target_name: 'edit' }])
  })

  it('marks an unrelated removal gone instead of renaming it', async () => {
    seedSkill('edit', EDIT_BODY)
    serveTree({ compress: COMPRESS_BODY })

    const stats = await syncRepo('acme', 'skills', {}, d1.db, { submitted: true })

    expect(stats.skillsRenamed).toBe(0)
    expect(rows(`SELECT name, sync_status FROM skills ORDER BY name`)).toEqual([
      { name: 'compress', sync_status: 'ok' },
      { name: 'edit', sync_status: 'path_missing' },
    ])
    expect(rows(`SELECT name FROM skill_aliases`)).toEqual([])
  })
})
