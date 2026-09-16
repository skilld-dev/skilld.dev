import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

/**
 * The deploy gate (`pnpm cli:grammar`) runs on a fresh checkout whose install
 * skips scripts, so no `.nuxt/tsconfig.json` exists and the generated
 * `#shared/*` alias never maps. A module the gate imports must therefore
 * resolve without it.
 *
 * The app reads the same builders through that alias, because a relative
 * import from `app/` is what the Nitro build cannot externalize. Both sides
 * meet at `shared/skill-commands.ts`, which imports nothing at all.
 */
const run = promisify(execFile)

const ROOT = process.cwd()
const TSX_CLI = join(ROOT, 'node_modules/tsx/dist/cli.mjs')

async function bareCheckout(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'install-cmd-bare-'))
  await mkdir(join(dir, 'shared'), { recursive: true })
  await copyFile(join(ROOT, 'tsconfig.json'), join(dir, 'tsconfig.json'))
  await copyFile(join(ROOT, 'shared/skill-commands.ts'), join(dir, 'shared/skill-commands.ts'))
  await writeFile(
    join(dir, 'entry.ts'),
    'import { gitInstallCmd } from "./shared/skill-commands"\nconsole.log(gitInstallCmd("nuxt", "nuxt"))\n',
  )
  return dir
}

it('prints the install command from a checkout with no .nuxt', { timeout: 15_000 }, async () => {
  const dir = await bareCheckout()
  try {
    let stdout = ''
    try {
      ;({ stdout } = await run(process.execPath, [TSX_CLI, 'entry.ts'], { cwd: dir }))
    }
    catch (error) {
      // The child's multi-line stderr cannot be source-mapped by vitest's
      // stack parser, so re-raise with a single-line reason.
      const message = error instanceof Error ? error.message : String(error)
      const reason = message.split('\n').find(line => line.includes('Cannot find module')) ?? message.split('\n')[0]
      throw new Error(`gate entry failed in a bare checkout: ${reason}`)
    }
    expect(stdout.trim()).toBe('npx skilld@beta add gh:nuxt/nuxt')
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})
