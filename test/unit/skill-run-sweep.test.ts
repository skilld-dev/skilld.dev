// @vitest-environment node
import type { ArtifactBuildDependencies } from '../../layers/artifact-delivery/server/utils/build'
import type { PublicGithubSourceClient, SourceRejection } from '../../layers/artifact-delivery/server/utils/github-source'
import type { RunnableSkill, SkillRunSweepDependencies } from '../../layers/artifact-delivery/server/utils/run-sweep'
import { describe, expect, it, vi } from 'vitest'
import { processArtifactBuild } from '../../layers/artifact-delivery/server/utils/build'
import { requestResolution } from '../../layers/artifact-delivery/server/utils/request-resolution'
import { runSkillRunSweep } from '../../layers/artifact-delivery/server/utils/run-sweep'
import { createSqliteD1 } from './helpers/d1-sqlite'

const MIGRATIONS = [
  'migrations/0017_users.sql',
  'migrations/0110_artifact_delivery.sql',
  'migrations/0111_github_app_delivery.sql',
  'migrations/0112_private_artifact_keys.sql',
  'migrations/0122_artifact_resolution_retry_after.sql',
  'migrations/0142_artifact_run_checks.sql',
]
const NOW = 1_791_000_000
const archify: RunnableSkill = { owner: 'tt-a1i', repository: 'archify', name: 'archify' }
const busy: RunnableSkill = { owner: 'acme', repository: 'busy', name: 'busy' }

describe('skilld run sweep', () => {
  it('reports a Skill that `skilld run` cannot deliver, with the tag the CLI prints', async () => {
    const harness = createHarness([archify, busy])

    const first = await runSkillRunSweep(harness.dependencies)
    expect(first).toMatchObject({ started: 2, settled: 0, newFailures: [] })
    expect(harness.enqueue).toHaveBeenCalledTimes(2)
    await harness.buildEach({
      archify: { _tag: 'rejected', code: 'INVALID_SOURCE', summary: 'The Skill folder `archify` packs to 10.31 MiB. The limit is 10 MiB.', findings: [] },
      busy: { _tag: 'rejected', code: 'RATE_LIMITED', summary: 'GitHub refused the read: its rate limit is spent.', findings: [] },
    })

    const second = await runSkillRunSweep(harness.dependencies)

    expect(second.settled).toBe(2)
    expect(second.newFailures).toEqual([{
      ...archify,
      tag: 'CHECK_BLOCKED:source-policy',
      detail: 'The Skill folder `archify` packs to 10.31 MiB. The limit is 10 MiB.',
    }])
    // A spent quota is a fact about the hour, not the Skill: recorded, never alarmed.
    expect(second.transientFailures).toEqual([{ ...busy, tag: 'RATE_LIMITED', detail: null }])
    harness.close()
  })

  it('alarms once per failure, not on every check that sees it again', async () => {
    const harness = createHarness([archify])
    const blocked: SourceRejection = { _tag: 'rejected', code: 'INVALID_SOURCE', summary: 'Too large.', findings: [] }

    await runSkillRunSweep(harness.dependencies)
    await harness.buildEach({ archify: blocked })
    expect((await runSkillRunSweep(harness.dependencies)).newFailures).toHaveLength(1)
    await harness.buildEach({ archify: blocked })
    const third = await runSkillRunSweep(harness.dependencies)

    expect(third.settled).toBe(1)
    expect(third.newFailures).toEqual([])
    expect(third.failing).toBe(1)
    harness.close()
  })

  it('does not alarm again when a spent quota interrupts a known failure', async () => {
    const harness = createHarness([archify])
    const blocked: SourceRejection = { _tag: 'rejected', code: 'INVALID_SOURCE', summary: 'Too large.', findings: [] }

    await runSkillRunSweep(harness.dependencies)
    await harness.buildEach({ archify: blocked })
    await runSkillRunSweep(harness.dependencies)
    await harness.buildEach({ archify: { _tag: 'rejected', code: 'RATE_LIMITED', summary: 'Spent.', findings: [] } })
    const interrupted = await runSkillRunSweep(harness.dependencies)
    await harness.buildEach({ archify: blocked })
    const resumed = await runSkillRunSweep(harness.dependencies)

    expect(interrupted.transientFailures).toHaveLength(1)
    expect(interrupted.failing).toBe(1)
    expect(resumed.newFailures).toEqual([])
    harness.close()
  })

  it('checks the Skill checked longest ago first', async () => {
    const harness = createHarness([archify, busy], 1)

    const first = await runSkillRunSweep(harness.dependencies)
    await harness.buildEach({ busy: { _tag: 'rejected', code: 'SOURCE_NOT_FOUND', summary: 'Gone.', findings: [] }, archify: { _tag: 'rejected', code: 'SOURCE_NOT_FOUND', summary: 'Gone.', findings: [] } })
    const second = await runSkillRunSweep(harness.dependencies)

    expect(first.started).toBe(1)
    expect(second.started).toBe(1)
    expect(harness.requested()).toEqual(['acme/busy/busy', 'tt-a1i/archify/archify'])
    harness.close()
  })
})

function createHarness(skills: RunnableSkill[], batchSize = 10) {
  const sqlite = createSqliteD1(MIGRATIONS)
  const enqueue = vi.fn(async (_resolutionId: string) => {})
  const requestedRefs: string[] = []
  let clock = NOW
  let keys = 0
  const dependencies: SkillRunSweepDependencies = {
    db: sqlite.db,
    listRunnableSkills: async () => skills,
    requestResolution: async (input) => {
      requestedRefs.push(`${input.source.owner}/${input.source.repository}/${input.source.selector.type === 'named-skill' ? input.source.selector.name : input.source.selector.path}`)
      return await requestResolution({
        db: sqlite.db,
        lookupAdmitted: async () => null,
        enqueue,
        now: () => clock,
      }, input)
    },
    newIdempotencyKey: () => `sweep-test-key-${String(++keys).padStart(4, '0')}`,
    now: () => clock,
    batchSize,
  }

  /** Run the queued builds, each rejected by GitHub as the test names. */
  async function buildEach(rejections: Partial<Record<string, SourceRejection>>) {
    const pending = sqlite.raw.prepare(
      `SELECT id, selector_value FROM artifact_resolutions WHERE state = 'requested'`,
    ).all() as Array<{ id: string, selector_value: string }>
    for (const row of pending) {
      const rejection = rejections[row.selector_value]
      if (!rejection)
        continue
      const resolvesThenRejects = rejection.code === 'INVALID_SOURCE'
      const github: PublicGithubSourceClient = {
        resolve: vi.fn(async () => resolvesThenRejects
          ? {
              _tag: 'resolved' as const,
              source: {
                provider: 'github' as const,
                repositoryId: 1,
                owner: 'tt-a1i',
                repository: 'archify',
                visibility: 'public' as const,
                commitSha: '0'.repeat(40),
                treeSha: '1'.repeat(40),
                skillPath: 'archify',
              },
            }
          : rejection),
        load: vi.fn(async () => rejection),
      }
      await processArtifactBuild({
        db: sqlite.db,
        github,
        now: () => clock,
        reportReuse: () => {},
      } as unknown as ArtifactBuildDependencies, row.id)
    }
    clock += 15 * 60
  }

  return {
    dependencies,
    enqueue,
    buildEach,
    requested: () => requestedRefs,
    close: () => sqlite.close(),
  }
}
