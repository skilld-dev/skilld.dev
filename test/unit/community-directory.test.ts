import type { CommunityCollectionSkillRow, CommunityDirectoryRow } from '../../server/utils/community'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  COMMUNITY_DIRECTORY_SQL,
  communityCollectionSkillPreviewSql,
  communityDirectoryItem,
} from '../../server/utils/community'

describe('community directory', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        github_id INTEGER NOT NULL UNIQUE,
        login TEXT NOT NULL,
        name TEXT,
        avatar TEXT,
        last_login_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE collections_v2 (
        id INTEGER PRIMARY KEY,
        author_user_id INTEGER NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        preamble TEXT,
        featured INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE TABLE collection_skills_v2 (
        collection_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT,
        PRIMARY KEY (collection_id, position)
      );
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        stars INTEGER NOT NULL DEFAULT 0,
        broken_since INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT,
        description TEXT,
        modified_at INTEGER,
        source_resolved INTEGER NOT NULL DEFAULT 0,
        rendered_status TEXT,
        PRIMARY KEY (owner, repo, name)
      );
    `)
  })

  afterEach(() => sqlite.close())

  it('returns one creator with their featured collection and highest-starred skill', () => {
    insertUser(1, 101, 'Creator', 'Ada Creator')
    insertCollection(1, 1, 'recent', 'Recent set', 0, 300)
    insertCollection(2, 1, 'featured', 'Featured set', 1, 100)
    insertCollectionSkill(1, 0, 'Creator', 'recent-skills', 'recent')
    insertCollectionSkill(2, 0, 'Creator', 'featured-skills', 'featured')
    insertCollectionSkill(2, 1, 'Creator', 'featured-skills', 'supporting')
    insertSkill('creator', 'small', 'newest', 10, 500)
    insertSkill('CREATOR', 'popular', 'best', 900, 200)

    const rows = sqlite.prepare(COMMUNITY_DIRECTORY_SQL).all() as CommunityDirectoryRow[]

    expect(rows).toHaveLength(1)
    expect(communityDirectoryItem(rows[0]!, selectCollectionSkills([2]))).toEqual({
      id: 1,
      login: 'Creator',
      name: 'Ada Creator',
      avatar: null,
      collectionCount: 2,
      skillCount: 2,
      featured: true,
      activityAt: 200,
      topCollection: {
        authorLogin: 'Creator',
        slug: 'featured',
        name: 'Featured set',
        preamble: null,
        skillCount: 2,
        skills: [
          {
            owner: 'Creator',
            repo: 'featured-skills',
            name: 'featured',
            displayName: null,
          },
          {
            owner: 'Creator',
            repo: 'featured-skills',
            name: 'supporting',
            displayName: null,
          },
        ],
        updatedAt: 100,
      },
      topSkill: {
        owner: 'CREATOR',
        repo: 'popular',
        name: 'best',
        displayName: null,
        description: null,
        stars: 900,
        modifiedAt: 200,
      },
    })
  })

  it('caps collection previews at four skills while retaining collection order and total count', () => {
    insertUser(1, 101, 'curator')
    insertCollection(1, 1, 'set', 'Five useful skills', 0, 100)
    ;['first', 'second', 'third', 'fourth', 'fifth'].forEach((name, position) => {
      insertCollectionSkill(1, position, 'curator', 'skills', name)
    })

    const rows = sqlite.prepare(COMMUNITY_DIRECTORY_SQL).all() as CommunityDirectoryRow[]
    const item = communityDirectoryItem(rows[0]!, selectCollectionSkills([1]))

    expect(item.topCollection?.skillCount).toBe(5)
    expect(item.topCollection?.skills.map(skill => skill.name)).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ])
  })

  it('excludes empty collections and broken or unreadable skills', () => {
    insertUser(1, 101, 'empty')
    insertCollection(1, 1, 'empty', 'Empty set', 1, 100)

    insertUser(2, 102, 'broken')
    insertSkill('broken', 'repo', 'skill', 500, 100, { broken: true })

    insertUser(3, 103, 'unreadable')
    insertSkill('unreadable', 'repo', 'skill', 400, 100, { resolved: false })

    insertUser(4, 104, 'valid')
    insertSkill('valid', 'repo', 'skill', 5, 100)

    const rows = sqlite.prepare(COMMUNITY_DIRECTORY_SQL).all() as CommunityDirectoryRow[]

    expect(rows.map(row => row.login)).toEqual(['valid'])
  })

  it('ranks featured curators first, then creators with both contribution types, then GitHub stars', () => {
    insertUser(1, 101, 'skills-only')
    insertSkill('skills-only', 'repo', 'one', 10_000, 100)

    insertUser(2, 102, 'both')
    insertCollection(2, 2, 'set', 'Useful set', 0, 150)
    insertCollectionSkill(2, 0, 'both', 'repo', 'one')
    insertSkill('both', 'repo', 'one', 5, 100)

    insertUser(3, 103, 'featured')
    insertCollection(3, 3, 'set', 'Featured set', 1, 50)
    insertCollectionSkill(3, 0, 'featured', 'repo', 'one')

    const rows = sqlite.prepare(COMMUNITY_DIRECTORY_SQL).all() as CommunityDirectoryRow[]

    expect(rows.map(row => row.login)).toEqual(['featured', 'both', 'skills-only'])
    expect(rows.every(row => row.total_creators === 3)).toBe(true)
  })

  it('folds a normalized legacy ghost login into its real GitHub identity', () => {
    insertUser(1, 101, 'creator-name', 'Ada Creator', 200)
    insertUser(2, -1, 'creatorname', 'Ada Creator', 100)
    insertCollection(1, 1, 'current', 'Current set', 0, 200)
    insertCollection(2, 2, 'legacy', 'Legacy featured set', 1, 100)
    insertCollectionSkill(1, 0, 'creator-name', 'current', 'skill')
    insertCollectionSkill(2, 0, 'creatorname', 'legacy', 'skill')

    const rows = sqlite.prepare(COMMUNITY_DIRECTORY_SQL).all() as CommunityDirectoryRow[]
    const item = communityDirectoryItem(rows[0]!, selectCollectionSkills([2]))

    expect(rows).toHaveLength(1)
    expect(item).toEqual(expect.objectContaining({
      id: 1,
      login: 'creator-name',
      collectionCount: 2,
      topCollection: expect.objectContaining({
        authorLogin: 'creatorname',
        slug: 'legacy',
      }),
    }))
  })

  function insertUser(
    id: number,
    githubId: number,
    login: string,
    name: string | null = null,
    lastLoginAt = 0,
  ) {
    sqlite.prepare('INSERT INTO users (id, github_id, login, name, last_login_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, githubId, login, name, lastLoginAt)
  }

  function insertCollection(
    id: number,
    userId: number,
    slug: string,
    name: string,
    featured: number,
    updatedAt: number,
  ) {
    sqlite.prepare(`
      INSERT INTO collections_v2 (id, author_user_id, slug, name, featured, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, slug, name, featured, updatedAt)
  }

  function insertCollectionSkill(
    collectionId: number,
    position: number,
    owner: string,
    repo: string,
    name: string,
  ) {
    sqlite.prepare(`
      INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name)
      VALUES (?, ?, ?, ?, ?)
    `).run(collectionId, position, owner, repo, name)
  }

  function insertSkill(
    owner: string,
    repo: string,
    name: string,
    stars: number,
    modifiedAt: number,
    options: { broken?: boolean, resolved?: boolean } = {},
  ) {
    sqlite.prepare('INSERT OR IGNORE INTO repos (owner, repo, stars, broken_since) VALUES (?, ?, ?, ?)')
      .run(owner, repo, stars, options.broken ? 1 : null)
    sqlite.prepare(`
      INSERT INTO skills (
        owner, repo, name, display_name, description, modified_at,
        source_resolved, rendered_status
      ) VALUES (?, ?, ?, NULL, NULL, ?, ?, 'ok')
    `).run(owner, repo, name, modifiedAt, options.resolved === false ? 0 : 1)
  }

  function selectCollectionSkills(collectionIds: number[]): CommunityCollectionSkillRow[] {
    return sqlite
      .prepare(communityCollectionSkillPreviewSql(collectionIds.length))
      .all(...collectionIds) as CommunityCollectionSkillRow[]
  }
})
