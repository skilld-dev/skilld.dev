// Decides whether main's deploy ships the skill-harness Worker, and writes
// `deploy=true|false` to GITHUB_OUTPUT. Needs full git history and Cloudflare credentials.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { harnessDeployDecision, liveVersionId, versionCommit } from './lib/harness-deploy'

const workerDirectory = resolve(process.cwd(), 'workers/skill-harness')
const wrangler = resolve(workerDirectory, 'node_modules/.bin/wrangler')

function wranglerJson(args: string[]): unknown {
  return JSON.parse(execFileSync(wrangler, [...args, '--config', 'wrangler.jsonc', '--json'], { cwd: workerDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
}

/** `git diff --name-only`, or undefined when the commit is not in this history. */
function changedSince(commit: string): string[] | undefined {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' })
  }
  catch {
    // A missing commit is an expected answer: the live version came from a branch.
    return undefined
  }
  return execFileSync('git', ['diff', '--name-only', commit, 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean)
}

const versionId = liveVersionId(wranglerJson(['deployments', 'list']))
const liveCommit = versionId === undefined ? undefined : versionCommit(wranglerJson(['versions', 'view', versionId]))
const decision = harnessDeployDecision({ liveCommit, changedPaths: liveCommit === undefined ? [] : changedSince(liveCommit) })

const message = decision._tag === 'Deploy' ? `Deploying the Harness Worker: ${decision.reason}` : `The Harness Worker matches ${liveCommit}, so it keeps its current version.`
console.log(message)
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${decision._tag === 'Deploy'}\n`)
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
