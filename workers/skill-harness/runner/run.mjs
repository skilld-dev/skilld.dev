import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { harnessStateDirectoryPath } from '@ai-sdk/harness'
import { createOpenCode } from '@ai-sdk/harness-opencode'
import { createSkillHarness } from 'skilld-harness'
import { createLocalSandbox } from 'skilld-harness/sandbox-local'
import { createSourceEvidence } from './evidence.ts'
import { runGeneration } from './orchestrate.ts'
import { createRunTrace } from './trace.ts'

const startedAt = Date.now()
// One minute under JOB_TIMEOUT_MS, so the runner writes its result before the Worker gives up.
const signal = AbortSignal.timeout(44 * 60 * 1000)
const trace = createRunTrace()

async function execute() {
  const input = JSON.parse(await readFile('/job/input.json', 'utf8'))
  const destination = { rootDir: '/job/skills', name: input.name }
  for (const file of input.currentSkill) {
    const path = join(destination.rootDir, input.name, file.path)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, file.content)
  }
  const provider = createLocalSandbox({ env: { OPENCODE_DISABLE_MODELS_FETCH: 'true' } })
  const sandbox = {
    ...provider,
    async createSession(options) {
      const session = await provider.createSession(options)
      const home = join(session.defaultWorkingDirectory, '.home')
      const bootstrap = join(harnessStateDirectoryPath({ sandboxHomeDir: home }), '.harness-bootstrap/opencode')
      await mkdir(bootstrap, { recursive: true })
      // Each run owns its copy. The image holds a complete, pinned bootstrap.
      await cp('/opt/bootstrap', bootstrap, { recursive: true })
      return session
    },
  }
  const sourceEvidence = '/job/package-source'
  const evidencePath = '/job/package-evidence.md'
  const contextPath = '/job/task-context.md'
  async function taskHarness(stage, findings = []) {
    await writeFile(contextPath, [
      '# Package evidence for this task',
      `The original Skill name is ${input.name}. Its directory is ${join(destination.rootDir, input.name)}.`,
      `The exact package is ${input.spec}. Prepared package source is available at ${sourceEvidence}.`,
      'The review source copy retains the original Skill directory name.',
      'Read the package source before reporting errors about API names, imports, or endpoint paths.',
      `First read ${evidencePath}. It bundles package metadata, public types, and implementation from the exact package.`,
      'Use that bundle to check claims together. Open individual source files only when the bundle omits required evidence.',
      'Do not infer endpoint punctuation or auto-import behavior from other examples.',
      'The network gateway allows npm registry and GitHub codeload only. Other destinations are unavailable.',
      'Do not retry a denied destination. Use prepared source and installed package types as evidence.',
      'If an example cannot run here, record it as untested. Never claim it passed.',
      'This task updates an existing Skill for a new release. Test only the lines the release changed; the earlier version\'s tests cover the rest.',
      'Batch related source reads into one tool call. Read each source file once unless evidence requires another read.',
      'Use one final command to check frontmatter, paths, and examples. Do not repeat counts, greps, or confirmation reads.',
      'After writing and checking the output, finish immediately. A separate independent review follows generation.',
      stage === 'generation'
        ? 'Copy the current Skill to the output directory first, so a deadline still leaves a candidate. Aim to finish within 25 model turns. Reserve the remaining run budget for independent review and any repair.'
        : 'Review source claims in batches. Aim to finish within 20 model turns. Return concrete findings when checks finish.',
      ...(findings.length ? ['Correct these review findings against the exact package source. Preserve other supported guidance.', JSON.stringify(findings)] : []),
    ].join('\n\n'))
    return createSkillHarness({
      harness: createOpenCode({
        provider: process.env.PROVIDER,
        openCodeConfig: {
          model: `${process.env.PROVIDER}/${process.env.MODEL}`,
          enabled_providers: [process.env.PROVIDER],
          autoupdate: false,
          share: 'disabled',
          instructions: [contextPath, evidencePath],
        },
      }),
      sandbox,
      sandboxConfig: {
        async onSession({ sessionWorkDir }) {
          if (stage === 'generation') {
            await rm(sourceEvidence, { recursive: true, force: true })
            await cp(join(sessionWorkDir, 'input/source'), sourceEvidence, { recursive: true })
            await writeFile(evidencePath, await createSourceEvidence(sourceEvidence))
          }
        },
      },
    })
  }
  return runGeneration({
    generate: async (findings) => {
      const harness = await taskHarness('generation', findings)
      return harness.run({ _tag: 'PackageSkill', source: { _tag: 'NpmPackage', spec: input.spec }, destination }, { signal, onEvent: event => trace.record(findings.length ? 'repair' : 'generation', event) })
    },
    review: async (candidate) => {
      const harness = await taskHarness('review')
      return harness.run({ _tag: 'ReviewSkill', skillDir: candidate.outputDir }, { signal, onEvent: event => trace.record('review', event) })
    },
    readFiles: candidate => Promise.all(candidate.files.map(async file => ({
      path: file.path,
      content: await readFile(join(candidate.outputDir, file.path), 'utf8'),
    }))),
    baseline: input.currentSkill,
  })
}

async function main() {
  const result = await execute().catch(cause => ({
    _tag: 'Err',
    code: 'RUNNER_FAILED',
    detail: cause instanceof Error ? cause.message : String(cause),
  }))
  await writeFile('/job/result.partial', JSON.stringify({ ...result, trace: trace.snapshot(), elapsedMs: Date.now() - startedAt }))
  await rename('/job/result.partial', '/job/result.json')
}

main().catch((cause) => {
  console.error(cause)
  process.exitCode = 1
})
