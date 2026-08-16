import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseHealthEmailRows,
  parseWorkflowName,
  summarizeWorkflowRuns,
} from '../../scripts/tools/daily-checkin-observability.mjs'

function run(
  workflowName: string,
  status: 'completed' | 'in_progress',
  conclusion: '' | 'failure' | 'success' | 'skipped',
  databaseId: number,
) {
  return {
    workflowName,
    status,
    conclusion,
    databaseId,
    displayTitle: 'chore: bump',
    headSha: 'abc123',
    createdAt: `2026-07-27T02:${databaseId}:00Z`,
    updatedAt: `2026-07-27T02:${databaseId}:30Z`,
    url: `https://example.com/runs/${databaseId}`,
  }
}

describe('daily check-in observability', () => {
  it('surfaces every required workflow and preserves a failure behind an in-progress run', () => {
    expect(summarizeWorkflowRuns([
      run('Deploy to Cloudflare', 'in_progress', '', 4),
      run('Test', 'in_progress', '', 3),
      run('Deploy to Cloudflare', 'completed', 'success', 2),
      run('Test', 'completed', 'failure', 1),
    ], ['Test', 'Deploy to Cloudflare'])).toEqual([
      {
        name: 'Test',
        latestRun: run('Test', 'in_progress', '', 3),
        latestCompletedRun: run('Test', 'completed', 'failure', 1),
        state: {
          _tag: 'pending',
          consecutiveFailures: 1,
          previousConclusion: 'failure',
        },
      },
      {
        name: 'Deploy to Cloudflare',
        latestRun: run('Deploy to Cloudflare', 'in_progress', '', 4),
        latestCompletedRun: run('Deploy to Cloudflare', 'completed', 'success', 2),
        state: {
          _tag: 'pending',
          consecutiveFailures: 0,
          previousConclusion: 'success',
        },
      },
    ])
  })

  it('uses explicit states for passing, failing, and missing workflows', () => {
    const rows = [
      run('Test', 'completed', 'failure', 4),
      run('Test', 'completed', 'failure', 3),
      run('Deploy to Cloudflare', 'completed', 'success', 2),
    ]

    expect(summarizeWorkflowRuns(rows, ['Test', 'Deploy to Cloudflare', 'Security']))
      .toMatchObject([
        { name: 'Test', state: { _tag: 'failure', consecutiveFailures: 2 } },
        { name: 'Deploy to Cloudflare', state: { _tag: 'success' } },
        { name: 'Security', state: { _tag: 'missing' } },
      ])
  })

  it('reads through a skipped run to the verdict the workflow last reached', () => {
    const rows = [
      run('Deploy to Cloudflare', 'completed', 'skipped', 3),
      run('Deploy to Cloudflare', 'completed', 'success', 2),
    ]

    expect(summarizeWorkflowRuns(rows, ['Deploy to Cloudflare'])).toMatchObject([
      {
        name: 'Deploy to Cloudflare',
        latestCompletedRun: run('Deploy to Cloudflare', 'completed', 'success', 2),
        state: { _tag: 'success' },
      },
    ])
  })

  it('reports a workflow that only ever skipped as missing, not as broken', () => {
    expect(summarizeWorkflowRuns([
      run('Deploy to Cloudflare', 'completed', 'skipped', 1),
    ], ['Deploy to Cloudflare'])).toMatchObject([
      { name: 'Deploy to Cloudflare', state: { _tag: 'missing' } },
    ])
  })

  it('extracts actionable health reasons from persisted report summaries', () => {
    expect(parseHealthEmailRows([{
      report_date: '2026-07-27',
      health_status: 'RED',
      delivery_status: 'sent',
      recipient: 'operator@example.com',
      sent_at: 123,
      error: null,
      summary_json: JSON.stringify({
        warnings: ['Cost is partial.'],
        reasons: ['178 jobs failed in 24 hours.'],
        window: {
          reportDate: '2026-07-27',
          from: '2026-07-25T22:00:49Z',
          to: '2026-07-26T22:00:49Z',
          workerVersion: '2cade213',
        },
      }),
    }])).toEqual([{
      reportDate: '2026-07-27',
      healthStatus: 'RED',
      deliveryStatus: 'sent',
      recipient: 'operator@example.com',
      sentAt: 123,
      error: null,
      reasons: ['178 jobs failed in 24 hours.'],
      warnings: ['Cost is partial.'],
      window: {
        reportDate: '2026-07-27',
        from: '2026-07-25T22:00:49Z',
        to: '2026-07-26T22:00:49Z',
        workerVersion: '2cade213',
      },
    }])
  })

  it('rejects malformed persisted health summaries', () => {
    expect(() => parseHealthEmailRows([{
      report_date: '2026-07-27',
      health_status: 'RED',
      delivery_status: 'sent',
      recipient: 'operator@example.com',
      sent_at: 123,
      error: null,
      summary_json: '{',
    }])).toThrow('invalid summary_json')
  })
})

describe('workflow gate coverage', () => {
  it('reads the declared name so a new workflow joins the gate automatically', () => {
    expect(parseWorkflowName('name: Embedding parity alarm\n\non:\n  schedule:\n    - cron: \'35 20 * * *\'\n'))
      .toBe('Embedding parity alarm')
  })

  it('accepts a quoted name and ignores names nested under other keys', () => {
    expect(parseWorkflowName('name: "Deploy to Cloudflare"\njobs:\n  audit:\n    name: inner\n')).toBe('Deploy to Cloudflare')
  })

  it('returns null when a definition declares no name', () => {
    expect(parseWorkflowName('on:\n  push:\n')).toBe(null)
  })

  // Pinning a workflow by name would make this fail whenever one is legitimately
  // added or retired. What the gate actually depends on is that every definition
  // present resolves to a name, so none can silently fall outside the verdict.
  it('resolves a name for every workflow the repository defines', () => {
    const files = readdirSync(resolve(process.cwd(), '.github/workflows'))
      .filter(file => /\.ya?ml$/.test(file))
    const declared = files
      .map(file => parseWorkflowName(readFileSync(resolve(process.cwd(), '.github/workflows', file), 'utf8')))

    expect(files.length).toBeGreaterThan(0)
    expect(declared).not.toContain(null)
    expect(new Set(declared).size).toBe(declared.length)
  })
})
