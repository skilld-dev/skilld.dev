import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { harnessStateDirectoryPath } from '@ai-sdk/harness'
import { createOpenCode } from '@ai-sdk/harness-opencode'
import { createSkillHarness } from 'skilld-harness'
import { createLocalSandbox } from 'skilld-harness/sandbox-local'

const startedAt = Date.now()
const signal = AbortSignal.timeout(14 * 60 * 1000)

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
  const harness = createSkillHarness({
    harness: createOpenCode({
      provider: process.env.PROVIDER,
      openCodeConfig: {
        model: `${process.env.PROVIDER}/${process.env.MODEL}`,
        enabled_providers: [process.env.PROVIDER],
        autoupdate: false,
        share: 'disabled',
      },
    }),
    sandbox,
  })
  const generation = await harness.run({ _tag: 'PackageSkill', source: { _tag: 'NpmPackage', spec: input.spec }, destination }, { signal })
  if (generation._tag === 'Err') {
    return { _tag: 'Err', code: 'GENERATION_FAILED', detail: JSON.stringify(generation.error), generation: generation.report }
  }
  const review = await harness.run({ _tag: 'ReviewSkill', skillDir: generation.value.outputDir }, { signal })
  if (review._tag === 'Err') {
    return { _tag: 'Err', code: 'REVIEW_FAILED', detail: JSON.stringify(review.error), generation: generation.report, reviewReport: review.report }
  }
  if (review.value.findings.some(finding => finding.level === 'error')) {
    return { _tag: 'Err', code: 'REVIEW_REJECTED', detail: JSON.stringify(review.value), generation: generation.report, reviewReport: review.report }
  }
  const files = await Promise.all(generation.value.files.map(async file => ({
    path: file.path,
    content: await readFile(join(generation.value.outputDir, file.path), 'utf8'),
  })))
  return {
    _tag: 'Ok',
    files,
    generation: generation.report,
    reviewReport: review.report,
    review: review.value,
    sourceAttempts: generation.value.sourceAttempts,
  }
}

async function main() {
  const result = await execute().catch(cause => ({
    _tag: 'Err',
    code: 'RUNNER_FAILED',
    detail: cause instanceof Error ? cause.message : String(cause),
  }))
  await writeFile('/job/result.partial', JSON.stringify({ ...result, elapsedMs: Date.now() - startedAt }))
  await rename('/job/result.partial', '/job/result.json')
}

main().catch((cause) => {
  console.error(cause)
  process.exitCode = 1
})
