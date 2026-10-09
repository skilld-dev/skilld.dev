/** OpenCode writing comparison. Outputs and transcripts stay in --out until reviewed. */
import type { EvalDocuments } from './lib/writing-eval'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { z } from 'zod'
import { writingDemoExample, writingDemoSkills } from '../app/utils/writing-demo-example'
import { checkWritingMaterial, documentLabels, evalDocumentsSchema, parseWritingResponse, rewritePrompt } from './lib/writing-eval'

const exec = promisify(execFile)
const { values } = parseArgs({ options: { out: { type: 'string' }, model: { type: 'string', default: 'zai-coding-plan/glm-5.3' } } })
if (!values.out)
  throw new Error('Pass --out with a new scratch directory.')
const out = resolve(values.out)
const model = values.model!
await mkdir(out, { recursive: true })
const authPath = join(homedir(), '.local/share/opencode/auth.json')
const auth = existsSync(authPath) ? await readFile(authPath, 'utf8') : null
const configPath = join(homedir(), '.config/opencode/opencode.json')
const provider = existsSync(configPath) ? (JSON.parse(await readFile(configPath, 'utf8')) as { provider?: unknown }).provider : undefined
const version = (await exec('opencode', ['--version'])).stdout.trim()
const config = {
  $schema: 'https://opencode.ai/config.json',
  ...(provider ? { provider } : {}),
  autoupdate: false,
  share: 'disabled',
  permission: { '*': 'deny' },
  agent: { writing: { description: 'Controlled Markdown writing comparison', mode: 'primary', prompt: 'You edit or draft Markdown using only the supplied material. Follow the requested output format. Do not use tools.', permission: { '*': 'deny' } } },
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const envelope = '\nReturn one JSON object with exactly these keys: "reading-list.md", "README.md", "pr.md". Each value is the complete Markdown document as a JSON string. No outer Markdown fence or commentary.'
async function run(label: string, prompt: string): Promise<EvalDocuments> {
  const dir = join(out, label)
  if (existsSync(join(dir, 'output.json'))) {
    const savedPrompt = await readFile(join(dir, 'prompt.txt'), 'utf8')
    const savedModel = await readFile(join(dir, 'model.txt'), 'utf8')
    const savedRun = z.object({ agentVersion: z.string() }).parse(JSON.parse(await readFile(join(dir, 'run.json'), 'utf8')))
    if (savedPrompt !== prompt || savedModel !== model || savedRun.agentVersion !== version)
      throw new Error(`Cannot resume ${label}: prompt, model, or OpenCode version changed.`)
    return parseWritingResponse(await readFile(join(dir, 'events.jsonl'), 'utf8'))
  }
  await mkdir(join(dir, 'project'), { recursive: true })
  await writeFile(join(dir, 'prompt.txt'), prompt)
  await writeFile(join(dir, 'model.txt'), model)
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    LANG: process.env.LANG,
    HOME: dir,
    XDG_CONFIG_HOME: join(dir, 'config'),
    XDG_DATA_HOME: join(dir, 'data'),
    XDG_STATE_HOME: join(dir, 'state'),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    ...(auth ? { OPENCODE_AUTH_CONTENT: auth } : {}),
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_SHARE: '1',
  }
  console.log(`Running ${label} with ${model}`)
  const startedAt = new Date().toISOString()
  const execution = exec('opencode', ['run', '--pure', '--format', 'json', '--agent', 'writing', '--dir', join(dir, 'project'), '--model', model, prompt], { env, timeout: 600_000, maxBuffer: 32 * 1024 * 1024 })
  execution.child.stdin?.end()
  const result = await execution.catch(async (error: { stdout?: string, stderr?: string }) => {
    await writeFile(join(dir, 'events.jsonl'), error.stdout ?? '')
    await writeFile(join(dir, 'stderr.log'), error.stderr ?? '')
    throw error
  })
  await writeFile(join(dir, 'events.jsonl'), result.stdout)
  await writeFile(join(dir, 'stderr.log'), result.stderr)
  const documents = parseWritingResponse(result.stdout)
  await writeFile(join(dir, 'output.json'), `${JSON.stringify(documents, null, 2)}\n`)
  await writeFile(join(dir, 'run.json'), `${JSON.stringify({ model, agent: 'OpenCode', agentVersion: version, startedAt, completedAt: new Date().toISOString(), promptSha256: hash(prompt) }, null, 2)}\n`)
  for (const file of documentLabels)
    await writeFile(join(dir, file), documents[file])
  return documents
}

const sourceSchema = z.object({ sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), sourceUrl: z.string().url(), skillPath: z.string().min(1) })
async function github(path: string): Promise<unknown> {
  return JSON.parse((await exec('agent-gh', ['api', path], { maxBuffer: 32 * 1024 * 1024 })).stdout)
}
async function snapshot(skill: typeof writingDemoSkills[number]) {
  const key = `${skill.owner}/${skill.repo}/${skill.name}`
  const file = join(out, `${skill.name}-source.json`)
  if (existsSync(file))
    return z.object({ key: z.literal(key), source: sourceSchema, files: z.array(z.object({ path: z.string(), text: z.string(), sha256: z.string() })) }).parse(JSON.parse(await readFile(file, 'utf8')))
  const response = await fetch(`https://skilld.dev/api/v1/skills/${key}`)
  if (!response.ok)
    throw new Error(`${key}: source lookup answered ${response.status}.`)
  const source = sourceSchema.parse(await response.json())
  const tree = z.object({ truncated: z.boolean(), tree: z.array(z.object({ path: z.string(), type: z.string() })) }).parse(await github(`repos/${skill.owner}/${skill.repo}/git/trees/${source.sourceCommit}?recursive=1`))
  if (tree.truncated)
    throw new Error(`${key}: source tree is incomplete.`)
  const directory = dirname(source.skillPath)
  const paths = tree.tree.filter(entry => entry.type === 'blob' && entry.path.endsWith('.md') && (directory === '.' ? entry.path === source.skillPath || entry.path.startsWith('references/') : entry.path.startsWith(`${directory}/`))).map(entry => entry.path)
  if (!paths.includes(source.skillPath))
    throw new Error(`${key}: SKILL.md is missing from the pinned tree.`)
  const files = []
  for (const path of paths) {
    const blob = z.object({ encoding: z.literal('base64'), content: z.string() }).parse(await github(`repos/${skill.owner}/${skill.repo}/contents/${path}?ref=${source.sourceCommit}`))
    const text = Buffer.from(blob.content, 'base64').toString('utf8')
    files.push({ path, text, sha256: hash(text) })
  }
  const saved = { key, source, files }
  await writeFile(file, `${JSON.stringify(saved, null, 2)}\n`)
  return saved
}

const facts = evalDocumentsSchema.parse(Object.fromEntries(writingDemoExample.documents.map(doc => [doc.label, doc.original])))
const original = await run('seed', `Draft three deliberately generic, AI-sounding Markdown documents about the fictional Margin reading-list app and package. Use padded transitions, vague praise, and uniform prose. Do not invent facts, first-person experiences, capabilities, tests, measurements, or sources. Keep each document under 500 words. Preserve every fact, code block, URL, identifier, and heading from this supplied brief. The app and package are separate examples, do not merge their capabilities.\n${JSON.stringify(facts)}${envelope}`)
const baseline = await run('baseline', `${rewritePrompt}\nDocuments:\n${JSON.stringify(original)}${envelope}`)
const results = []
for (const skill of writingDemoSkills) {
  const pinned = await snapshot(skill)
  const instructions = pinned.files.map(file => `File: ${file.path}\n${file.text}`).join('\n\n')
  const output = await run(skill.name, `Apply this Skill and its bundled references to the task below. These supplied files are the complete source snapshot. Use only the supplied fictional facts; do not claim external verification. Follow the requested document-only output format even if the Skill asks for review notes.\n<skill>\n${instructions}\n</skill>\n\n${rewritePrompt}\nDocuments:\n${JSON.stringify(original)}${envelope}`)
  results.push({ ...skill, source: pinned.source, sourceFiles: pinned.files.map(({ path, sha256 }) => ({ path, sha256 })), materialChecks: checkWritingMaterial(original, output), writing: { documents: writingDemoExample.documents.map(doc => ({ id: doc.id, label: doc.label, format: doc.format, original: original[doc.label as keyof EvalDocuments], baseline: baseline[doc.label as keyof EvalDocuments], output: output[doc.label as keyof EvalDocuments] })) } })
  await writeFile(join(out, 'results.json'), `${JSON.stringify({ model, agent: 'OpenCode', agentVersion: version, rewritePrompt, seedChecks: checkWritingMaterial(facts, original), baselineChecks: checkWritingMaterial(original, baseline), results }, null, 2)}\n`)
}
const demos = []
for (const result of results) {
  const run = z.object({ completedAt: z.string() }).parse(JSON.parse(await readFile(join(out, result.name, 'run.json'), 'utf8')))
  demos.push({
    owner: result.owner,
    repo: result.repo,
    name: result.name,
    makes: 'writing',
    sourceUrl: result.source.sourceUrl,
    skillCommit: result.source.sourceCommit,
    prompt: `${rewritePrompt}\nDocuments:\n${JSON.stringify(original)}${envelope}`,
    setup: 'AI-generated original Markdown and a shared no-Skill rewrite. Three documents about the fictional Margin app and package.',
    agent: 'OpenCode',
    agentVersion: version,
    model,
    recordedAt: run.completedAt.slice(0, 10),
    writing: result.writing,
    shots: [],
  })
}
await writeFile(join(out, 'demos.json'), `${JSON.stringify({ demos }, null, 2)}\n`)
console.log(`Recorded ${results.length} Skills. Review ${join(out, 'results.json')} before publishing.`)
