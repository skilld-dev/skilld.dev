/**
 * Records one demo (GLOSSARY "demo") and writes it into the repository.
 *
 *   pnpm demo:record owner/repo/skill --prompt "Build ... Save it as index.html." --output index.html
 *   pnpm demo:record owner/repo/skill --prompt "Make ... Render it as film.mp4." --output film.mp4
 *   pnpm demo:record owner/repo/skill --prompt "..." --output launch.mp4 --seed ./site --setup "The folder held ..."
 *   pnpm demo:record owner/repo/skill --reshoot
 *
 * 1. Reads the Skill's current source commit from the public API.
 * 2. Runs Claude Code headless in a fresh temp folder: it loads the Skill with
 *    `npx skilld run`, then gets the prompt word for word. `--seed` copies a
 *    folder in first, and `--setup` says so on the demo.
 * 3. An HTML output gets full-page screenshots at desktop width, and at phone
 *    width when the page fits a phone. An MP4 output is re-encoded small and
 *    gets a poster frame.
 * 4. Uploads the media to the `skilld-demo-media` R2 bucket with `cf`, under
 *    content-hashed names, copies an HTML page to the registry's
 *    `server/demos/`, and upserts the entry in `server/data/skill-demos.json`.
 *    The account comes from `CLOUDFLARE_ACCOUNT_ID`, else `wrangler.jsonc`.
 *
 * A page Skill gets only Read, Write and Edit. A video Skill has to run its
 * renderer, so its Bash runs in the Claude Code sandbox: writes stay in the temp
 * folder, secrets stay unreadable, and the network reaches only package and
 * code hosts. Third-party Skill text never gets an open shell on this machine.
 *
 * `--reshoot` retakes the screenshots of a page demo from its kept output,
 * without running the Agent again.
 *
 * It writes nothing to production. Opening a pull request with the result is
 * the review step: a human approves each demo by merging it.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, cp, mkdir, mkdtemp, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { extname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { chromium } from '@playwright/test'

const run = promisify(execFile)

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const MANIFEST = join(ROOT, 'layers/registry/server/data/skill-demos.json')
const OUTPUT_DIR = join(ROOT, 'layers/registry/server/demos')
const MEDIA_BUCKET = 'skilld-demo-media'
const MEDIA_TYPES: Readonly<Record<string, string>> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' }
const API = 'https://skilld.dev/api/v1/skills'
const RECORD_TIMEOUT_MS = 20 * 60 * 1000
/** Rendering a film takes far longer than writing a page. */
const VIDEO_RECORD_TIMEOUT_MS = 60 * 60 * 1000

/** Taller pages are cut here, so one shot stays a few hundred kilobytes. */
const MAX_SHOT_HEIGHT = 6000
/** The web copy of a video: 720p, so a 15 second clip stays near a megabyte or two. */
const VIDEO_MAX_HEIGHT = 720
const VIDEO_WARN_BYTES = 8 * 1024 * 1024

const VIEWPORTS = [
  { viewport: 'desktop', width: 1440, height: 900 },
  { viewport: 'mobile', width: 390, height: 844 },
] as const

/** Hosts a video Skill may reach from its sandboxed shell: packages, code, fonts, browsers. */
const SANDBOX_DOMAINS = [
  'skilld.dev',
  '*.skilld.dev',
  'registry.npmjs.org',
  '*.npmjs.org',
  'github.com',
  '*.github.com',
  '*.githubusercontent.com',
  'codeload.github.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'esm.sh',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'storage.googleapis.com',
  '*.googleapis.com',
]

/** Paths no Skill command may read, even inside the sandbox. */
const SECRET_PATHS = ['~/.ssh', '~/.aws', '~/.config', '~/.gnupg', '~/.netrc', '~/.npmrc', '~/.docker', '~/.kube', '~/.local/share', '~/sites', '~/pkg']

interface Shot {
  file: string
  width: number
  height: number
  alt: string
  viewport: 'desktop' | 'mobile'
}

interface Video {
  file: string
  poster: string
  width: number
  height: number
  durationSeconds: number
}

interface DemoEntry {
  owner: string
  repo: string
  name: string
  authorName: string | null
  sourceUrl: string
  prompt: string
  setup?: string
  agent: string
  agentVersion: string
  model: string
  skillCommit: string
  recordedAt: string
  pin?: number
  outputFile?: string
  video?: Video
  shots: Shot[]
}

type OutputKind = 'page' | 'video'

type Parsed
  = | { _tag: 'record', owner: string, repo: string, name: string, prompt: string, output: string, kind: OutputKind, seed: string | null, setup: string | null }
    | { _tag: 'reshoot', owner: string, repo: string, name: string }
    | { _tag: 'usage', message: string }

function parseInput(argv: string[]): Parsed {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      prompt: { type: 'string' },
      output: { type: 'string', default: 'index.html' },
      seed: { type: 'string' },
      setup: { type: 'string' },
      reshoot: { type: 'boolean', default: false },
    },
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
  const kind: OutputKind | null = /^[\w-]+\.html$/.test(values.output) ? 'page' : /^[\w-]+\.mp4$/.test(values.output) ? 'video' : null
  if (!kind)
    return { _tag: 'usage', message: 'The --output file must be one HTML or MP4 file name, such as index.html or film.mp4.' }
  if (values.seed && !values.setup)
    return { _tag: 'usage', message: 'A --seed folder needs a --setup line that tells visitors what the folder held.' }
  return { _tag: 'record', owner, repo, name, prompt: values.prompt, output: values.output, kind, seed: values.seed ? resolve(values.seed) : null, setup: values.setup ?? null }
}

interface SkillSource {
  commit: string
  authorName: string | null
  sourceUrl: string
}

async function skillSource(owner: string, repo: string, name: string): Promise<SkillSource> {
  const response = await fetch(`${API}/${owner}/${repo}/${name}`)
  if (!response.ok)
    throw new Error(`The API answered ${response.status} for ${owner}/${repo}/${name}. Is the Skill admitted?`)
  const body = await response.json() as { sourceCommit?: unknown, authorName?: unknown, sourceUrl?: unknown }
  if (typeof body.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(body.sourceCommit))
    throw new Error(`The API gave no source commit for ${owner}/${repo}/${name}.`)
  if (typeof body.sourceUrl !== 'string')
    throw new Error(`The API gave no source URL for ${owner}/${repo}/${name}.`)
  return {
    commit: body.sourceCommit,
    authorName: typeof body.authorName === 'string' && body.authorName ? body.authorName : null,
    sourceUrl: body.sourceUrl,
  }
}

function sandboxSettings(): string {
  const home = homedir()
  const expand = (path: string) => path.replace(/^~/, home)
  return JSON.stringify({
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        // The temp folder is the working directory; renderers cache browsers here too.
        allowWrite: ['.', '~/.npm', '~/.cache/puppeteer', '~/.cache/ms-playwright'],
        denyRead: SECRET_PATHS,
      },
      network: { allowedDomains: SANDBOX_DOMAINS },
    },
    permissions: {
      deny: SECRET_PATHS.flatMap(path => [`Read(${expand(path)}/**)`, `Edit(${expand(path)}/**)`]),
    },
  })
}

async function record(cwd: string, skillRef: string, prompt: string, kind: OutputKind): Promise<{ model: string, version: string }> {
  const instruction = `First run \`npx skilld run ${skillRef}\` and follow the Skill it prints. Then do this task in the current folder:\n\n${prompt}`
  const access = kind === 'video'
    ? ['--settings', sandboxSettings(), '--allowedTools', 'Bash,Read,Write,Edit']
    : ['--allowedTools', `Bash(npx skilld run ${skillRef}),Read,Write,Edit`]
  const { stdout } = await run('claude', [
    '-p',
    instruction,
    '--output-format',
    'json',
    '--permission-mode',
    'acceptEdits',
    ...access,
  ], { cwd, timeout: kind === 'video' ? VIDEO_RECORD_TIMEOUT_MS : RECORD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
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

async function probe(file: string): Promise<{ width: number, height: number, durationSeconds: number }> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file])
  const info = JSON.parse(stdout) as { streams?: { width?: number, height?: number }[], format?: { duration?: string } }
  const stream = info.streams?.[0]
  const durationSeconds = Number(info.format?.duration)
  if (!stream?.width || !stream.height || !Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error(`ffprobe could not read the video at ${file}.`)
  return { width: stream.width, height: stream.height, durationSeconds: Math.round(durationSeconds * 10) / 10 }
}

/** A small H.264 copy that starts playing before it downloads, plus a poster frame. */
async function encodeVideo(source: string, dir: string, prompt: string): Promise<{ video: Video, shots: Shot[] }> {
  const file = 'video.mp4'
  const poster = 'poster.jpg'
  await run('ffmpeg', ['-y', '-v', 'error', '-i', source, '-vf', `scale=-2:'min(${VIDEO_MAX_HEIGHT},ih)'`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', join(dir, file)], { maxBuffer: 16 * 1024 * 1024 })
  const encoded = await probe(join(dir, file))
  // A frame a little way in: the first frame of a film is often black.
  const at = Math.min(2, encoded.durationSeconds / 3).toFixed(2)
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', at, '-i', join(dir, file), '-frames:v', '1', '-q:v', '3', join(dir, poster)])
  const size = (await stat(join(dir, file))).size
  if (size > VIDEO_WARN_BYTES)
    console.warn(`The web copy is ${(size / 1024 / 1024).toFixed(1)} MB. Trim the film or raise the CRF before you commit.`)
  return {
    video: { file, poster, ...encoded },
    shots: [{ file: poster, width: encoded.width, height: encoded.height, viewport: 'desktop', alt: `A frame from the video the Agent rendered for: ${prompt.slice(0, 120)}` }],
  }
}

/**
 * The named file, or the newest file of the same type in the folder. Hidden
 * folders and node_modules hold renderer scratch, such as the segments a film
 * is cut from, so they never count as the output.
 */
async function findOutput(cwd: string, output: string): Promise<string | null> {
  const named = join(cwd, output)
  const found = await stat(named).catch((error: NodeJS.ErrnoException) => {
    // Missing is expected: the Agent may have saved it under another name or folder.
    if (error.code === 'ENOENT')
      return null
    throw error
  })
  if (found?.isFile())
    return named
  const wanted = extname(output)
  const entries = await readdir(cwd, { recursive: true, withFileTypes: true })
  const matches = await Promise.all(entries
    .filter(entry => entry.isFile() && extname(entry.name) === wanted
      && !relative(cwd, entry.parentPath).split(sep).some(part => part.startsWith('.') || part === 'node_modules'))
    .map(async (entry) => {
      const path = join(entry.parentPath, entry.name)
      return { path, mtime: (await stat(path)).mtimeMs }
    }))
  return matches.sort((a, b) => b.mtime - a.mtime)[0]?.path ?? null
}

/** Recordings run in parallel, so each manifest write holds a lock file for its read and write. */
async function withManifestLock<T>(work: () => Promise<T>): Promise<T> {
  const lock = `${MANIFEST}.lock`
  for (let attempt = 0; ; attempt++) {
    const held = await open(lock, 'wx').catch((error: NodeJS.ErrnoException) => {
      // Another recording holds the lock; wait and try again.
      if (error.code === 'EEXIST' && attempt < 100)
        return null
      throw error
    })
    if (held) {
      await held.close()
      try {
        return await work()
      }
      finally {
        await rm(lock, { force: true })
      }
    }
    await new Promise(done => setTimeout(done, 200))
  }
}

async function upsert(entry: DemoEntry): Promise<void> {
  await withManifestLock(() => writeEntry(entry))
}

async function writeEntry(entry: DemoEntry): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as { demos: DemoEntry[] }
  const key = (demo: DemoEntry) => `${demo.owner}/${demo.repo}/${demo.name}`.toLowerCase()
  const previous = manifest.demos.find(demo => key(demo) === key(entry))
  const demos = manifest.demos.filter(demo => key(demo) !== key(entry))
  demos.push(previous?.pin && !entry.pin ? { ...entry, pin: previous.pin } : entry)
  demos.sort((a, b) => key(a).localeCompare(key(b)))
  await writeFile(MANIFEST, `${JSON.stringify({ demos }, null, 2)}\n`)
}

async function cloudflareAccount(): Promise<string> {
  if (process.env.CLOUDFLARE_ACCOUNT_ID)
    return process.env.CLOUDFLARE_ACCOUNT_ID
  const config = await readFile(join(ROOT, 'wrangler.jsonc'), 'utf8')
  const account = /"account_id":\s*"([0-9a-f]{32})"/.exec(config)?.[1]
  if (!account)
    throw new Error('Set CLOUDFLARE_ACCOUNT_ID: wrangler.jsonc has no account_id.')
  return account
}

/**
 * Uploads each staged file under a content-hashed name, so a media URL never
 * changes what it serves, and returns the old name to new name map.
 */
async function publishMedia(owner: string, repo: string, name: string, dir: string, files: string[]): Promise<Map<string, string>> {
  const account = await cloudflareAccount()
  const published = new Map<string, string>()
  for (const file of files) {
    const local = join(dir, file)
    const ext = extname(file)
    const hash = createHash('sha256').update(await readFile(local)).digest('hex').slice(0, 10)
    const hashed = `${file.slice(0, -ext.length)}-${hash}${ext}`
    const key = `demos/${owner}/${repo}/${name}/${hashed}`
    await run('cf', ['r2', 'objects', 'put', key, '--bucket-name', MEDIA_BUCKET, '--file', local, '--content-type', MEDIA_TYPES[ext] ?? 'application/octet-stream', '--quiet'], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
      maxBuffer: 16 * 1024 * 1024,
    })
    published.set(file, hashed)
  }
  return published
}

/** Stages, uploads, and renames the media of one demo. */
async function publishDemoMedia(owner: string, repo: string, name: string, dir: string, media: Pick<DemoEntry, 'video' | 'shots'>): Promise<Pick<DemoEntry, 'video' | 'shots'>> {
  const files = [...new Set([...media.shots.map(shot => shot.file), ...(media.video ? [media.video.file, media.video.poster] : [])])]
  const names = await publishMedia(owner, repo, name, dir, files)
  const to = (file: string) => names.get(file) ?? file
  return {
    shots: media.shots.map(shot => ({ ...shot, file: to(shot.file) })),
    ...(media.video ? { video: { ...media.video, file: to(media.video.file), poster: to(media.video.poster) } } : {}),
  }
}

async function reshoot(owner: string, repo: string, name: string): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as { demos: DemoEntry[] }
  const ref = `${owner}/${repo}/${name}`.toLowerCase()
  const entry = manifest.demos.find(demo => `${demo.owner}/${demo.repo}/${demo.name}`.toLowerCase() === ref)
  if (!entry)
    throw new Error(`No recorded demo for ${owner}/${repo}/${name}. Record it first.`)
  if (!entry.outputFile)
    throw new Error(`${owner}/${repo}/${name} is a video demo with no page to reshoot. Record it again instead.`)
  const stage = await mkdtemp(join(tmpdir(), 'skilld-demo-media-'))
  const page = join(OUTPUT_DIR, entry.owner, entry.repo, entry.name, entry.outputFile)
  const { shots } = await publishDemoMedia(entry.owner, entry.repo, entry.name, stage, { shots: await screenshot(page, stage, entry.prompt) })
  // The recorded commit stays; only the provenance fields refresh.
  const source = await skillSource(entry.owner, entry.repo, entry.name)
  await upsert({ ...entry, authorName: source.authorName, sourceUrl: source.sourceUrl, shots })
  console.log(`Retook ${shots.length} screenshots for ${owner}/${repo}/${name}.`)
}

async function main(): Promise<void> {
  const input = parseInput(process.argv.slice(2))
  if (input._tag === 'usage') {
    console.error(`${input.message}\nUsage: pnpm demo:record owner/repo/skill --prompt "..." [--output index.html|film.mp4] [--seed dir --setup "..."]\n       pnpm demo:record owner/repo/skill --reshoot`)
    process.exitCode = 2
    return
  }
  if (input._tag === 'reshoot') {
    await reshoot(input.owner, input.repo, input.name)
    return
  }
  const { owner, repo, name, prompt, output, kind, seed, setup } = input
  const skillRef = `${owner}/${repo}/${name}`
  const source = await skillSource(owner, repo, name)

  const cwd = await mkdtemp(join(tmpdir(), 'skilld-demo-'))
  if (seed)
    await cp(seed, cwd, { recursive: true })
  console.log(`Recording ${skillRef} at ${source.commit.slice(0, 7)} in ${cwd}`)
  const agent = await record(cwd, skillRef, prompt, kind)

  const produced = await findOutput(cwd, output)
  if (!produced)
    throw new Error(`The Agent wrote no ${extname(output)} file. Check ${cwd}.`)

  const stage = await mkdtemp(join(tmpdir(), 'skilld-demo-media-'))
  const staged: Pick<DemoEntry, 'outputFile' | 'video' | 'shots'> = kind === 'video'
    ? await encodeVideo(produced, stage, prompt)
    : await (async () => {
        const outputDir = join(OUTPUT_DIR, owner, repo, name)
        await mkdir(outputDir, { recursive: true })
        await copyFile(produced, join(outputDir, output))
        return { outputFile: output, shots: await screenshot(produced, stage, prompt) }
      })()
  const media = { ...staged, ...await publishDemoMedia(owner, repo, name, stage, staged) }

  await upsert({
    owner,
    repo,
    name,
    authorName: source.authorName,
    sourceUrl: source.sourceUrl,
    prompt,
    ...(setup ? { setup } : {}),
    agent: 'Claude Code',
    agentVersion: agent.version,
    model: agent.model,
    skillCommit: source.commit,
    recordedAt: new Date().toISOString().slice(0, 10),
    ...media,
  })
  console.log(`Recorded ${skillRef} with ${agent.model}. Review the media in ${stage} before you commit. The Agent's folder stays at ${cwd}.`)
}

await main()
