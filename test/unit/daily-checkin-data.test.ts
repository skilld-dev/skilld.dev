// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = resolve(process.cwd(), 'scripts/tools/daily-checkin-data.mjs')
const statePath = resolve(process.cwd(), 'docs/ops/checkins/state.json')

describe('daily check-in data script', () => {
  // state.json is hand-editable, so a corrupted lastRunAt is a real condition.
  // The archive promises a {_tag: 'invalid'} baseline for it, but the script
  // crashed on since.toISOString() before that branch could ever run, so a
  // corrupted baseline produced a RangeError and no doc at all.
  it('archives an invalid baseline instead of crashing on a corrupted lastRunAt', () => {
    const original = readFileSync(statePath, 'utf8')
    try {
      writeFileSync(statePath, JSON.stringify({ lastRunAt: 'garbage' }))
      const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8', timeout: 120_000 })

      expect(result.status).toBe(0)
      const doc = JSON.parse(result.stdout)
      expect(doc.baseline).toEqual({ _tag: 'invalid' })
    }
    finally {
      writeFileSync(statePath, original)
    }
  }, 150_000)

  // Hand edits also corrupt the file text itself: a trailing comma or a
  // missing quote makes JSON.parse throw at the top level, so the process
  // died on a SyntaxError before any doc, let alone an invalid baseline,
  // could be produced.
  it('archives an invalid baseline instead of crashing on unparseable state.json', () => {
    const original = readFileSync(statePath, 'utf8')
    try {
      writeFileSync(statePath, '{"lastRunAt": "2026-09-01T01:20:49.248Z",}')
      const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8', timeout: 120_000 })

      expect(result.status).toBe(0)
      const doc = JSON.parse(result.stdout)
      expect(doc.baseline).toEqual({ _tag: 'invalid' })
    }
    finally {
      writeFileSync(statePath, original)
    }
  }, 150_000)
})
