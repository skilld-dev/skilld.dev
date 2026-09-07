/**
 * Move the diagram skills already in production onto the `diagramming`
 * category added on 2026-09-04.
 *
 * Why a script instead of the cron: the cron only reclassifies a skill whose
 * stored `promptVersion` is stale, and bumping ABSTRACTNESS_PROMPT_VERSION
 * marks all 23k rows stale at 20 an hour, which is seven weeks of drift for a
 * change that touches a few dozen rows. This asks the same model the same
 * question about a candidate set instead.
 *
 * Candidates come from a keyword sweep over descriptions, which is deliberately
 * loose. The model makes the call, not the keyword: a skill that merely
 * mentions diagrams keeps the category it has.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-diagramming-category.ts            # dry run
 *   pnpm tsx scripts/backfill-diagramming-category.ts --apply    # writes prod
 *   pnpm tsx scripts/backfill-diagramming-category.ts --limit 40
 *
 * Auth: the wrangler OAuth token in ~/.config/.wrangler/config/default.toml,
 * the same one `wrangler d1 execute --remote` uses. A standard login grants
 * `ai:write`, so no CLOUDFLARE_API_TOKEN is needed.
 *
 * Writes only `skills.abstractness_category`. It never touches `is_abstract`,
 * `target_package` or the `skill_generated` payload, so a later cron pass
 * re-derives all three from the current prompt and can overrule this.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { ABSTRACTNESS_RESPONSE_FORMAT, ABSTRACTNESS_SYSTEM_PROMPT } from '../layers/registry/server/utils/ai-prompts'

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
const DATABASE = 'skilld-db'
const CONFIG = 'wrangler.jsonc'

/**
 * Loose on purpose. Precision comes from the model, so a term here only has to
 * be a plausible sign that a skill draws something.
 */
const CANDIDATE_TERMS = [
  'diagram',
  'mermaid',
  'drawio',
  'draw.io',
  'excalidraw',
  'plantuml',
  'flowchart',
  'sequence diagram',
  'architecture map',
  'codebase map',
  'c4 model',
  'data flow',
  'visualiz',
]

interface Candidate {
  owner: string
  repo: string
  name: string
  category: string | null
  description: string
  rendered: string
}

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '6' },
  },
})

const APPLY = values.apply === true
const LIMIT = values.limit ? Number.parseInt(values.limit, 10) : 200
const CONCURRENCY = Math.max(1, Number.parseInt(values.concurrency!, 10) || 6)

function wranglerToken(): { token: string, accountId: string } {
  const configPath = join(homedir(), '.config', '.wrangler', 'config', 'default.toml')
  if (!existsSync(configPath))
    throw new Error(`No wrangler login found at ${configPath}. Run \`wrangler login\`.`)

  const toml = readFileSync(configPath, 'utf8')
  const token = /oauth_token\s*=\s*"([^"]+)"/.exec(toml)?.[1]
  if (!token)
    throw new Error('wrangler config has no oauth_token. Run `wrangler login`.')

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    ?? /"account_id"\s*:\s*"([^"]+)"/.exec(readFileSync(CONFIG, 'utf8'))?.[1]
  if (!accountId)
    throw new Error('No account id. Set CLOUDFLARE_ACCOUNT_ID or put account_id in wrangler.jsonc.')

  return { token, accountId }
}

function d1(command: string, remote = true): any[] {
  const out = execFileSync('npx', [
    'wrangler',
    'd1',
    'execute',
    DATABASE,
    remote ? '--remote' : '--local',
    '--config',
    CONFIG,
    '--json',
    '--command',
    command,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  return JSON.parse(out)[0]?.results ?? []
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, '\'\'')}'`
}

/** A chart plots numbers. A diagram draws a structure. */
const CHARTING_SIGNAL = /\bchart|dashboard|\bplot\b|vega|\bd3\b|matplotlib|plotly|seaborn|histogram|data visuali[sz]/i
const STRUCTURE_SIGNAL = /architecture|flowchart|sequence diagram|state machine|entity[- ]relation|\berd\b|mermaid|draw\.?io|excalidraw|plantuml|\bc4\b|codebase map|data flow|topology|\buml\b|swimlane/i

/**
 * The 8b classifier reads "draw a chart" as diagramming often enough to matter:
 * three of the first sixty candidates were analytics and plotting skills. This
 * holds a verdict back when the text talks about charts and never about
 * structure, so a chart skill keeps the category it already had.
 *
 * Exported for the unit test. The model still decides everything else.
 */
export function holdsAsCharting(text: string): boolean {
  return CHARTING_SIGNAL.test(text) && !STRUCTURE_SIGNAL.test(text)
}

function loadCandidates(): Candidate[] {
  const terms = CANDIDATE_TERMS
    .map(term => `lower(s.description) LIKE ${sqlString(`%${term}%`)}`)
    .join(' OR ')
  const rows = d1(`
    SELECT s.owner, s.repo, s.name, s.abstractness_category AS category,
           COALESCE(s.description, '') AS description,
           substr(COALESCE(s.rendered_raw, ''), 1, 6000) AS rendered
    FROM skills s
    WHERE s.sync_status = 'ok'
      AND COALESCE(s.abstractness_category, '') != 'diagramming'
      AND (${terms} OR lower(s.name) LIKE '%diagram%')
    ORDER BY s.approved_social_count DESC, s.name ASC
    LIMIT ${LIMIT}
  `.replace(/\s+/g, ' ').trim())
  return rows as Candidate[]
}

async function classify(candidate: Candidate, auth: { token: string, accountId: string }): Promise<string | null> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${auth.accountId}/ai/run/${MODEL}`,
    {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${auth.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: ABSTRACTNESS_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Identity: ${candidate.owner}/${candidate.repo}/${candidate.name}\n\nSKILL.md content:\n\n${candidate.rendered || candidate.description}\n\nClassify and output the JSON object.`,
          },
        ],
        max_tokens: 128,
        temperature: 0,
        response_format: ABSTRACTNESS_RESPONSE_FORMAT,
      }),
    },
  )
  if (!response.ok)
    throw new Error(`Workers AI ${response.status}: ${(await response.text()).slice(0, 200)}`)

  const body = await response.json() as { result?: { response?: unknown } }
  const raw = body.result?.response
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const category = (parsed as { category?: unknown } | null)?.category
  return typeof category === 'string' ? category : null
}

async function main(): Promise<void> {
  const auth = wranglerToken()
  const candidates = loadCandidates()
  console.log(`${candidates.length} candidates, ${APPLY ? 'APPLYING' : 'dry run'}`)

  const moves: Candidate[] = []
  const held: Candidate[] = []
  for (let index = 0; index < candidates.length; index += CONCURRENCY) {
    const batch = candidates.slice(index, index + CONCURRENCY)
    const verdicts = await Promise.all(batch.map(async (candidate) => {
      try {
        return await classify(candidate, auth)
      }
      catch (error) {
        console.error(`  ! ${candidate.owner}/${candidate.name}: ${(error as Error).message}`)
        return null
      }
    }))
    for (let offset = 0; offset < batch.length; offset++) {
      const candidate = batch[offset]!
      if (verdicts[offset] !== 'diagramming')
        continue

      if (holdsAsCharting(`${candidate.name} ${candidate.description}`)) {
        held.push(candidate)
        console.log(`  · held ${candidate.owner}/${candidate.name}  (charting, keeps ${candidate.category ?? 'none'})`)
        continue
      }
      moves.push(candidate)
      console.log(`  → ${candidate.owner}/${candidate.name}  (was ${candidate.category ?? 'none'})`)
    }
  }

  console.log(`\n${moves.length} of ${candidates.length} classify as diagramming. ${held.length} held as charting.`)
  if (!moves.length || !APPLY) {
    if (!APPLY && moves.length)
      console.log('Dry run. Re-run with --apply to write these.')
    return
  }

  for (let index = 0; index < moves.length; index += 50) {
    const batch = moves.slice(index, index + 50)
    const keys = batch.map(m => sqlString(`${m.owner}/${m.repo}/${m.name}`)).join(', ')
    d1(`UPDATE skills SET abstractness_category = 'diagramming' WHERE owner || '/' || repo || '/' || name IN (${keys})`)
    console.log(`wrote ${batch.length}`)
  }
  console.log('Done. Run scripts/recompute-skill-indexability.ts if these should enter the index.')
}

if (process.argv[1]?.endsWith('backfill-diagramming-category.ts'))
  await main()
