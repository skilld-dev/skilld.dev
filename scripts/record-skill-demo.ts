/**
 * Records one demo (GLOSSARY "demo") and writes it into the repository.
 *
 *   pnpm demo:record owner/repo/skill --prompt "Build ... Save it as index.html." --output index.html
 *   pnpm demo:record owner/repo/skill --reshoot
 *
 * `--reshoot` retakes the screenshots of a recorded demo from its kept output
 * page, without running the Agent again.
 *
 * 1. Reads the Skill's current source commit from the public API.
 * 2. Runs Claude Code headless in an empty temp folder: it loads the Skill with
 *    `npx skilld run`, then gets the prompt word for word.
 * 3. Screenshots the whole output page at desktop width, and at phone width
 *    when the page fits a phone. The Skill page shows each in a scrolling frame.
 * 4. Copies the screenshots to `public/demos/`, the page to the registry's
 *    `server/demos/`, and upserts the entry in `server/data/skill-demos.json`.
 *
 * It writes nothing to production. Opening a pull request with the result is
 * the review step: a human approves each demo by merging it.
 */

import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { chromium } from '@playwright/test'

const run = promisify(execFile)

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const MANIFEST = join(ROOT, 'layers/registry/server/data/skill-demos.json')
const OUTPUT_DIR = join(ROOT, 'layers/registry/server/demos')
const SHOT_DIR = join(ROOT, 'public/demos')
const API = 'https://skilld.dev/api/v1/skills'
const RECORD_TIMEOUT_MS = 20 * 60 * 1000

/** Taller pages are cut here, so one shot stays a few hundred kilobytes. */
const MAX_SHOT_HEIGHT = 6000

const VIEWPORTS = [
  { viewport: 'desktop', width: 1440, height: 900 },
  { viewport: 'mobile', width: 390, height: 844 },
] as const

interface Shot {
  file: string
  width: number
  height: number
  alt: string
  viewport: 'desktop' | 'mobile'
}

interface DemoEntry {
  owner: string
  repo: string
  name: string
  prompt: string
  agent: string
  agentVersion: string
  model: string
  skillCommit: string
  recordedAt: string
  outputFile: string
  shots: Shot[]
}

type Parsed
  = | { _tag: 'record', owner: string, repo: string, name: string, prompt: string, output: string }
    | { _tag: 'reshoot', owner: string, repo: string, name: string }
    | { _tag: 'usage', message: string }

function parseInput(argv: string[]): Parsed {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { prompt: { type: 'string' }, output: { type: 'string', default: 'index.html' }, reshoot: { type: 'boolean', default: false } },
  })
  const [ref] = positionals
  const parts = ref?.split('/') ?? []
  if (parts.length !== 3 || parts.some(part => !part))
    return { _tag: 'usage', message: 'Give the Skill as owner/repo/skill.' }
  const [owner, repo, name] = parts as [string, string, string]
  if (values.reshoot)
    return { _tag: 'reshoot', owner, repo, name }
  if (!values.prompt)
    return { _tag: 'usage', message: 'Give the prompt with --prompt.' }
  if (!/^[\w-]+\.html$/.test(values.output))
    return { _tag: 'usage', message: 'The --output file must be one HTML file name, such as index.html.' }
  return { _tag: 'record', owner, repo, name, prompt: values.prompt, output: values.output }
}

async function skillCommit(owner: string, repo: string, name: string): Promise<string> {
  const response = await fetch(`${API}/${owner}/${repo}/${name}`)
  if (!response.ok)
    throw new Error(`The API answered ${response.status} for ${owner}/${repo}/${name}. Is the Skill admitted?`)
  const body = await response.json() as { sourceCommit?: unknown }
  if (typeof body.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(body.sourceCommit))
    throw new Error(`The API gave no source commit for ${owner}/${repo}/${name}.`)
  return body.sourceCommit
}

async function record(cwd: string, skillRef: string, prompt: string): Promise<{ model: string, version: string }> {
  const instruction = `First run \`npx skilld run ${skillRef}\` and follow the Skill it prints. Then do this task in the current folder:\n\n${prompt}`
  const { stdout } = await run('claude', [
    '-p',
    instruction,
    '--output-format',
    'json',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    `Bash(npx skilld run ${skillRef}),Read,Write,Edit`,
  ], { cwd, timeout: RECORD_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 })
  const result = JSON.parse(stdout) as { is_error?: boolean, result?: string, modelUsage?: Record<string, unknown> }
  if (result.is_error)
    throw new Error(`Claude Code reported an error: ${result.result ?? 'no message'}`)
  const models = Object.keys(result.modelUsage ?? {})
  const { stdout: versionOut } = await run('claude', ['--version'])
  return { model: models[0] ?? 'unknown', version: versionOut.trim().split(' ')[0] ?? 'unknown' }
}

async function screenshot(page: string, dir: string, prompt: string): Promise<Shot[]> {
  const browser = await chromium.launch()
  const shots: Shot[] = []
  for (const { viewport, width, height } of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const tab = await context.newPage()
    await tab.goto(pathToFileURL(page).href, { waitUntil: 'networkidle' })
    // A page wider than the phone only shows a clipped corner, so it gets no phone shot.
    // That counts a page wider than the screen, or an inner panel that scrolls sideways.
    const overflows = await tab.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
      || [...document.querySelectorAll('body *')].some((el) => {
        const overflowX = getComputedStyle(el).overflowX
        return (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1
      }))
    if (viewport === 'mobile' && overflows) {
      await context.close()
      continue
    }
    // Scroll to the end and back, so content that reveals on scroll is in the picture.
    await tab.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
        window.scrollTo(0, y)
        await new Promise(done => setTimeout(done, 150))
      }
      window.scrollTo(0, 0)
    })
    // Let entrance animations settle before the picture.
    await tab.waitForTimeout(1500)
    const pageHeight = await tab.evaluate(() => document.documentElement.scrollHeight)
    const shotHeight = Math.max(height, Math.min(pageHeight, MAX_SHOT_HEIGHT))
    const file = `${viewport}.jpg`
    await tab.screenshot({ path: join(dir, file), type: 'jpeg', quality: 82, fullPage: true, clip: { x: 0, y: 0, width, height: shotHeight } })
    shots.push({
      file,
      width,
      height: shotHeight,
      viewport,
      alt: `${viewport === 'desktop' ? 'Desktop' : 'Phone'} screenshot of the page the Agent built for: ${prompt.slice(0, 120)}`,
    })
    await context.close()
  }
  await browser.close()
  return shots
}

async function upsert(entry: DemoEntry): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as { demos: DemoEntry[] }
  const key = (demo: DemoEntry) => `${demo.owner}/${demo.repo}/${demo.name}`.toLowerCase()
  const demos = manifest.demos.filter(demo => key(demo) !== key(entry))
  demos.push(entry)
  demos.sort((a, b) => key(a).localeCompare(key(b)))
  await writeFile(MANIFEST, `${JSON.stringify({ demos }, null, 2)}\n`)
}

async function reshoot(owner: string, repo: string, name: string): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as { demos: DemoEntry[] }
  const ref = `${owner}/${repo}/${name}`.toLowerCase()
  const entry = manifest.demos.find(demo => `${demo.owner}/${demo.repo}/${demo.name}`.toLowerCase() === ref)
  if (!entry)
    throw new Error(`No recorded demo for ${owner}/${repo}/${name}. Record it first.`)
  const shotDir = join(SHOT_DIR, entry.owner, entry.repo, entry.name)
  await rm(shotDir, { recursive: true, force: true })
  await mkdir(shotDir, { recursive: true })
  const page = join(OUTPUT_DIR, entry.owner, entry.repo, entry.name, entry.outputFile)
  const shots = await screenshot(page, shotDir, entry.prompt)
  await upsert({ ...entry, shots })
  console.log(`Retook ${shots.length} screenshots for ${owner}/${repo}/${name}.`)
}

async function main(): Promise<void> {
  const input = parseInput(process.argv.slice(2))
  if (input._tag === 'usage') {
    console.error(`${input.message}\nUsage: pnpm demo:record owner/repo/skill --prompt "..." [--output index.html]\n       pnpm demo:record owner/repo/skill --reshoot`)
    process.exitCode = 2
    return
  }
  if (input._tag === 'reshoot') {
    await reshoot(input.owner, input.repo, input.name)
    return
  }
  const { owner, repo, name, prompt, output } = input
  const skillRef = `${owner}/${repo}/${name}`
  const commit = await skillCommit(owner, repo, name)

  const cwd = await mkdtemp(join(tmpdir(), 'skilld-demo-'))
  console.log(`Recording ${skillRef} at ${commit.slice(0, 7)} in ${cwd}`)
  const agent = await record(cwd, skillRef, prompt)

  const page = join(cwd, output)
  const written = await stat(page).catch((error: NodeJS.ErrnoException) => {
    // A missing file is the failure this check exists for; the next line reports it with the folder.
    if (error.code === 'ENOENT')
      return null
    throw error
  })
  if (!written?.isFile())
    throw new Error(`The Agent did not write ${output}. Check ${cwd}.`)

  const shotDir = join(SHOT_DIR, owner, repo, name)
  const outputDir = join(OUTPUT_DIR, owner, repo, name)
  await mkdir(shotDir, { recursive: true })
  await mkdir(outputDir, { recursive: true })
  const shots = await screenshot(page, shotDir, prompt)
  await copyFile(page, join(outputDir, output))

  await upsert({
    owner,
    repo,
    name,
    prompt,
    agent: 'Claude Code',
    agentVersion: agent.version,
    model: agent.model,
    skillCommit: commit,
    recordedAt: new Date().toISOString().slice(0, 10),
    outputFile: output,
    shots,
  })
  console.log(`Recorded ${skillRef} with ${agent.model}. Review the screenshots in ${shotDir} before you commit.`)
}

await main()
