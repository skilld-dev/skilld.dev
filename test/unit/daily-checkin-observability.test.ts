import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  approximateDeployedSha,
  buildCopyQuery,
  buildWorkersQuery,
  collectWorkflowRuns,
  deriveBaselineFlag,
  parseWorkflowName,
  readMigrationState,
  refreshProductionRef,
  runListArgs,
  summarizeCopies,
  summarizeWorkflowRuns,
} from '../../checks/_helpers/observability.mjs'

function run(
  workflowName: string,
  status: 'completed' | 'in_progress',
  conclusion: '' | 'failure' | 'success' | 'skipped' | 'cancelled',
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
  const production = { _tag: 'production' as const, ref: 'origin/main' }

  it('reads deployed state from production instead of the current feature branch', () => {
    const runGit = (args: string[]) => {
      if (args[0] === 'rev-list')
        return args.at(-1) === 'origin/main' ? 'deployed-sha' : 'feature-sha'
      if (args[0] === 'ls-tree' && args[2] === 'origin/main')
        return 'migrations/0111_github_app_delivery.sql\nmigrations/0112_private_artifact_keys.sql'
      if (args[0] === 'ls-tree' && args[2] === 'HEAD')
        return 'migrations/0108_weekly_email.sql\nmigrations/0109_weekly_click_events.sql'
      throw new Error(`unexpected git command: ${args.join(' ')}`)
    }

    expect(approximateDeployedSha(runGit, production, '2026-08-20T17:32:48Z')).toBe('deployed-sha')
    expect(approximateDeployedSha(runGit, production, null)).toBe(null)
    expect(readMigrationState(runGit, production, [
      '0108_weekly_email.sql',
      '0109_weekly_click_events.sql',
    ])).toEqual({
      localHead: '0112_private_artifact_keys.sql',
      uncommitted: [],
    })
  })

  it('keeps worktree-only migrations visible as uncommitted', () => {
    const runGit = (args: string[]) => {
      if (args[0] === 'ls-tree' && args[2] === 'origin/main')
        return 'migrations/0112_private_artifact_keys.sql'
      if (args[0] === 'ls-tree' && args[2] === 'HEAD')
        return 'migrations/0112_private_artifact_keys.sql'
      throw new Error(`unexpected git command: ${args.join(' ')}`)
    }

    expect(readMigrationState(runGit, production, [
      '0112_private_artifact_keys.sql',
      '0113_scratch.sql',
    ])).toEqual({
      localHead: '0112_private_artifact_keys.sql',
      uncommitted: ['0113_scratch.sql'],
    })
  })

  it('returns the production token only after origin/main is fetched', () => {
    const commands: string[] = []
    const runGit = (args: string[]) => {
      commands.push(args.join(' '))
      return ''
    }

    expect(refreshProductionRef(runGit)).toEqual(production)
    expect(commands).toEqual(['fetch origin main'])
  })

  // A silently failed fetch left origin/main stale on 2026-09-03, and both the
  // migration comparison and the deploy SHA read it. Refusing to hand out the
  // token is the point: the caller scopes the throw into a probe error.
  it('throws when the production ref cannot be refreshed instead of handing out the stale one', () => {
    const runGit = (args: string[]) => {
      if (args[0] === 'fetch')
        throw new Error('fatal: Authentication failed for https://github.com/')
      throw new Error(`unexpected git command: ${args.join(' ')}`)
    }

    expect(() => refreshProductionRef(runGit)).toThrow('Authentication failed')
  })

  it('scopes Worker analytics at the API boundary', () => {
    expect(buildWorkersQuery(
      '2026-08-20T02:28:50.987Z',
      '2026-08-21T02:53:53.726Z',
    )).toContain('filter: {scriptName: "skilld-dev"')
  })

  // The exact shape from issue #195: the routine ran on 2026-09-09 and not
  // again until the 21:40Z slot six days later, so every "overnight" rate in
  // the archive covered six days while reading as an ordinary window.
  it('flags a six-day skip as a stale baseline and reports the gap hours', () => {
    expect(deriveBaselineFlag(
      '2026-09-09T21:40:00.000Z',
      '2026-09-15T21:40:00.000Z',
    )).toEqual({ _tag: 'stale', gapHours: 144 })
  })

  it('reads the daily cadence and its jitter as fresh, and a skipped slot as stale', () => {
    expect(deriveBaselineFlag(
      '2026-09-09T21:40:00.000Z',
      '2026-09-10T21:40:00.000Z',
    )).toEqual({ _tag: 'fresh', gapHours: 24 })
    expect(deriveBaselineFlag(
      '2026-09-09T21:40:00.000Z',
      '2026-09-11T09:40:00.000Z',
    )).toEqual({ _tag: 'fresh', gapHours: 36 })
    expect(deriveBaselineFlag(
      '2026-09-09T21:40:00.000Z',
      '2026-09-11T09:46:00.000Z',
    )).toEqual({ _tag: 'stale', gapHours: 36.1 })
  })

  it('reports a corrupted or future baseline as invalid instead of a confident wrong gap', () => {
    expect(deriveBaselineFlag('garbage', '2026-09-10T21:40:00.000Z')).toEqual({ _tag: 'invalid' })
    expect(deriveBaselineFlag(
      '2026-09-11T00:00:00.000Z',
      '2026-09-10T00:00:00.000Z',
    )).toEqual({ _tag: 'invalid' })
  })

  // test.yml runs on every pull_request, so on 2026-09-10 four PR branch
  // failures were archived as a broken main gate while main's own Test run on
  // the deployed SHA passed. Every `gh run list` the collector makes must be
  // scoped to main, both the per-workflow pages and the recent feed.
  it('scopes every gh run list to main so a PR failure cannot read as a main failure', () => {
    expect(runListArgs('Test', 10)).toEqual(expect.arrayContaining(['--workflow', 'Test', '--branch', 'main']))
    expect(runListArgs('Test', 100)).toEqual(expect.arrayContaining(['--limit', '100']))
    expect(runListArgs(null, 20)).toEqual(expect.arrayContaining(['--branch', 'main']))
    expect(runListArgs(null, 20)).not.toContain('--workflow')
  })

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

  // The real shape from 2026-09-21: cancelled concurrency queue-mates sat in
  // front of the run that deployed a1b4db6, so the gate archived failure/2 on
  // a healthy deploy. A cancelled run never rendered a verdict.
  it('reads through cancelled queue-mates to the deploy that actually shipped', () => {
    const rows = [
      run('Deploy to Cloudflare', 'completed', 'cancelled', 3),
      run('Deploy to Cloudflare', 'completed', 'cancelled', 2),
      run('Deploy to Cloudflare', 'completed', 'success', 1),
    ]

    expect(summarizeWorkflowRuns(rows, ['Deploy to Cloudflare'])).toMatchObject([
      {
        name: 'Deploy to Cloudflare',
        latestCompletedRun: run('Deploy to Cloudflare', 'completed', 'success', 1),
        state: { _tag: 'success' },
      },
    ])
  })

  it('reports a history of only cancelled runs as missing, not as a broken gate', () => {
    expect(summarizeWorkflowRuns([
      run('Deploy to Cloudflare', 'completed', 'cancelled', 2),
      run('Deploy to Cloudflare', 'completed', 'cancelled', 1),
    ], ['Deploy to Cloudflare'])).toMatchObject([
      { name: 'Deploy to Cloudflare', state: { _tag: 'missing' } },
    ])
  })

  // The real shape from 2026-09-01: eleven skipped guard runs sat in front of the
  // deploy that actually shipped, so a ten-run sample never reached a verdict and
  // a healthy deploy was archived as `missing`.
  it('samples deeper when a page of skipped guard runs hides the last verdict', async () => {
    const history = [
      ...Array.from({ length: 11 }, (_, index) => run('Deploy to Cloudflare', 'completed', 'skipped', 30 - index)),
      run('Deploy to Cloudflare', 'completed', 'success', 19),
      run('Deploy to Cloudflare', 'completed', 'success', 18),
    ]
    const requestedLimits: number[] = []
    const listRuns = (name: string, limit: number) => {
      requestedLimits.push(limit)
      return history.filter(row => row.workflowName === name).slice(0, limit)
    }

    // The gap itself: the ten-run page the collector used to take reaches no
    // verdict, so a shipped deploy was reported as an observability gap.
    expect(summarizeWorkflowRuns(history.slice(0, 10), ['Deploy to Cloudflare']))
      .toMatchObject([{ name: 'Deploy to Cloudflare', state: { _tag: 'missing' } }])

    const rows = await collectWorkflowRuns(listRuns, ['Deploy to Cloudflare'])

    expect(requestedLimits).toEqual([10, 100])
    expect(summarizeWorkflowRuns(rows, ['Deploy to Cloudflare'])).toMatchObject([
      {
        name: 'Deploy to Cloudflare',
        latestRun: run('Deploy to Cloudflare', 'completed', 'skipped', 30),
        latestCompletedRun: run('Deploy to Cloudflare', 'completed', 'success', 19),
        state: { _tag: 'success' },
      },
    ])
  })

  it('stops at one deeper sample so a workflow with no verdict in history stays missing', async () => {
    const history = Array.from({ length: 120 }, (_, index) => run('Security', 'completed', 'skipped', 99 - (index % 80)))
    const requestedLimits: number[] = []
    const listRuns = (name: string, limit: number) => {
      requestedLimits.push(limit)
      return history.filter(row => row.workflowName === name).slice(0, limit)
    }

    const rows = await collectWorkflowRuns(listRuns, ['Security'])

    expect(requestedLimits).toEqual([10, 100])
    expect(summarizeWorkflowRuns(rows, ['Security'])).toMatchObject([
      { name: 'Security', state: { _tag: 'missing' } },
    ])
  })

  it('does not pay for a deeper sample when the head page is the whole history', async () => {
    const requestedLimits: number[] = []
    const listRuns = (_name: string, limit: number) => {
      requestedLimits.push(limit)
      return [run('Test', 'completed', 'skipped', 11)]
    }

    expect(await collectWorkflowRuns(listRuns, ['Test'])).toHaveLength(1)
    expect(requestedLimits).toEqual([10])
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

describe('command copy analytics', () => {
  it('reads the window with Analytics Engine timestamps and sampling restored', () => {
    const sql = buildCopyQuery('2026-09-21T00:00:00.000Z', '2026-09-22T00:00:00.000Z')

    expect(sql).toContain('FROM skilld_web_v1')
    expect(sql).toContain(`timestamp >= toDateTime('2026-09-21 00:00:00')`)
    expect(sql).toContain(`timestamp < toDateTime('2026-09-22 00:00:00')`)
    expect(sql).toContain('sum(_sample_interval * double1)')
    expect(sql).not.toContain('T00:00:00.000Z')
  })

  it('refuses a window boundary that is not a date', () => {
    expect(() => buildCopyQuery('yesterday', '2026-09-22T00:00:00.000Z')).toThrow(/not a date/)
  })

  it('splits run copies from install copies and ranks the Skills', () => {
    expect(summarizeCopies([
      { mode: 'run', kind: 'skill', slug: 'antfu/vite', copies: '12' },
      { mode: 'install', kind: 'repo', slug: 'obra/superpowers', copies: 30 },
      { mode: 'run', kind: 'skill', slug: 'harlan-zw/seo', copies: 3 },
    ])).toMatchObject({
      total: 45,
      run: 15,
      install: 30,
      top: [
        { slug: 'obra/superpowers', copies: 30 },
        { slug: 'antfu/vite', copies: 12 },
        { slug: 'harlan-zw/seo', copies: 3 },
      ],
    })
  })

  it('counts a grammar it does not know in the total only', () => {
    expect(summarizeCopies([{ mode: 'once', kind: 'skill', slug: 'antfu/vite', copies: 4 }]))
      .toMatchObject({ total: 4, run: 0, install: 0 })
  })
})
