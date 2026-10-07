import type { CollectionDetailRow, CollectionListRow, CollectionSkillRow } from '../../server/presenters/collection'
import type { CommunityDirectoryItem } from '../../server/utils/community'
import type { SkillCardRow } from '../../shared/server/skill-cards'
import Database from 'better-sqlite3'
import { collectionsV1, createCollectionBody, curatorsV1 } from 'skilld-sdk/contract'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  presentCollection,
  presentCurator,
  presentCuratorDirectory,
  presentSkillPage,
} from '../../server/presenters/collection-v1'
import {
  createCollection,
  exactSkillRefs,
  loadCollectionPage,
  loadCuratorProfile,
  putCollectionSkill,
  removeCollectionSkill,
  watchCollection,
} from '../../server/utils/collections'
import { loadSkillCardRows, skillCardKey } from '../../shared/server/skill-cards'

function summaryRow(overrides: Partial<SkillCardRow> = {}): SkillCardRow {
  return {
    owner: 'vercel-labs',
    repo: 'agent-skills',
    name: 'web-design-guidelines',
    display_name: 'Web Design Guidelines',
    description: 'Review UI code.',
    stars: 18_204,
    like_count: 41,
    modified_at: 1_790_000_000,
    rendered_skill_path: 'skills/web-design-guidelines/SKILL.md',
    current_sha: 'abc123',
    default_branch: 'main',
    source_owner: null,
    source_repo: null,
    repo_skill_count: 6,
    ...overrides,
  }
}

function byKey(...rows: SkillCardRow[]): Map<string, SkillCardRow> {
  return new Map(rows.map(row => [skillCardKey(row), row]))
}

function entry(overrides: Partial<CollectionSkillRow>): CollectionSkillRow {
  return { position: 0, owner: 'vercel-labs', repo: 'agent-skills', name: 'web-design-guidelines', display_name: null, reason: null, repo_skill_count: 6, ...overrides }
}

const collectionHead: CollectionDetailRow = {
  id: 7,
  author_login: 'harlan-zw',
  author_name: 'Harlan Wilton',
  author_avatar: '',
  slug: 'design-engineering-essentials',
  name: 'Design Engineering Essentials',
  preamble: null,
  featured: 1,
  created_at: 1,
  updated_at: 2,
}

describe('presentCollection', () => {
  const answer = presentCollection({
    collection: collectionHead,
    entries: [
      entry({ position: 0, reason: 'Checks UI code.' }),
      entry({ position: 1, owner: 'solo', repo: 'hub', name: 'fresh', reason: null }),
      entry({ position: 2, owner: 'gone', repo: 'away', name: 'left' }),
    ],
    summaries: byKey(
      summaryRow({ owner: 'solo', repo: 'hub', name: 'fresh', display_name: 'Fresh', repo_skill_count: 1, source_owner: 'mirror', source_repo: 'hub-src', current_sha: null }),
      summaryRow(),
    ),
    total: 12,
  })

  it('answers the contract shape', () => {
    expect(collectionsV1.operations.get.response.body.producer.safeParse(answer).success).toBe(true)
  })

  it('keeps the curator order and reasons, and drops an entry the registry lost', () => {
    expect(answer.skills.items.map(item => [item.name, item.reason])).toEqual([
      ['web-design-guidelines', 'Checks UI code.'],
      ['fresh', null],
    ])
    expect(answer.skills.total).toBe(12)
  })

  it('links each Skill to its canonical page and its SKILL.md', () => {
    const [named, single] = answer.skills.items
    expect(named!.pageUrl).toBe('https://skilld.dev/gh/vercel-labs/agent-skills/web-design-guidelines')
    expect(named!.sourceUrl).toBe('https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md')
    expect(single!.pageUrl).toBe('https://skilld.dev/gh/solo/hub')
    expect(single!.sourceUrl).toBe('https://github.com/mirror/hub-src/blob/main/skills/web-design-guidelines/SKILL.md')
    expect(named!.runCommand).toBe('npx skilld run vercel-labs/agent-skills/web-design-guidelines')
  })

  it('answers the collection address and a null avatar for an empty one', () => {
    expect(answer.pageUrl).toBe('https://skilld.dev/@harlan-zw/design-engineering-essentials')
    expect(answer.installCommand).toBe('npx skilld add @harlan-zw/design-engineering-essentials --all')
    expect(answer.curator).toEqual({ login: 'harlan-zw', name: 'Harlan Wilton', avatarUrl: null })
  })
})

describe('presentCurator', () => {
  const collections: CollectionListRow[] = [
    { slug: 'stack', name: 'Stack', preamble: 'Intro', featured: 0, updated_at: 1, skill_count: 3 },
  ]

  it('answers the curator with an install command for each collection', () => {
    const answer = presentCurator({ login: 'harlan-zw', name: null, avatar: 'https://avatars.githubusercontent.com/u/1' }, collections)
    expect(curatorsV1.operations.get.response.body.producer.safeParse(answer).success).toBe(true)
    expect(answer.installCommand).toBe('npx skilld add @harlan-zw --all')
    expect(answer.collections).toEqual([{
      slug: 'stack',
      title: 'Stack',
      description: 'Intro',
      pageUrl: 'https://skilld.dev/@harlan-zw/stack',
      installCommand: 'npx skilld add @harlan-zw/stack --all',
      skillCount: 3,
    }])
  })
})

describe('presentCuratorDirectory', () => {
  const curator = (login: string, collectionCount: number): CommunityDirectoryItem => ({
    id: 1,
    login,
    name: null,
    avatar: null,
    collectionCount,
    skillCount: 0,
    featured: false,
    activityAt: 0,
    topCollection: null,
    topSkill: null,
  })

  it('pages the directory and counts only the curators a page can reach', () => {
    const answer = presentCuratorDirectory({ items: [curator('a', 2), curator('b', 0), curator('c', 1)] }, { limit: 1, offset: 1 })
    expect(curatorsV1.operations.list.response.body.producer.safeParse(answer).success).toBe(true)
    expect(answer).toEqual({
      items: [{ login: 'b', name: null, avatarUrl: null, pageUrl: 'https://skilld.dev/@b', collectionCount: 0 }],
      total: 3,
    })
  })
})

describe('presentSkillPage', () => {
  it('keeps the list order and drops a Skill with no registry row', () => {
    const answer = presentSkillPage(
      [{ owner: 'a', repo: 'r', name: 'second' }, { owner: 'gone', repo: 'r', name: 'x' }, { owner: 'a', repo: 'r', name: 'first' }],
      byKey(summaryRow({ owner: 'a', repo: 'r', name: 'first' }), summaryRow({ owner: 'a', repo: 'r', name: 'second' })),
      40,
    )
    expect(curatorsV1.operations.likes.response.body.producer.safeParse(answer).success).toBe(true)
    expect(answer.items.map(item => item.name)).toEqual(['second', 'first'])
    expect(answer.total).toBe(40)
  })
})

describe('createCollectionBody', () => {
  const skill = { owner: 'acme', repository: 'kit', name: 'older' }

  it('applies the site rules: a reserved slug fails, and each Skill appears once', () => {
    expect(createCollectionBody.safeParse({ slug: 'liked', title: 'Liked' }).success).toBe(false)
    expect(createCollectionBody.safeParse({ slug: 'stack', title: 'Stack', skills: [skill, skill] }).success).toBe(false)
    expect(createCollectionBody.parse({ slug: 'stack', title: ' Stack ' })).toEqual({ slug: 'stack', title: 'Stack', skills: [] })
  })
})

describe('collection storage', () => {
  let sqlite: Database.Database
  let db: never

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, github_id INTEGER NOT NULL, login TEXT NOT NULL, name TEXT, avatar TEXT, last_login_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE collections_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT, author_user_id INTEGER, slug TEXT NOT NULL, name TEXT NOT NULL,
        preamble TEXT, featured INTEGER NOT NULL DEFAULT 0, created_at INTEGER, updated_at INTEGER, deleted_at INTEGER
      );
      CREATE TABLE collection_skills_v2 (
        collection_id INTEGER NOT NULL, position INTEGER NOT NULL, owner TEXT NOT NULL, repo TEXT NOT NULL,
        name TEXT, reason TEXT, PRIMARY KEY (collection_id, position)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL, repo TEXT NOT NULL, name TEXT NOT NULL, display_name TEXT NOT NULL, description TEXT,
        like_count INTEGER NOT NULL DEFAULT 0, modified_at INTEGER, rendered_skill_path TEXT, current_sha TEXT,
        source_resolved INTEGER NOT NULL DEFAULT 1, rendered_status TEXT NOT NULL DEFAULT 'ok',
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE repos (
        owner TEXT NOT NULL, repo TEXT NOT NULL, stars INTEGER, default_branch TEXT, source_owner TEXT,
        source_repo TEXT, broken_since INTEGER, PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skill_dirty (owner TEXT, repo TEXT, name TEXT, reason TEXT, queued_at INTEGER, attempts INTEGER, PRIMARY KEY (owner, repo, name, reason));
      CREATE TABLE skill_subscriptions (user_id INTEGER, owner TEXT, repo TEXT, source TEXT, created_at INTEGER, PRIMARY KEY (user_id, owner, repo));

      INSERT INTO users VALUES (1, 100, 'harlan-zw', 'Harlan Wilton', 'https://avatars.githubusercontent.com/u/1', 50);
      INSERT INTO users VALUES (2, -100, 'harlan-zw', 'Placeholder', NULL, 90);
      INSERT INTO collections_v2 VALUES (1, 1, 'stack', 'Stack', 'Intro', 0, 1, 1, NULL);
      -- One named Skill, then one whole Repository, which shows its newest Skill.
      INSERT INTO collection_skills_v2 VALUES (1, 0, 'acme', 'kit', 'older', 'named');
      INSERT INTO collection_skills_v2 VALUES (1, 1, 'solo', 'hub', NULL, 'whole repository');
      INSERT INTO skills (owner, repo, name, display_name, modified_at, rendered_skill_path, current_sha) VALUES
        ('acme', 'kit', 'older', 'Older', 100, 'skills/older/SKILL.md', 'sha1'),
        ('acme', 'kit', 'newer', 'Newer', 200, 'skills/newer/SKILL.md', 'sha1'),
        ('solo', 'hub', 'stale', 'Stale', 100, 'skills/stale/SKILL.md', NULL),
        ('solo', 'hub', 'fresh', 'Fresh', 300, 'skills/fresh/SKILL.md', NULL);
      INSERT INTO repos VALUES ('acme', 'kit', 10, 'main', NULL, NULL, NULL);
      INSERT INTO repos VALUES ('solo', 'hub', 5, 'main', NULL, NULL, NULL);
    `)
    db = d1(sqlite)
  })

  afterEach(() => sqlite.close())

  function rows(): Array<{ position: number, owner: string, repo: string, name: string | null, reason: string | null }> {
    return sqlite.prepare('SELECT position, owner, repo, name, reason FROM collection_skills_v2 WHERE collection_id = 1 ORDER BY position').all() as never
  }

  it('prefers the account that signed in over a seeded placeholder with the same login', async () => {
    expect(await loadCuratorProfile(db, 'harlan-zw')).toEqual({ login: 'harlan-zw', name: 'Harlan Wilton', avatar: 'https://avatars.githubusercontent.com/u/1' })
  })

  it('reads registry summaries for exact Skills only', async () => {
    const found = await loadSkillCardRows(db, exactSkillRefs([
      { owner: 'acme', repo: 'kit', name: 'older' },
      { owner: 'solo', repo: 'hub', name: null },
      { owner: 'ACME', repo: 'kit', name: 'newer' },
      { owner: 'nobody', repo: 'x', name: 'y' },
    ]))
    expect([...found.values()].map(row => [row.name, row.stars, row.repo_skill_count])).toEqual([['older', 10, 2]])
  })

  it('reads one page of a collection with a total for every page', async () => {
    const page = await loadCollectionPage(db, 'harlan-zw', 'stack', { limit: 1, offset: 1 })
    expect(page?.total).toBe(2)
    expect(page?.entries.map(row => [row.name, row.reason])).toEqual([['fresh', 'whole repository']])
    expect([...page!.summaries.values()].map(row => row.name)).toEqual(['fresh'])
    expect(await loadCollectionPage(db, 'harlan-zw', 'missing', { limit: 10, offset: 0 })).toBeNull()
  })

  it('sets the reason on the whole-Repository entry that shows the Skill, without a second entry', async () => {
    expect(await putCollectionSkill(db, 1, { owner: 'solo', repo: 'hub', name: 'fresh' }, 'Newest first.')).toBe('Newest first.')
    expect(rows()).toEqual([
      { position: 0, owner: 'acme', repo: 'kit', name: 'older', reason: 'named' },
      { position: 1, owner: 'solo', repo: 'hub', name: null, reason: 'Newest first.' },
    ])
  })

  it('keeps the stored reason when the request leaves it out', async () => {
    expect(await putCollectionSkill(db, 1, { owner: 'acme', repo: 'kit', name: 'older' }, undefined)).toBe('named')
    expect(rows()).toHaveLength(2)
  })

  it('appends a new Skill and queues its curator counts', async () => {
    expect(await putCollectionSkill(db, 1, { owner: 'acme', repo: 'kit', name: 'newer' }, undefined)).toBeNull()
    expect(rows().at(-1)).toEqual({ position: 2, owner: 'acme', repo: 'kit', name: 'newer', reason: null })
    expect(sqlite.prepare('SELECT owner, repo, name, reason FROM skill_dirty').all()).toEqual([{ owner: 'acme', repo: 'kit', name: 'newer', reason: 'curator' }])
  })

  it('removes the whole-Repository entry only through the Skill it shows', async () => {
    await removeCollectionSkill(db, 1, { owner: 'solo', repo: 'hub', name: 'stale' })
    expect(rows()).toHaveLength(2)
    await removeCollectionSkill(db, 1, { owner: 'solo', repo: 'hub', name: 'fresh' })
    expect(rows().map(row => row.name)).toEqual(['older'])
  })

  it('watches each Repository once, and finds no unknown collection', async () => {
    sqlite.exec(`INSERT INTO collection_skills_v2 VALUES (1, 2, 'acme', 'kit', 'newer', NULL)`)
    expect(await watchCollection(db, 9, 'harlan-zw', 'stack')).toEqual({ _tag: 'Watched', repositories: 2 })
    expect(sqlite.prepare('SELECT owner, repo, source FROM skill_subscriptions ORDER BY owner').all()).toEqual([
      { owner: 'acme', repo: 'kit', source: 'collection:stack' },
      { owner: 'solo', repo: 'hub', source: 'collection:stack' },
    ])
    expect(await watchCollection(db, 9, 'harlan-zw', 'missing')).toEqual({ _tag: 'NotFound' })
  })

  it('refuses a taken slug and answers a new collection in the contract shape', async () => {
    const input = { slug: 'stack', name: 'Again', preamble: null, skills: [] }
    expect(await createCollection(db, 1, input)).toEqual({ _tag: 'SlugTaken' })

    const created = await createCollection(db, 1, {
      slug: 'picks',
      name: 'Picks',
      preamble: 'Two picks.',
      skills: [
        { owner: 'acme', repo: 'kit', name: 'newer', reason: 'Fresh.' },
        { owner: 'solo', repo: 'hub', name: 'stale', reason: null },
      ],
    })
    expect(created._tag).toBe('Created')
    const page = await loadCollectionPage(db, 'harlan-zw', 'picks', { limit: 100, offset: 0 })
    const answer = presentCollection(page!)
    expect(collectionsV1.operations.create.response.body.producer.safeParse(answer).success).toBe(true)
    expect(answer.skills.items.map(item => [item.name, item.reason])).toEqual([['newer', 'Fresh.'], ['stale', null]])
  })
})

/** The slice of the D1 API these utils use, over better-sqlite3. */
function d1(sqlite: Database.Database): never {
  const bound = (sql: string, params: unknown[]) => {
    const prepared = expandNumberedPlaceholders(sql, params)
    const run = () => sqlite.prepare(prepared.sql).run(...prepared.params)
    return {
      run,
      async all<T>() {
        return { results: sqlite.prepare(prepared.sql).all(...prepared.params) as T[] }
      },
      async first<T>() {
        return (sqlite.prepare(prepared.sql).get(...prepared.params) as T | undefined) ?? null
      },
    }
  }
  return {
    prepare: (sql: string) => ({ bind: (...params: unknown[]) => bound(sql, params) }),
    async batch(statements: Array<{ run: () => unknown }>) {
      sqlite.transaction(() => statements.forEach(statement => statement.run()))()
      return []
    },
  } as never
}

function expandNumberedPlaceholders(sql: string, params: unknown[]): { sql: string, params: unknown[] } {
  const expanded: unknown[] = []
  const nextSql = sql.replace(/\?(\d+)/g, (_, raw: string) => {
    expanded.push(params[Number(raw) - 1])
    return '?'
  })
  return expanded.length ? { sql: nextSql, params: expanded } : { sql, params }
}
