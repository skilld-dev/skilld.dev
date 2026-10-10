import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { GENERAL_SYNC_CANDIDATES_SQL } from '../../layers/registry/server/utils/sync-candidates'
import { allMigrations, createSqliteD1 } from './helpers/d1-sqlite'

it('makes indexed unknown-fork repositories due without guessing their fork status', async () => {
  const migration = 'migrations/0153_validation_fork_metadata_refresh.sql'
  const harness = createSqliteD1(allMigrations().filter(path => path !== migration))
  try {
    for (const [repo, fork] of [['unknown', null], ['known', 0], ['fork', 1], ['empty', null]] as const) {
      harness.raw.prepare('INSERT INTO repos (owner, repo, is_fork, repo_meta_synced_at) VALUES (?, ?, ?, ?)')
        .run('owner', repo, fork, 1000)
      if (repo !== 'empty') {
        harness.raw.prepare('INSERT INTO skills (owner,repo,name,display_name,slug) VALUES (?, ?, ?, ?, ?)')
          .run('owner', repo, 'example', 'Example', 'example')
      }
    }
    harness.raw.exec(readFileSync(migration, 'utf8'))
    const due = await harness.db.prepare(GENERAL_SYNC_CANDIDATES_SQL).bind(900, 1).all<{ repo: string }>()
    expect(due.results?.map(row => row.repo)).toEqual(['unknown'])
    expect(harness.raw.prepare('SELECT is_fork FROM repos WHERE repo = ?').get('unknown')).toEqual({ is_fork: null })
    expect(harness.raw.prepare('SELECT repo_meta_synced_at FROM repos WHERE repo = ?').get('empty')).toEqual({ repo_meta_synced_at: 1000 })
  }
  finally {
    harness.close()
  }
})
