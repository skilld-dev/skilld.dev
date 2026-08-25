/**
 * Fails while npm `latest` for skilld cannot speak the commands the site prints.
 *
 * Merging to main deploys straight to production, so this runs on the main push
 * and its failure stops the deploy. Pull requests skip it, because a site change
 * cannot fix a missing CLI command. The check clears itself the moment a 3.x
 * carrying `run` is promoted to `latest`; nothing has to be removed.
 *
 * The required list comes from the command builders the site renders, so a new
 * grammar is covered without editing this file.
 */

import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import {
  collectionInstallCmd,
  curatorInstallCmd,
  gitInstallCmd,
  skillInstallCmd,
  skillRunCmd,
} from '../app/utils/install-cmd'

const run = promisify(execFile)

const PACKAGE = 'skilld'
/** Built from a char code so the source carries no control character. */
const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g')
/** `skilld install <ref>` means "restore the lockfile" before 3.0 and "keep this Skill" after it. */
const REQUIRED_MAJOR = 3

function printedSubcommands(): string[] {
  const commands = [
    skillRunCmd('owner', 'repo', 'skill'),
    skillInstallCmd('owner', 'repo', 'skill'),
    gitInstallCmd('owner', 'repo', 'skill'),
    curatorInstallCmd('login'),
    collectionInstallCmd('login', 'slug'),
  ]
  return [...new Set(commands.map(command => command.split(/\s+/)[2]!))].sort()
}

async function publishedVersion(): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${PACKAGE}/latest`)
  if (!response.ok)
    throw new Error(`The npm registry answered HTTP ${response.status} for ${PACKAGE}@latest.`)

  const { version } = await response.json() as { version?: string }
  if (!version)
    throw new Error(`The npm registry returned no version for ${PACKAGE}@latest.`)

  return version
}

async function helpText(version: string): Promise<string> {
  const result = await run('npx', ['--yes', `${PACKAGE}@${version}`, '--help'], {
    timeout: 180_000,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  }).catch((error: { stdout?: string, stderr?: string }) => error)

  // A CLI may print its help to either stream and exit non-zero while doing it.
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

/**
 * Reads the command list out of the usage line, which every published version
 * prints as `skilld [OPTIONS] add|update|...`.
 *
 * Returns null when that line is absent, so an unreadable help text fails the
 * check instead of passing it.
 */
function publishedSubcommands(help: string): string[] | null {
  const plain = help.replace(ANSI_COLOUR, '')
  const usage = plain.match(/skilld \[OPTIONS\] ([\w|-]+)/)
  return usage ? usage[1]!.split('|') : null
}

const required = printedSubcommands()
const version = await publishedVersion()
const major = Number(version.split('.')[0])
const published = publishedSubcommands(await helpText(version))

if (!published) {
  console.error(`Could not read the command list from \`npx ${PACKAGE}@${version} --help\`.`)
  console.error('Check the CLI help output, then update scripts/check-published-cli-grammar.ts.')
  process.exit(1)
}

const missing = required.filter(command => !published.includes(command))

if (major >= REQUIRED_MAJOR && missing.length === 0) {
  console.log(JSON.stringify({
    _tag: 'clean',
    check: 'published-cli-grammar',
    version,
    required,
  }, null, 2))
  process.exit(0)
}

console.error(`npm \`latest\` for ${PACKAGE} is ${version}.`)
if (major < REQUIRED_MAJOR)
  console.error(`The site prints the v${REQUIRED_MAJOR} grammar, so \`latest\` must be ${REQUIRED_MAJOR}.x or newer.`)
if (missing.length > 0)
  console.error(`It does not support: ${missing.join(', ')}. It supports: ${published.join(', ')}.`)
console.error('')
console.error('The site prints a command that the published CLI cannot run.')
console.error('Merge the CLI pull requests, cut a release, and promote it to npm `latest`.')
console.error('To deploy anyway, run the "Deploy to Cloudflare" workflow by hand.')
process.exit(1)
