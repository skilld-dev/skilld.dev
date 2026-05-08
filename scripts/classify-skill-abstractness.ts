/**
 * Classify the top 1200 skills as `abstract` (problem/workflow not tied to a
 * specific package) vs `package-specific` (best-practices for a particular
 * library/service). Used as research input for the homepage redesign — the
 * homepage should ONLY surface abstract skills.
 *
 * Input:  /tmp/skilld-ux/top-skills.tsv
 *         columns: name\towner\trepo\tinstalls\tstars\tdescription
 * Output: /tmp/skilld-ux/classifications.jsonl
 *         one record per line, keyed by `${owner}/${name}`. Resume-safe.
 *
 * Usage:
 *   pnpm tsx scripts/classify-skill-abstractness.ts [--limit N] [--concurrency N]
 *
 * Backend: uses callHaiku — falls back to `claude -p` when no ANTHROPIC_API_KEY.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { callHaiku, extractJson } from '../server/utils/anthropic'
import { pAll } from '../server/utils/p-all'

const INPUT = '/tmp/skilld-ux/top-skills.tsv'
const OUTPUT = '/tmp/skilld-ux/classifications.jsonl'

const { values } = parseArgs({
  options: {
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '8' },
  },
})

const LIMIT = values.limit ? Number.parseInt(values.limit, 10) : Number.POSITIVE_INFINITY
const CONCURRENCY = Math.max(1, Number.parseInt(values.concurrency!, 10) || 8)
const API_KEY = process.env.ANTHROPIC_API_KEY

interface SkillRow {
  name: string
  owner: string
  repo: string
  installs: number
  stars: number
  description: string
}

interface Classification {
  kind: 'abstract' | 'package-specific'
  package: string | null
  category: string
  confidence: number
}

interface OutputRecord extends Classification {
  key: string
  name: string
  owner: string
  repo: string
  description: string
}

function parseTsv(path: string): SkillRow[] {
  const raw = readFileSync(path, 'utf8')
  const lines = raw.split('\n').filter(Boolean)
  return lines.map((line) => {
    const [name, owner, repo, installs, stars, ...rest] = line.split('\t')
    return {
      name: name ?? '',
      owner: owner ?? '',
      repo: repo ?? '',
      installs: Number.parseInt(installs ?? '0', 10) || 0,
      stars: Number.parseInt(stars ?? '0', 10) || 0,
      description: rest.join('\t'),
    }
  })
}

function loadDone(path: string): Set<string> {
  if (!existsSync(path))
    return new Set()
  const raw = readFileSync(path, 'utf8')
  const done = new Set<string>()
  for (const line of raw.split('\n')) {
    if (!line.trim())
      continue
    try {
      const obj = JSON.parse(line) as { key?: string }
      if (obj.key)
        done.add(obj.key)
    }
    catch {
      // skip malformed
    }
  }
  return done
}

const SYSTEM_PROMPT = `You classify "skills" — markdown instruction packages for AI coding agents — into two kinds:

1. "abstract" — a problem-solving workflow, methodology, or general capability that is NOT tied to a specific library/framework/cloud service. Examples: brainstorming, systematic-debugging, writing-plans, browser-use (general browser automation), code-review, refactor-extract-method, git-bisect.

2. "package-specific" — best practices, usage guidance, or recipes for ONE specific product, library, framework, cloud service, or CLI tool. Examples: supabase-postgres-best-practices (package: supabase), azure-rbac (package: azure), vercel-ai-sdk (package: vercel-ai), nuxt-ui (package: nuxt-ui), playwright-best-practices (package: playwright).

Boundary rule: If the skill names a specific product/library AND would not equally apply to a different product, it's package-specific. Generic capabilities that happen to mention a tool as an example are abstract. "browser-use" is abstract; "playwright-best-practices" is package-specific.

For package-specific, set "package" to a short normalized lowercase slug for the product (e.g. "supabase", "playwright", "nuxt-ui", "aws-s3", "vercel-ai", "stripe"). For abstract, set "package" to null.

Choose a short free-text "category" hint, e.g. one of: planning, debugging, code-review, refactor, docs-writing, testing-strategy, browser-automation, data-extraction, creative-writing, git-workflow, agent-meta, design, security, devops, research, content-writing, accessibility, performance, package-best-practices (use this for package-specific), api-integration. Free text is fine — pick what fits.

Respond with ONLY a single JSON object, no prose, no code fence:
{"kind":"abstract"|"package-specific","package":"<slug>"|null,"category":"<short>","confidence":0.0-1.0}`

function buildUserPrompt(s: SkillRow): string {
  const desc = (s.description || '').slice(0, 600)
  return `Skill name: ${s.name}
Repo: ${s.owner}/${s.repo}
Description: ${desc}

Classify this skill. Respond with the JSON object only.`
}

async function classifyOne(s: SkillRow): Promise<Classification> {
  const res = await callHaiku({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(s),
    apiKey: API_KEY,
    maxTokens: 200,
    cacheSystem: true,
  })
  const parsed = extractJson<Partial<Classification>>(res.text)
  if (!parsed || (parsed.kind !== 'abstract' && parsed.kind !== 'package-specific'))
    throw new Error(`bad json: ${res.text.slice(0, 200)}`)
  return {
    kind: parsed.kind,
    package: parsed.kind === 'package-specific' ? (parsed.package ?? null) : null,
    category: typeof parsed.category === 'string' ? parsed.category : 'unknown',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
  }
}

async function main(): Promise<void> {
  const all = parseTsv(INPUT)
  const slice = Number.isFinite(LIMIT) ? all.slice(0, LIMIT) : all
  const done = loadDone(OUTPUT)
  const todo = slice.filter(s => !done.has(`${s.owner}/${s.name}`))

  process.stderr.write(`Total: ${slice.length}; already done: ${done.size}; todo: ${todo.length}; concurrency: ${CONCURRENCY}; backend: ${API_KEY ? 'api' : 'cli'}\n`)

  let completed = 0
  let failed = 0
  const startMs = Date.now()

  await pAll(todo, CONCURRENCY, async (s) => {
    const key = `${s.owner}/${s.name}`
    try {
      const c = await classifyOne(s)
      const rec: OutputRecord = {
        key,
        name: s.name,
        owner: s.owner,
        repo: s.repo,
        description: s.description,
        ...c,
      }
      appendFileSync(OUTPUT, `${JSON.stringify(rec)}\n`)
      completed += 1
    }
    catch (err) {
      failed += 1
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`FAIL ${key}: ${msg.slice(0, 160)}\n`)
    }
    if ((completed + failed) % 10 === 0) {
      const elapsed = (Date.now() - startMs) / 1000
      const rate = (completed + failed) / elapsed
      const remaining = todo.length - (completed + failed)
      const eta = rate > 0 ? Math.round(remaining / rate) : 0
      process.stderr.write(`[${completed + failed}/${todo.length}] ok=${completed} fail=${failed} rate=${rate.toFixed(2)}/s eta=${eta}s\n`)
    }
  })

  process.stderr.write(`Done. ok=${completed} fail=${failed} elapsed=${((Date.now() - startMs) / 1000).toFixed(1)}s\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
