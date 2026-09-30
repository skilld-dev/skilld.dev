// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  findRetiredCollection,
  RETIRED_COLLECTIONS,
  retiredCollectionRedirectRules,
  withoutRetiredCollections,
} from '../../shared/retired-collections'

describe('findRetiredCollection', () => {
  it('redirects the old featured trio to the category that absorbed it', () => {
    expect(findRetiredCollection('/@harlan-zw/agent-building-stack')?.outcome).toEqual({ _tag: 'redirect', to: '/skills/context-engineering' })
    expect(findRetiredCollection('/@harlan-zw/agent-workflow-stack')?.outcome).toEqual({ _tag: 'redirect', to: '/skills/context-engineering' })
    expect(findRetiredCollection('/@harlan-zw/typescript-engineering-stack')?.outcome).toEqual({ _tag: 'redirect', to: '/skills/coding' })
  })

  it('answers gone for the two collections no page absorbed', () => {
    expect(findRetiredCollection('/@harlan-zw/apple-apps')?.outcome).toEqual({ _tag: 'gone' })
    expect(findRetiredCollection('/@harlan-zw/knowledge-workspace')?.outcome).toEqual({ _tag: 'gone' })
  })

  it('ignores a trailing slash and the query', () => {
    expect(findRetiredCollection('/@harlan-zw/apple-apps/?ref=x')?.slug).toBe('apple-apps')
  })

  it('leaves live collections and other authors alone', () => {
    expect(findRetiredCollection('/@harlan-zw/design-engineering-essentials')).toBeNull()
    expect(findRetiredCollection('/@someone/apple-apps')).toBeNull()
    expect(findRetiredCollection('/@harlan-zw')).toBeNull()
  })

  it('redirects only to live, non-retired paths', () => {
    for (const c of RETIRED_COLLECTIONS) {
      if (c.outcome._tag === 'redirect')
        expect(findRetiredCollection(c.outcome.to)).toBeNull()
    }
  })
})

describe('retiredCollectionRedirectRules', () => {
  it('emits a 301 rule for each redirect and none for a 410', () => {
    expect(retiredCollectionRedirectRules()).toEqual({
      '/@harlan-zw/agent-building-stack': { redirect: { to: '/skills/context-engineering', statusCode: 301 } },
      '/@harlan-zw/agent-workflow-stack': { redirect: { to: '/skills/context-engineering', statusCode: 301 } },
      '/@harlan-zw/typescript-engineering-stack': { redirect: { to: '/skills/coding', statusCode: 301 } },
    })
  })
})

describe('withoutRetiredCollections', () => {
  it('drops retired rows and keeps the rest in order', () => {
    const rows = [
      { author_login: 'harlan-zw', slug: 'essentials' },
      { author_login: 'harlan-zw', slug: 'apple-apps' },
      { author_login: 'someone', slug: 'apple-apps' },
      { author_login: 'harlan-zw', slug: 'typescript-engineering-stack' },
    ]
    expect(withoutRetiredCollections(rows)).toEqual([
      { author_login: 'harlan-zw', slug: 'essentials' },
      { author_login: 'someone', slug: 'apple-apps' },
    ])
  })
})

describe('migration 0130', () => {
  it('soft-deletes exactly the retirement set', () => {
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
      const slugs = [...RETIRED_COLLECTIONS.map(c => c.slug), 'essentials']
      const insert = sqlite.prepare('INSERT INTO collections_v2 (author_user_id, slug, featured, updated_at) VALUES (?, ?, 1, 0)')
      for (const slug of slugs)
        insert.run(1, slug)
      insert.run(2, 'apple-apps')

      sqlite.exec(readFileSync(resolve(process.cwd(), 'migrations/0130_retire_stale_collections.sql'), 'utf8'))

      const deleted = sqlite.prepare('SELECT u.login, c.slug, c.featured FROM collections_v2 c JOIN users u ON u.id = c.author_user_id WHERE c.deleted_at IS NOT NULL ORDER BY c.slug').all() as Array<{ login: string, slug: string, featured: number }>
      expect(deleted.map(r => r.slug)).toEqual(RETIRED_COLLECTIONS.map(c => c.slug).sort())
      expect(deleted.every(r => r.login === 'harlan-zw' && r.featured === 0)).toBe(true)
    }
    finally {
      sqlite.close()
    }
  })
})
