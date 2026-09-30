// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  findRetiredCollection,
  isNoindexCollection,
  NOINDEX_COLLECTIONS,
  RETIRED_COLLECTIONS,
  withoutUnindexedCollections,
} from '../../shared/retired-collections'

describe('findRetiredCollection', () => {
  it('finds the two collections no page absorbed', () => {
    expect(findRetiredCollection('/@harlan-zw/apple-apps')?.slug).toBe('apple-apps')
    expect(findRetiredCollection('/@harlan-zw/knowledge-workspace')?.slug).toBe('knowledge-workspace')
  })

  it('ignores a trailing slash and the query', () => {
    expect(findRetiredCollection('/@harlan-zw/apple-apps/?ref=x')?.slug).toBe('apple-apps')
  })

  it('reads the percent-encoded @ form', () => {
    expect(findRetiredCollection('/%40harlan-zw/apple-apps')?.slug).toBe('apple-apps')
    expect(findRetiredCollection('/%40harlan-zw/knowledge-workspace/')?.slug).toBe('knowledge-workspace')
  })

  it('does not throw on a malformed escape', () => {
    expect(findRetiredCollection('/%E0%A4%A')).toBeNull()
  })

  it('leaves live collections, the noindex trio and other authors alone', () => {
    expect(findRetiredCollection('/@harlan-zw/design-engineering-essentials')).toBeNull()
    expect(findRetiredCollection('/@harlan-zw/agent-building-stack')).toBeNull()
    expect(findRetiredCollection('/@someone/apple-apps')).toBeNull()
    expect(findRetiredCollection('/@harlan-zw')).toBeNull()
  })
})

describe('isNoindexCollection', () => {
  it('flags the old featured trio only', () => {
    for (const slug of ['agent-building-stack', 'agent-workflow-stack', 'typescript-engineering-stack'])
      expect(isNoindexCollection('harlan-zw', slug)).toBe(true)
    expect(isNoindexCollection('someone', 'agent-building-stack')).toBe(false)
    expect(isNoindexCollection('harlan-zw', 'essentials')).toBe(false)
    expect(isNoindexCollection('harlan-zw', 'apple-apps')).toBe(false)
  })
})

describe('withoutUnindexedCollections', () => {
  it('drops retired and noindex rows and keeps the rest in order', () => {
    const rows = [
      { author_login: 'harlan-zw', slug: 'essentials' },
      { author_login: 'harlan-zw', slug: 'apple-apps' },
      { author_login: 'someone', slug: 'apple-apps' },
      { author_login: 'harlan-zw', slug: 'typescript-engineering-stack' },
    ]
    expect(withoutUnindexedCollections(rows)).toEqual([
      { author_login: 'harlan-zw', slug: 'essentials' },
      { author_login: 'someone', slug: 'apple-apps' },
    ])
  })
})

describe('migration 0130', () => {
  it('soft-deletes the retired set and leaves the noindex trio live and featured', () => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, login TEXT NOT NULL);
        CREATE TABLE collections_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT, author_user_id INTEGER NOT NULL, slug TEXT NOT NULL,
          featured INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, deleted_at INTEGER
        );
        INSERT INTO users (id, login) VALUES (1, 'harlan-zw'), (2, 'someone');
      `)
      const slugs = [...RETIRED_COLLECTIONS, ...NOINDEX_COLLECTIONS].map(c => c.slug).concat('essentials')
      const insert = sqlite.prepare('INSERT INTO collections_v2 (author_user_id, slug, featured, updated_at) VALUES (?, ?, 1, 0)')
      for (const slug of slugs)
        insert.run(1, slug)
      insert.run(2, 'apple-apps')

      sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations/0130_retire_stale_collections.sql'), 'utf8'))

      const deleted = sqlite.prepare('SELECT u.login, c.slug, c.featured FROM collections_v2 c JOIN users u ON u.id = c.author_user_id WHERE c.deleted_at IS NOT NULL ORDER BY c.slug').all() as Array<{ login: string, slug: string, featured: number }>
      expect(deleted.map(r => r.slug)).toEqual(RETIRED_COLLECTIONS.map(c => c.slug).sort())
      expect(deleted.every(r => r.login === 'harlan-zw' && r.featured === 0)).toBe(true)
      const live = sqlite.prepare('SELECT slug FROM collections_v2 WHERE deleted_at IS NULL AND featured = 1 AND author_user_id = 1 ORDER BY slug').all() as Array<{ slug: string }>
      expect(live.map(r => r.slug)).toEqual([...NOINDEX_COLLECTIONS.map(c => c.slug), 'essentials'].sort())
    }
    finally {
      sqlite.close()
    }
  })
})
