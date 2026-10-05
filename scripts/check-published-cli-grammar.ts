/**
 * Fails while npm `latest` for skilld cannot speak the commands the site prints.
 *
 * Merging to main deploys straight to production, so this runs on the main push
 * and its failure stops the deploy. Pull requests skip it, because a site change
 * cannot fix a missing CLI command.
 *
 * The required list comes from the command builders the site renders plus the
 * inline-code commands the copy sources teach, so a new grammar is covered
 * without editing this file. The release also has to accept
 * every `--agent` value an `/agents/<id>` page prints.
 */

import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { compareCliVersions, publishedAgentPages } from '../layers/marketing/app/utils/agent-pages'
import {
  accountCmds,
  collectionInstallCmd,
  curatorInstallCmd,
  gitInstallCmd,
  skilldSelfInstallCmd,
  skillInstallCmd,
  skillOutdatedCmd,
  skillRemoveCmd,
  skillRunCmd,
  skillSearchCmd,
  skillUpdateCmd,
} from '../shared/skill-commands'

const run = promisify(execFile)

const PACKAGE = 'skilld'
/** Built from a char code so the source carries no control character. */
const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g')
/**
 * The oldest CLI that parses every ref the site prints. 3.1.0 added bare
 * `owner/repo/skill` and `owner/repo` refs; older releases need `skilld:` or `gh:`.
 */
const MINIMUM_VERSION = '3.1.0'
/** The only spelling the site may print. A pinned tag such as `skilld@beta` bypasses `latest`. */
const CLI_PREFIX = `npx ${PACKAGE} `
/** Copy that teaches the printed commands. A stale spelling here reintroduces the misprint. */
const BRAND_GUIDELINES_URL = new URL('../COPY.md', import.meta.url)

export interface CliRequirement {
  minimumVersion: string
  commands: string[]
  /** `--agent` values the site prints. */
  agents: string[]
  /** Printed commands that do not start with `npx skilld`. */
  misprinted: string[]
}

export interface CliCheck {
  version: string
  required: string[]
  requiredAgents: string[]
  published: string[] | null
  publishedAgents: string[] | null
  problems: string[]
  /** True when pnpm itself refused to fetch the release, so the help text was never the CLI's. */
  fetchRefused: boolean
}

export interface PublishedCliInvocation {
  file: string
  args: string[]
}

export interface PublishedCliGrammarDependencies {
  readVersion: () => Promise<string>
  readHelp: (version: string, subcommand?: string) => Promise<string>
}

export type PublishedCliGrammarResult
  = | { _tag: 'clean', check: CliCheck }
    | { _tag: 'blocked', check: CliCheck }

function subcommand(command: string): string {
  return command.split(/\s+/)[2]!
}

/**
 * Matches pnpm's refusal to resolve a release published inside its
 * `minimumReleaseAge` window, which dlx reports as `ERR_PNPM_NO_MATURE_MATCHING_VERSION`.
 */
const RELEASE_AGE_REFUSAL = /ERR_PNPM_NO_MATURE_MATCHING_VERSION|within the minimumReleaseAge cutoff/

const RELEASE_AGE_PROBLEM = 'pnpm refused to fetch it: the release is inside the minimumReleaseAge window'

function uniqueSubcommands(commands: string[]): string[] {
  return [...new Set(commands.map(subcommand))].sort()
}

/** Builds the requirement from the commands the site prints. */
export function cliRequirementFor(commands: string[]): CliRequirement {
  return {
    minimumVersion: MINIMUM_VERSION,
    commands: uniqueSubcommands(commands),
    agents: publishedAgentPages().map(page => page.id),
    misprinted: commands.filter(command => !command.startsWith(CLI_PREFIX)),
  }
}

/** The inline-code `npx skilld …` commands a copy source teaches. */
export function copyCommands(source: string): string[] {
  return [...source.matchAll(/`(npx skilld[^`]*)`/g)].map(match => match[1]!.trim())
}

/** Every command the site renders, plus the ones the copy sources teach. */
export function cliRequirement(): CliRequirement {
  return cliRequirementFor([
    gitInstallCmd('owner', 'repo'),
    curatorInstallCmd('login'),
    collectionInstallCmd('login', 'slug'),
    skillRunCmd('owner', 'repo', 'skill'),
    skillInstallCmd('owner', 'repo', 'skill'),
    skilldSelfInstallCmd(),
    skillSearchCmd('query'),
    skillOutdatedCmd(),
    skillUpdateCmd('skill'),
    skillRemoveCmd('skill'),
    ...accountCmds,
    ...copyCommands(readFileSync(BRAND_GUIDELINES_URL, 'utf8')),
  ])
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

/**
 * Runs a published package through `pnpm dlx` rather than `npx`.
 *
 * `npx` downloads into a per-container npm cache, so every ephemeral CI
 * container pays the full download over the shared uplink and a slow one
 * overruns the 180s kill and reads as a grammar failure. `pnpm dlx` resolves
 * through the shared pnpm store the setup action mounts, so only the first
 * container ever downloads a version.
 */
export function publishedCliInvocation(version: string, subcommand?: string): PublishedCliInvocation {
  return {
    file: 'pnpm',
    args: ['--reporter=silent', 'dlx', `${PACKAGE}@${version}`, ...(subcommand ? [subcommand] : []), '--help'],
  }
}

async function helpText(version: string, subcommand?: string): Promise<string> {
  const command = publishedCliInvocation(version, subcommand)
  const result = await run(command.file, command.args, {
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

/**
 * Reads the `Values:` list under `--agent` in v3's `install --help`.
 *
 * Returns null when that list is absent, so an unreadable help text fails the
 * check instead of passing it.
 */
function publishedAgents(installHelp: string): string[] | null {
  const plain = installHelp.replace(ANSI_COLOUR, '')
  const option = plain.indexOf('--agent <AGENT>')
  if (option === -1)
    return null
  const start = plain.indexOf('Values:', option)
  if (start === -1)
    return null
  const end = plain.indexOf('.\n', start)
  if (end === -1)
    return null
  const values = plain.slice(start + 'Values:'.length, end).split(/[\s,]+/).filter(Boolean)
  return values.length > 0 ? values : null
}

async function checkCli(
  requirement: CliRequirement,
  dependencies: PublishedCliGrammarDependencies,
): Promise<CliCheck> {
  const version = await dependencies.readVersion()
  const topHelp = await dependencies.readHelp(version)
  const installHelp = requirement.agents.length > 0
    ? await dependencies.readHelp(version, 'install')
    : null
  const published = publishedSubcommands(topHelp)
  const agents = installHelp === null ? [] : publishedAgents(installHelp)
  const problems: string[] = []
  const fetchRefused = RELEASE_AGE_REFUSAL.test(topHelp)
    || (installHelp !== null && RELEASE_AGE_REFUSAL.test(installHelp))

  if (compareCliVersions(version, requirement.minimumVersion) < 0)
    problems.push(`requires ${requirement.minimumVersion} or newer`)
  if (!published) {
    if (!fetchRefused)
      problems.push('could not read its command list')
  }
  else {
    const missing = requirement.commands.filter(command => !published.includes(command))
    if (missing.length > 0)
      problems.push(`does not support ${missing.join(', ')}`)
  }
  if (!agents) {
    if (!fetchRefused)
      problems.push('could not read its --agent values')
  }
  else {
    const missing = requirement.agents.filter(agent => !agents.includes(agent))
    if (missing.length > 0)
      problems.push(`rejects --agent ${missing.join(', ')}`)
  }
  if (requirement.misprinted.length > 0)
    problems.push(`is bypassed by ${requirement.misprinted.join(', ')}`)
  if (fetchRefused)
    problems.unshift(RELEASE_AGE_PROBLEM)

  return {
    version,
    required: requirement.commands,
    requiredAgents: requirement.agents,
    published,
    publishedAgents: agents,
    problems,
    fetchRefused,
  }
}

export async function runPublishedCliGrammar(
  dependencies: PublishedCliGrammarDependencies,
  requirement: CliRequirement = cliRequirement(),
): Promise<PublishedCliGrammarResult> {
  const check = await checkCli(requirement, dependencies)
  return check.problems.length > 0
    ? { _tag: 'blocked', check }
    : { _tag: 'clean', check }
}

async function main(): Promise<void> {
  const result = await runPublishedCliGrammar({
    readVersion: publishedVersion,
    readHelp: helpText,
  })
  const { check } = result

  if (result._tag === 'clean') {
    console.log(JSON.stringify({
      _tag: 'clean',
      check: 'published-cli-grammar',
      version: check.version,
      required: check.required,
      requiredAgents: check.requiredAgents,
    }, null, 2))
    return
  }

  console.error(`${PACKAGE}@latest is ${check.version}: ${check.problems.join('; ')}.`)
  if (check.published)
    console.error(`It supports: ${check.published.join(', ')}.`)
  if (check.publishedAgents && check.publishedAgents.length > 0)
    console.error(`Its --agent values: ${check.publishedAgents.join(', ')}.`)
  console.error('')
  if (check.fetchRefused) {
    console.error('pnpm blocks releases published inside its minimumReleaseAge window (1 day by default).')
    console.error('If this follows a CLI publish, exempt the package in pnpm-workspace.yaml (minimumReleaseAgeExclude) or rerun after the window passes.')
  }
  else {
    console.error('The site prints a command that the published CLI cannot run.')
    console.error('Print every command as `npx skilld`, and publish the missing CLI grammar to npm `latest`.')
    console.error('For a rejected --agent value, hold its /agents page: raise cliSince in agent-pages.ts.')
  }
  console.error('To deploy anyway, run the "Deploy to Cloudflare" workflow by hand.')
  process.exitCode = 1
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
