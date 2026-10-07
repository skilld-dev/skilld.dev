/**
 * Whether main's deploy must ship the skill-harness Worker. It compares the
 * commit the live version was built from, not HEAD^: when a later merge
 * cancels a run, HEAD^ to HEAD hides the change that run would have shipped.
 */

/** The paths the Harness Worker and its container image build from. */
export const HARNESS_PATHS = ['workers/skill-harness', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', '.github/workflows/deploy-cloudflare.yml'] as const

export type HarnessDeployDecision
  = | { readonly _tag: 'Deploy', readonly reason: string }
    | { readonly _tag: 'Keep' }

/**
 * `changedPaths` is `git diff --name-only LIVE HEAD`, or undefined when the
 * live commit is not in this history.
 */
export function harnessDeployDecision(input: { liveCommit: string | undefined, changedPaths: ReadonlyArray<string> | undefined }): HarnessDeployDecision {
  if (input.liveCommit === undefined)
    return { _tag: 'Deploy', reason: 'The live Harness version names no commit.' }
  if (input.changedPaths === undefined)
    return { _tag: 'Deploy', reason: `Commit ${input.liveCommit} is not in this history.` }
  const changed = input.changedPaths.find(path => HARNESS_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`)))
  return changed === undefined ? { _tag: 'Keep' } : { _tag: 'Deploy', reason: `${changed} changed since ${input.liveCommit}.` }
}

interface Deployment { readonly versions?: ReadonlyArray<{ readonly version_id?: string, readonly percentage?: number }> }

/** The version carrying most traffic in the newest deployment of `wrangler deployments list --json`. */
export function liveVersionId(deployments: unknown): string | undefined {
  if (!Array.isArray(deployments))
    return undefined
  const newest = deployments.at(-1) as Deployment | undefined
  return [...newest?.versions ?? []].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0]?.version_id
}

const COMMIT = /^[0-9a-f]{7,40}$/

/** The commit a version was deployed from, read from its `--tag`. */
export function versionCommit(version: unknown): string | undefined {
  const tag = (version as { annotations?: Record<string, unknown> } | undefined)?.annotations?.['workers/tag']
  return typeof tag === 'string' && COMMIT.test(tag) ? tag : undefined
}
