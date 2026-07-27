import type { EligibleEmbeddingRow, EmbeddingParityVector } from '../../layers/registry/server/utils/embedding-parity'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  calculateEmbeddingParity,
  parseEmbeddingParityMode,
  runEmbeddingParityCheck,
} from '../../layers/registry/server/utils/embedding-parity'
import { vectorIdFor } from '../../layers/registry/server/utils/vector-id'

describe('embedding parity', () => {
  let sqlite: Database.Database | undefined

  afterEach(() => sqlite?.close())

  it('detects a current D1 marker whose vector is missing', async () => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (owner TEXT, repo TEXT, broken_since INTEGER, PRIMARY KEY (owner, repo));
      CREATE TABLE skills (
        owner TEXT, repo TEXT, name TEXT, current_sha TEXT, rendered_raw TEXT,
        rendered_status TEXT, seo_indexable INTEGER, PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE skill_generated (
        owner TEXT, repo TEXT, name TEXT, kind TEXT, sha TEXT, payload TEXT,
        generated_at TEXT, PRIMARY KEY (owner, repo, name, kind)
      );
      INSERT INTO repos VALUES ('acme', 'skills', NULL);
      INSERT INTO skills VALUES ('acme', 'skills', 'one', 'sha-current', '# Skill', 'ok', 1);
      INSERT INTO skill_generated VALUES (
        'acme', 'skills', 'one', 'embedding', 'sha-current', '{}', '2026-07-23T00:00:00.000Z'
      );
    `)
    const db = wrapSqlite(sqlite)
    const expectedId = await vectorIdFor({ owner: 'acme', repo: 'skills', name: 'one' })

    const result = await runEmbeddingParityCheck(
      { _tag: 'local_dry_run' },
      {
        db,
        vectorize: { getByIds: async () => [] },
        listVectorIds: async () => [],
      },
    )

    expect(result).toMatchObject({
      counts: { eligible: 1, present: 0, missing: 1, stale: 0, orphan: 0 },
      ids: { missing: [expectedId] },
    })
  })

  it('returns exact eligible, present, missing, stale, and orphan sets', async () => {
    const rows: EligibleEmbeddingRow[] = [
      eligible('present', 'sha-present', 'sha-present'),
      eligible('missing', 'sha-missing', 'sha-missing'),
      eligible('stale', 'sha-current', 'sha-current'),
      eligible('unmarked', 'sha-unmarked', null),
    ]
    const ids = new Map(await Promise.all(rows.map(async row => [row.name, await vectorIdFor(row)] as const)))
    const orphanId = 'orphan-vector-id'
    const vectors: EmbeddingParityVector[] = [
      { id: ids.get('present')!, metadata: { sha: 'sha-present' } },
      { id: ids.get('stale')!, metadata: { sha: 'sha-old' } },
      { id: ids.get('unmarked')!, metadata: { sha: 'sha-unmarked' } },
    ]

    const result = await calculateEmbeddingParity(rows, vectors, [...ids.values(), orphanId])

    expect(result.counts).toEqual({ eligible: 4, present: 1, missing: 1, stale: 2, orphan: 1 })
    expect(result.ids).toEqual({
      present: [ids.get('present')],
      missing: [ids.get('missing')],
      stale: [ids.get('stale'), ids.get('unmarked')].sort(),
      orphan: [orphanId],
    })
  })

  it('refuses remote parity mode without explicit dry-run', () => {
    expect(parseEmbeddingParityMode(['--remote'])).toEqual({
      _tag: 'refused',
      reason: 'remote_requires_dry_run',
    })
    expect(parseEmbeddingParityMode(['--remote', '--dry-run'])).toEqual({ _tag: 'remote_dry_run' })
    expect(parseEmbeddingParityMode([])).toEqual({ _tag: 'local_dry_run' })
  })

  it('keeps binding reads within the Vectorize getByIds limit', async () => {
    const rows = Array.from({ length: 21 }, (_, index) =>
      eligible(`skill-${index}`, `sha-${index}`, `sha-${index}`))
    const ids = await Promise.all(rows.map(row => vectorIdFor(row)))
    const chunkSizes: number[] = []
    const db = {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return {
                  results: rows.map(row => ({
                    owner: row.owner,
                    repo: row.repo,
                    name: row.name,
                    current_sha: row.currentSha,
                    marker_sha: row.markerSha,
                  })),
                }
              },
            }
          },
        }
      },
    } as D1Database

    const result = await runEmbeddingParityCheck(
      { _tag: 'local_dry_run' },
      {
        db,
        vectorize: {
          getByIds: async (requested) => {
            chunkSizes.push(requested.length)
            return requested.map((id) => {
              const index = ids.indexOf(id)
              return {
                id,
                values: [],
                metadata: { sha: `sha-${index}` },
              }
            })
          },
        },
        listVectorIds: async () => ids,
      },
    )

    expect(result.counts.present).toBe(21)
    expect(chunkSizes).toEqual([20, 1])
  })
})

function eligible(name: string, currentSha: string, markerSha: string | null): EligibleEmbeddingRow {
  return {
    owner: 'acme',
    repo: 'skills',
    name,
    currentSha,
    markerSha,
  }
}

function wrapSqlite(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all<T>() {
              return { results: sqlite.prepare(sql).all(...params) as T[] }
            },
          }
        },
      }
    },
  } as unknown as D1Database
}
