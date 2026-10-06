/**
 * Writes `/docs/cli` from the help text of a published skilld CLI.
 *
 * The page was written by hand from 3.0.0-beta.3 and fell behind every
 * release after it. Generating it from `--help` keeps one source: the CLI
 * documents itself, and the page prints exactly what that release answers.
 *
 *   pnpm cli:docs              # npm `latest`
 *   pnpm cli:docs 3.3.0        # one exact release
 *
 * Run it after each CLI release, then review the diff.
 */
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import { cliGlobalInstallCmd, cliNativeInstallCmd, cliWindowsInstallCmd } from '../shared/skill-commands'

const run = promisify(execFile)
const PACKAGE = 'skilld'
const TARGET = new URL('../layers/marketing/content/pages/docs/cli.md', import.meta.url)

interface CommandHelp {
  path: string[]
  summary: string
  help: string
}

async function latestVersion(): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${PACKAGE}/latest`)
  if (!response.ok)
    throw new Error(`The npm registry answered HTTP ${response.status} for ${PACKAGE}@latest.`)
  const { version } = await response.json() as { version?: string }
  if (!version)
    throw new Error(`The npm registry returned no version for ${PACKAGE}@latest.`)
  return version
}

async function helpFor(version: string, path: readonly string[]): Promise<string> {
  const { stdout } = await run('pnpm', ['--reporter=silent', 'dlx', `${PACKAGE}@${version}`, ...path, '--help'], {
    env: { ...process.env, NO_COLOR: '1', SKILLD_NO_UPGRADE: '1', SKILLD_NO_WEEKLY: '1' },
    maxBuffer: 4 * 1024 * 1024,
  })
  return stdout.split('\n').map(line => line.trimEnd()).join('\n').trimEnd()
}

/** The `Commands:` block of one help text, without clap's own `help` entry. */
export function listedCommands(help: string): Array<{ name: string, summary: string }> {
  const block = help.split(/\n(?=\S)/).find(section => section.startsWith('Commands:'))
  if (!block)
    return []
  return block.split('\n').slice(1).map(line => line.trimEnd().match(/^ {2}(\S+)(?: +(\S.*))?$/)).filter((match): match is RegExpMatchArray => match !== null).map(match => ({ name: match[1]!, summary: match[2]?.trim() ?? '' })).filter(command => command.name !== 'help')
}

async function collect(version: string, path: string[], summary: string): Promise<CommandHelp[]> {
  const help = await helpFor(version, path)
  const children = listedCommands(help)
  const nested = await Promise.all(children.map(child => collect(version, [...path, child.name], child.summary)))
  return [{ path, summary, help }, ...nested.flat()]
}

/** The page, as Markdown with the content collection's frontmatter. */
export function renderCliDocs(version: string, root: string, commands: readonly CommandHelp[], today: string): string {
  const sections = commands.map(command => [
    `${'#'.repeat(Math.min(command.path.length + 1, 4))} skilld ${command.path.join(' ')}`,
    '',
    ...(command.summary ? [command.summary.endsWith('.') ? command.summary : `${command.summary}.`, ''] : []),
    '```text',
    command.help,
    '```',
  ].join('\n'))
  return [
    '---',
    'title: skilld CLI reference',
    `description: Every skilld command with its help text. Generated from the CLI help for skilld ${version}.`,
    'label: Reference',
    'author: Harlan Wilton',
    `command: ${cliNativeInstallCmd()}`,
    'publishedAt: 2026-09-01',
    `updatedAt: ${today}`,
    '---',
    '',
    `Generated from \`skilld --help\` for skilld \`${version}\`. Run \`npx skilld <command>\`, or install the CLI once. On macOS and Linux, run \`${cliNativeInstallCmd()}\`. On Windows, run \`${cliWindowsInstallCmd()}\` in PowerShell. With Node.js, run \`${cliGlobalInstallCmd()}\`.`,
    '',
    'The npm package selects a native executable for your system. It has no JavaScript engine or fallback.',
    '',
    '## skilld',
    '',
    '```text',
    root,
    '```',
    '',
    sections.join('\n\n'),
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const version = process.argv[2] ?? await latestVersion()
  const root = await helpFor(version, [])
  const top = listedCommands(root)
  const commands = (await Promise.all(top.map(command => collect(version, [command.name], command.summary)))).flat()
  const today = new Date().toISOString().slice(0, 10)
  await writeFile(TARGET, renderCliDocs(version, root, commands, today), 'utf8')
  process.stdout.write(`Wrote ${commands.length} commands from skilld ${version}.\n`)
}

if (import.meta.url === `file://${process.argv[1]}`)
  await main()
