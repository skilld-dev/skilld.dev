import { describe, expect, it } from 'vitest'
import { harnessDeployDecision, liveVersionId, versionCommit } from '../../scripts/lib/harness-deploy'

describe('harness deploy decision', () => {
  it('deploys when a change since the live commit touches the Harness, even if HEAD^ did not', () => {
    // #550 changed the Harness, then #552 merged before its deploy ran. HEAD^ to HEAD shows only #552.
    expect(harnessDeployDecision({ liveCommit: 'aaa111', changedPaths: ['app/pages/index.vue', 'workers/skill-harness/src/gateway.ts'] }))
      .toEqual({ _tag: 'Deploy', reason: 'workers/skill-harness/src/gateway.ts changed since aaa111.' })
  })

  it('keeps the live version when nothing it builds from changed', () => {
    expect(harnessDeployDecision({ liveCommit: 'aaa111', changedPaths: ['app/pages/index.vue', 'docs/runbooks/skillgen.md'] }))
      .toEqual({ _tag: 'Keep' })
  })

  it('deploys when the live version names no commit', () => {
    expect(harnessDeployDecision({ liveCommit: undefined, changedPaths: [] }))
      .toEqual({ _tag: 'Deploy', reason: 'The live Harness version names no commit.' })
  })

  it('deploys when the live commit is not in this history, such as a branch deploy', () => {
    expect(harnessDeployDecision({ liveCommit: 'bbb222', changedPaths: undefined }))
      .toEqual({ _tag: 'Deploy', reason: 'Commit bbb222 is not in this history.' })
  })
})

describe('reading wrangler output', () => {
  it('reads the newest deployment\'s full-traffic version', () => {
    const deployments = [
      { created_on: '2026-10-07T04:27:21Z', versions: [{ version_id: 'old', percentage: 100 }] },
      { created_on: '2026-10-07T04:55:38Z', versions: [{ version_id: 'canary', percentage: 10 }, { version_id: 'new', percentage: 90 }] },
    ]
    expect(liveVersionId(deployments)).toBe('new')
  })

  it('reads the commit a version was tagged with', () => {
    expect(versionCommit({ annotations: { 'workers/tag': '8608395ee6ab', 'workers/triggered_by': 'upload' } })).toBe('8608395ee6ab')
    expect(versionCommit({ annotations: { 'workers/triggered_by': 'upload' } })).toBeUndefined()
  })

  it('rejects a tag that is not a commit', () => {
    expect(versionCommit({ annotations: { 'workers/tag': 'main; rm -rf /' } })).toBeUndefined()
  })
})
