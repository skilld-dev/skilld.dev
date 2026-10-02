import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { harnessStateDirectoryPath } from '@ai-sdk/harness'
import { createOpenCode } from '@ai-sdk/harness-opencode'
import { createSkillHarness } from 'skilld-harness'
import { createLocalSandbox } from 'skilld-harness/sandbox-local'
import { runGeneration } from './orchestrate.ts'
import { createRunTrace } from './trace.ts'

const startedAt = Date.now()
const signal = AbortSignal.timeout(14 * 60 * 1000)
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
  const contextPath = '/job/task-context.md'
  async function taskHarness(stage, findings = []) {
    await writeFile(contextPath, [
      '# Package evidence for this task',
      `The original Skill name is ${input.name}. Its directory is ${join(destination.rootDir, input.name)}.`,
      `The exact package is ${input.spec}. Prepared package source is available at ${sourceEvidence}.`,
      'The review source copy retains the original Skill directory name.',
      'Read the package source before reporting errors about API names, imports, or endpoint paths.',
      'Do not infer endpoint punctuation or auto-import behavior from other examples.',
      'The network gateway allows npm registry and GitHub codeload only. Other destinations are unavailable.',
      'Do not retry a denied destination. Use prepared source and installed package types as evidence.',
      'If an example cannot run here, record it as untested. Never claim it passed.',
      'This task updates an existing Skill. Keep unsupported claims out and avoid unrelated framework tutorials.',
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
          instructions: [contextPath],
        },
      }),
      sandbox,
      sandboxConfig: {
        async onSession({ sessionWorkDir }) {
          if (stage === 'generation') {
            await rm(sourceEvidence, { recursive: true, force: true })
            await cp(join(sessionWorkDir, 'input/source'), sourceEvidence, { recursive: true })
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
