/**
 * Fails while an npm tag for skilld cannot speak the commands the site prints.
 *
 * Merging to main deploys straight to production, so this runs on the main push
 * and its failure stops the deploy. Pull requests skip it, because a site change
 * cannot fix a missing CLI command. Stable commands are checked against
 * `latest`; v3 Skill commands are checked against `beta`.
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
const V3_MAJOR = 3

interface ChannelRequirement {
  tag: 'latest' | 'beta'
  minimumMajor: number
  commands: string[]
}

interface ChannelCheck {
  tag: ChannelRequirement['tag']
  version: string
  required: string[]
  published: string[] | null
  problems: string[]
}

function subcommand(command: string): string {
  return command.split(/\s+/)[2]!
}

function uniqueSubcommands(commands: string[]): string[] {
  return [...new Set(commands.map(subcommand))].sort()
}

function channelRequirements(): ChannelRequirement[] {
  return [
    {
      tag: 'latest',
      minimumMajor: 2,
      commands: uniqueSubcommands([
        gitInstallCmd('owner', 'repo', 'skill'),
        curatorInstallCmd('login'),
        collectionInstallCmd('login', 'slug'),
      ]),
    },
    {
      tag: 'beta',
      minimumMajor: V3_MAJOR,
      commands: uniqueSubcommands([
        skillRunCmd('owner', 'repo', 'skill'),
        skillInstallCmd('owner', 'repo', 'skill'),
      ]),
    },
  ]
}

async function publishedVersion(tag: ChannelRequirement['tag']): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${PACKAGE}/${tag}`)
  if (!response.ok)
    throw new Error(`The npm registry answered HTTP ${response.status} for ${PACKAGE}@${tag}.`)

  const { version } = await response.json() as { version?: string }
  if (!version)
    throw new Error(`The npm registry returned no version for ${PACKAGE}@${tag}.`)

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
 * Reads v2's pipe-separated usage line or v3's Clap command list.
 *
 * Returns null when that line is absent, so an unreadable help text fails the
 * check instead of passing it.
 */
function publishedSubcommands(help: string): string[] | null {
  const plain = help.replace(ANSI_COLOUR, '')
  const usage = plain.match(/skilld \[OPTIONS\] ([\w|-]+)/)
  if (usage)
    return usage[1]!.split('|')

  const block = plain.match(/(?:^|\n)Commands:\s*\n([\s\S]*?)(?:\n\s*\n|$)/i)?.[1]
  if (!block)
    return null

  const commands = [...block.matchAll(/^\s{2}([a-z][\w-]*)\s{2,}/gm)]
    .map(match => match[1]!)
  return commands.length > 0 ? commands : null
}

async function checkChannel(requirement: ChannelRequirement): Promise<ChannelCheck> {
  const version = await publishedVersion(requirement.tag)
  const published = publishedSubcommands(await helpText(version))
  const major = Number(version.split('.')[0])
  const problems: string[] = []

  if (major < requirement.minimumMajor)
    problems.push(`requires major ${requirement.minimumMajor} or newer`)
  if (!published) {
    problems.push('could not read its command list')
  }
  else {
    const missing = requirement.commands.filter(command => !published.includes(command))
    if (missing.length > 0)
      problems.push(`does not support ${missing.join(', ')}`)
  }

  return {
    tag: requirement.tag,
    version,
    required: requirement.commands,
    published,
    problems,
  }
}

const checks = await Promise.all(channelRequirements().map(checkChannel))
const failed = checks.filter(check => check.problems.length > 0)

if (failed.length === 0) {
  console.log(JSON.stringify({
    _tag: 'clean',
    check: 'published-cli-grammar',
    channels: checks.map(({ tag, version, required }) => ({ tag, version, required })),
  }, null, 2))
  process.exit(0)
}

for (const check of failed) {
  console.error(`${PACKAGE}@${check.tag} is ${check.version}: ${check.problems.join('; ')}.`)
  if (check.published)
    console.error(`It supports: ${check.published.join(', ')}.`)
}
console.error('')
console.error('The site prints a command that the published CLI cannot run.')
console.error('Publish the missing CLI grammar under the npm tag named above.')
console.error('To deploy anyway, run the "Deploy to Cloudflare" workflow by hand.')
process.exit(1)
