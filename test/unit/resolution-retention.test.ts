// @vitest-environment node
import type { SqliteD1 } from './helpers/d1-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { pruneSettledResolutions, RESOLUTION_RETENTION_SECONDS } from '../../layers/artifact-delivery/server/utils/resolution-retention'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_795_000_000
const OLD = NOW - RESOLUTION_RETENTION_SECONDS - 60
const ARTIFACT = `sha256:${'a'.repeat(64)}`

let sqlite: SqliteD1

afterEach(() => sqlite?.close())

interface Seed {
  id: string
  at: number
  state?: 'ready' | 'blocked' | 'failed' | 'fetching'
  visibility?: 'public' | 'private'
}

function seed(rows: Seed[]) {
  sqlite = createSqliteD1(allMigrations())
  sqlite.raw.prepare(`INSERT INTO artifacts (id, content_sha256, content_bytes, format, r2_key)
    VALUES (?, ?, 1024, 'skilld-tar-v1', 'v1/public/a.bin')`).run(ARTIFACT, 'a'.repeat(64))
  for (const row of rows) {
    const state = row.state ?? 'ready'
    sqlite.raw.prepare(`INSERT INTO artifact_resolutions (
        id, request_fingerprint, state, visibility, requested_owner, requested_repository,
        selector_type, selector_value, artifact_id, attestation_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'acme', 'skills', 'named-skill', 'demo', ?, '{}', ?, ?)`).run(
      row.id,
      `fp-${row.id}`,
      state,
      row.visibility ?? 'public',
      state === 'ready' ? ARTIFACT : null,
      row.at,
      row.at,
    )
    if (state === 'ready') {
      sqlite.raw.prepare(`INSERT INTO artifact_attestations (resolution_id, artifact_id, attestation_json, created_at)
        VALUES (?, ?, '{}', ?)`).run(row.id, ARTIFACT, row.at)
    }
  }
}

function remaining(): string[] {
  return (sqlite.raw.prepare('SELECT id FROM artifact_resolutions ORDER BY id').all() as Array<{ id: string }>).map(row => row.id)
}

describe('pruneSettledResolutions', () => {
  it('keeps the newest ready build of an Artifact and drops its older copies', async () => {
    seed([
      { id: 'r1', at: OLD - 20 },
      { id: 'r2', at: OLD - 10 },
      { id: 'r3', at: OLD },
      { id: 'blocked', at: OLD, state: 'blocked' },
    ])

    expect(await pruneSettledResolutions(sqlite.db, { now: NOW })).toBe(3)

    expect(remaining()).toEqual(['r3'])
    expect(sqlite.raw.prepare('SELECT resolution_id FROM artifact_attestations').all()).toEqual([{ resolution_id: 'r3' }])
  })

  it('keeps recent, building, private, and run-checked Resolutions', async () => {
    seed([
      { id: 'checked', at: OLD - 30 },
      { id: 'private', at: OLD - 20, state: 'failed', visibility: 'private' },
      { id: 'building', at: OLD - 10, state: 'fetching' },
      { id: 'recent-failure', at: NOW - 60, state: 'failed' },
      { id: 'newest', at: NOW - 60 },
    ])
    sqlite.raw.prepare(`INSERT INTO artifact_run_checks (owner, repository, name, settled_resolution_id)
      VALUES ('acme', 'skills', 'demo', 'checked')`).run()

    expect(await pruneSettledResolutions(sqlite.db, { now: NOW })).toBe(0)

    expect(remaining()).toEqual(['building', 'checked', 'newest', 'private', 'recent-failure'])
  })

  it('deletes at most one batch per call', async () => {
    seed([
      { id: 'f1', at: OLD, state: 'failed' },
      { id: 'f2', at: OLD, state: 'failed' },
      { id: 'f3', at: OLD, state: 'failed' },
    ])

    expect(await pruneSettledResolutions(sqlite.db, { now: NOW, limit: 2 })).toBe(2)
    expect(await pruneSettledResolutions(sqlite.db, { now: NOW, limit: 2 })).toBe(1)
    expect(remaining()).toEqual([])
  })
})
