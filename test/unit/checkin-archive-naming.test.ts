// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const run = promisify(execFile)
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const cli = resolve(repoRoot, 'node_modules/@harlan-zw/nuxt-checkin/dist/cli/index.mjs')
const skillPath = resolve(repoRoot, '.claude/skills/daily-checkin/SKILL.md')

async function saveArchive() {
  const root = await mkdtemp(join(tmpdir(), 'checkin-archive-'))
  const saveDir = join(root, 'docs', 'ops', 'checkins')
  const artifact = [
    `import { defineCheck, pass } from ${JSON.stringify(resolve(repoRoot, 'node_modules/@harlan-zw/nuxt-checkin/dist/runtime/external/index.js'))}`,
    'export default [defineCheck({ id: \'fixture.ok\', run: () => pass() })]',
    `export const options = { save: { dir: ${JSON.stringify(saveDir)}, stateFile: 'state.json', timestampKey: 'lastRunAt', baseline: 'daily' } }`,
    '',
  ].join('\n')
  const artifactPath = join(root, 'artifact.mjs')
  await writeFile(artifactPath, artifact)
  try {
    await run('node', [cli, '--save', '--artifact', artifactPath], { cwd: root })
    const files = (await readdir(saveDir)).filter(name => name !== 'state.json')
    expect(files).toHaveLength(1)
    const archive = JSON.parse(await readFile(join(saveDir, files[0]!), 'utf8'))
    expect(typeof archive.observedAt).toBe('string')
    return files[0]!
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}

function documentedPattern(documented: string) {
  const source = documented.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('<timestamp>', '\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z')
    .replaceAll('<uuid>', '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
  return new RegExp(`^${source}$`)
}

it('archives evidence under the file name documented in SKILL.md step 1', async () => {
  const archiveName = await saveArchive()
  expect(archiveName).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f-]{36}\.json$/)
  const stepOne = (await readFile(skillPath, 'utf8'))
    .split('\n')
    .find(line => line.trim().startsWith('1. Run `pnpm checkin --save`'))
  expect(stepOne, 'SKILL.md workflow step 1 is missing').toBeDefined()
  const documented = stepOne?.match(/`docs\/ops\/checkins\/([^`]+)`/)?.[1]
  expect(documented, 'SKILL.md step 1 must document the archive name pattern').toBeDefined()
  expect(archiveName).toMatch(documentedPattern(documented!))
})
