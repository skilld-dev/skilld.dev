export const SKILLS_SH_VIEWS = ['trending', 'all-time'] as const

export type SkillsShView = typeof SKILLS_SH_VIEWS[number]
export type SkillsShApplyTarget = 'local' | 'remote'

export interface SkillsShEntry {
  view: SkillsShView
  owner: string
  repo: string
  skill: string
  rank: number
  sourceUrl: string
  observedAt: number
}

export interface SkillsShCrawlOptions {
  apply: SkillsShApplyTarget | null
  emitSql: boolean
  limit: number
  views: SkillsShView[]
}

export type SkillsShCrawlArgsResult
  = | { _tag: 'ok', options: SkillsShCrawlOptions }
    | { _tag: 'help' }
    | {
      _tag: 'error'
      reason:
        | 'apply_and_emit_sql_conflict'
        | 'invalid_apply_target'
        | 'invalid_arguments'
        | 'invalid_limit'
        | 'invalid_view'
    }

export type SkillsShParseResult
  = | {
    _tag: 'ok'
    entries: SkillsShEntry[]
    ignoredWellKnown: number
  }
  | {
    _tag: 'error'
    reason: 'malformed_skill_rows' | 'no_skill_rows'
    malformedRows: number
  }

export type SkillsShCrawlResult
  = | {
    _tag: 'ok'
    entries: SkillsShEntry[]
    ignoredWellKnown: number
  }
  | {
    _tag: 'error'
    view: SkillsShView
    reason:
      | 'content_too_large'
      | 'fetch_failed'
      | 'invalid_content_type'
      | 'malformed_skill_rows'
      | 'no_skill_rows'
      | 'unexpected_status'
    detail: string
  }

interface CrawlDependencies {
  fetch: typeof globalThis.fetch
}

const SKILLS_SH_BASE_URL = 'https://www.skills.sh'
const MAX_HTML_CHARS = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 30_000
const ROW_ANCHOR_PATTERN = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
const GITHUB_OWNER_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{0,37}[A-Z0-9])?$/i
const GITHUB_REPO_PATTERN = /^[\w.-]{1,100}$/

function attributeValue(attributes: string, name: 'class' | 'href'): string | null {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match?.[1] ?? match?.[2] ?? null
}

function elementsWithClasses(
  html: string,
  tag: 'p' | 'span',
  requiredClasses: string[],
): string[] {
  const pattern = tag === 'p'
    ? /<p\b([^>]*)>([\s\S]*?)<\/p>/gi
    : /<span\b([^>]*)>([\s\S]*?)<\/span>/gi
  return [...html.matchAll(pattern)]
    .filter((match) => {
      const classes = new Set((attributeValue(match[1]!, 'class') ?? '').split(/\s+/))
      return requiredClasses.every(className => classes.has(className))
    })
    .map(match => decodeHtmlText(match[2]!))
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', '\'')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim()
}

function decodedPathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  }
  catch {
    return null
  }
}

function skillsShPathname(href: string): string | null {
  if (!href.startsWith('/') || href.startsWith('//'))
    return null
  return href.split(/[?#]/, 1)[0] || null
}

function isGithubIdentity(owner: string, repo: string): boolean {
  return GITHUB_OWNER_PATTERN.test(owner)
    && GITHUB_REPO_PATTERN.test(repo)
    && repo !== '.'
    && repo !== '..'
}

function leaderboardPath(view: SkillsShView): string {
  return view === 'trending' ? '/trending' : '/'
}

export function parseSkillsShLeaderboardHtml(
  html: string,
  view: SkillsShView,
  observedAt: number,
  limit: number,
): SkillsShParseResult {
  const entries: SkillsShEntry[] = []
  const seen = new Set<string>()
  let ignoredWellKnown = 0
  let malformedRows = 0

  for (const match of html.matchAll(ROW_ANCHOR_PATTERN)) {
    const attributes = match[1]!
    const body = match[2]!
    const className = attributeValue(attributes, 'class') ?? ''
    const classes = new Set(className.split(/\s+/))
    if (!classes.has('group') || !classes.has('grid') || !body.includes('<h3'))
      continue

    const href = attributeValue(attributes, 'href')
    if (!href) {
      malformedRows++
      continue
    }
    const pathname = skillsShPathname(href)
    if (!pathname) {
      malformedRows++
      continue
    }
    const segments = pathname.split('/').filter(Boolean)
    if (segments[0] === 'site') {
      ignoredWellKnown++
      continue
    }
    if (segments.length !== 3)
      continue

    const owner = decodedPathSegment(segments[0]!)
    const repo = decodedPathSegment(segments[1]!)
    const skill = decodedPathSegment(segments[2]!)
    const source = elementsWithClasses(body, 'p', ['font-mono'])[0] ?? ''
    const rankLabel = elementsWithClasses(body, 'span', ['font-mono'])
      .find(text => /^[\d,]+$/.test(text))
    const rank = rankLabel ? Number.parseInt(rankLabel.replaceAll(',', ''), 10) : 0

    if (!owner
      || !repo
      || !skill
      || !isGithubIdentity(owner, repo)
      || skill.length > 255
      || skill.includes('/')
      || source.toLowerCase() !== `${owner}/${repo}`.toLowerCase()
      || !Number.isSafeInteger(rank)
      || rank < 1) {
      malformedRows++
      continue
    }

    const key = `${view}:${owner.toLowerCase()}/${repo.toLowerCase()}/${skill}`
    if (seen.has(key))
      continue
    seen.add(key)
    entries.push({
      view,
      owner,
      repo,
      skill,
      rank,
      sourceUrl: `${SKILLS_SH_BASE_URL}${pathname}`,
      observedAt,
    })
  }

  if (malformedRows > 0)
    return { _tag: 'error', reason: 'malformed_skill_rows', malformedRows }
  if (entries.length === 0)
    return { _tag: 'error', reason: 'no_skill_rows', malformedRows: 0 }
  return {
    _tag: 'ok',
    entries: entries.slice(0, limit),
    ignoredWellKnown,
  }
}

export function parseSkillsShCrawlArgs(args: string[]): SkillsShCrawlArgsResult {
  const cleanArgs = args.filter(arg => arg !== '--')
  if (cleanArgs.includes('--help'))
    return { _tag: 'help' }

  const valuedArgs = cleanArgs.map((arg) => {
    const match = arg.match(/^--(apply|limit|view)=(.*)$/)
    return match
      ? { name: match[1]!, value: match[2]! }
      : null
  })
  const knownBooleanArgs = new Set(['--emit-sql'])
  if (cleanArgs.some((arg, index) => valuedArgs[index] == null && !knownBooleanArgs.has(arg)))
    return { _tag: 'error', reason: 'invalid_arguments' }

  const applyValues = valuedArgs
    .filter(arg => arg?.name === 'apply')
    .map(arg => arg!.value)
  const limitValues = valuedArgs
    .filter(arg => arg?.name === 'limit')
    .map(arg => arg!.value)
  const requestedViews = valuedArgs
    .filter(arg => arg?.name === 'view')
    .map(arg => arg!.value)
  if (applyValues.length > 1 || limitValues.length > 1)
    return { _tag: 'error', reason: 'invalid_arguments' }

  const apply = applyValues[0]
  if (apply != null && apply !== 'local' && apply !== 'remote')
    return { _tag: 'error', reason: 'invalid_apply_target' }
  const emitSql = cleanArgs.includes('--emit-sql')
  if (apply && emitSql)
    return { _tag: 'error', reason: 'apply_and_emit_sql_conflict' }

  const limit = limitValues[0] == null
    ? 500
    : Number(limitValues[0])
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    return { _tag: 'error', reason: 'invalid_limit' }

  if (requestedViews.some(view => view !== 'all' && !SKILLS_SH_VIEWS.includes(view as SkillsShView)))
    return { _tag: 'error', reason: 'invalid_view' }
  const views = requestedViews.length === 0 || requestedViews.includes('all')
    ? [...SKILLS_SH_VIEWS]
    : SKILLS_SH_VIEWS.filter(view => requestedViews.includes(view))

  return {
    _tag: 'ok',
    options: {
      apply: (apply as SkillsShApplyTarget | undefined) ?? null,
      emitSql,
      limit,
      views,
    },
  }
}

export function summarizeSkillsShEntries(entries: SkillsShEntry[]): {
  skillsObserved: number
  reposObserved: number
  views: SkillsShView[]
} {
  const repos = new Set(entries.map(entry => `${entry.owner.toLowerCase()}/${entry.repo.toLowerCase()}`))
  const presentViews = new Set(entries.map(entry => entry.view))
  return {
    skillsObserved: entries.length,
    reposObserved: repos.size,
    views: SKILLS_SH_VIEWS.filter(view => presentViews.has(view)),
  }
}

function sqlString(value: string): string {
  return `'${value.replaceAll('\'', '\'\'')}'`
}

function sqlValues(entries: SkillsShEntry[], runId: string): string[] {
  // The observation table has legacy non-null install columns. Write neutral
  // values until a later schema migration removes them. The crawler does not
  // read or preserve third-party install counts.
  return entries.map(entry => `(
    ${runId}, ${sqlString(entry.view)}, ${sqlString(entry.owner)}, ${sqlString(entry.repo)},
    ${sqlString(entry.skill)}, ${entry.rank}, '',
    0, ${sqlString(entry.sourceUrl)}, ${entry.observedAt}
  )`)
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  )
}

export function buildSkillsShImportSql(input: {
  runId: string
  crawledAt: number
  completedAt?: number
  entries: SkillsShEntry[]
  ignoredWellKnown?: number
}): string {
  const summary = summarizeSkillsShEntries(input.entries)
  if (summary.skillsObserved === 0)
    throw new Error('Cannot build a skills.sh import with no observations')

  const runId = sqlString(input.runId)
  const completedAt = input.completedAt ?? input.crawledAt
  const observationStatements = chunks(sqlValues(input.entries, runId), 100).map((values) => {
    return `INSERT INTO skills_sh_discovery_observations (
  run_id, view, owner, repo, skill, rank, installs_label,
  installs_estimate, source_url, observed_at
) VALUES
${values.join(',\n')}
ON CONFLICT(run_id, view, owner, repo, skill) DO UPDATE SET
  rank = excluded.rank,
  installs_label = excluded.installs_label,
  installs_estimate = excluded.installs_estimate,
  source_url = excluded.source_url,
  observed_at = excluded.observed_at;`
  })

  return [
    `-- skills.sh discovery run ${input.runId}`,
    `INSERT INTO skills_sh_crawl_runs (
  run_id, crawled_at, completed_at, status, views,
  skills_observed, repos_observed, ignored_well_known
) VALUES (
  ${runId}, ${input.crawledAt}, NULL, 'started',
  ${sqlString(JSON.stringify(summary.views))},
  ${summary.skillsObserved}, ${summary.reposObserved}, ${input.ignoredWellKnown ?? 0}
)
ON CONFLICT(run_id) DO UPDATE SET
  crawled_at = excluded.crawled_at,
  completed_at = NULL,
  status = 'started',
  views = excluded.views,
  skills_observed = excluded.skills_observed,
  repos_observed = excluded.repos_observed,
  ignored_well_known = excluded.ignored_well_known;`,
    ...observationStatements,
    `INSERT INTO discovery_candidates (
  owner, repo, source, first_discovered_at, last_discovered_at,
  outcome, retry_state, owner_verified
)
SELECT
  owner, repo, 'skills_sh', MIN(observed_at), MAX(observed_at),
  'pending', 'ready', 0
FROM skills_sh_discovery_observations
WHERE run_id = ${runId}
GROUP BY owner, repo
ON CONFLICT(owner, repo) DO UPDATE SET
  source = excluded.source,
  last_discovered_at = MAX(discovery_candidates.last_discovered_at, excluded.last_discovered_at),
  owner_verified = MAX(discovery_candidates.owner_verified, excluded.owner_verified);`,
    `UPDATE skills_sh_crawl_runs
SET status = 'complete', completed_at = ${completedAt}
WHERE run_id = ${runId};`,
    '',
  ].join('\n\n')
}

async function fetchSkillsShView(
  view: SkillsShView,
  observedAt: number,
  limit: number,
  deps: CrawlDependencies,
): Promise<SkillsShCrawlResult> {
  const url = `${SKILLS_SH_BASE_URL}${leaderboardPath(view)}`
  const fetched = await deps.fetch(url, {
    headers: {
      'accept': 'text/html',
      'user-agent': 'skilld.dev discovery crawler (+https://skilld.dev)',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
    .then(response => ({ _tag: 'response' as const, response }))
    .catch((error: unknown) => ({
      _tag: 'error' as const,
      detail: error instanceof Error ? error.message : String(error),
    }))
  if (fetched._tag === 'error')
    return { _tag: 'error', view, reason: 'fetch_failed', detail: fetched.detail }

  if (!fetched.response.ok) {
    return {
      _tag: 'error',
      view,
      reason: 'unexpected_status',
      detail: `HTTP ${fetched.response.status}`,
    }
  }
  const contentType = fetched.response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('text/html'))
    return { _tag: 'error', view, reason: 'invalid_content_type', detail: contentType || 'missing' }

  const body = await fetched.response.text()
    .then(html => ({ _tag: 'html' as const, html }))
    .catch((error: unknown) => ({
      _tag: 'error' as const,
      detail: error instanceof Error ? error.message : String(error),
    }))
  if (body._tag === 'error')
    return { _tag: 'error', view, reason: 'fetch_failed', detail: body.detail }
  if (body.html.length > MAX_HTML_CHARS) {
    return {
      _tag: 'error',
      view,
      reason: 'content_too_large',
      detail: `${body.html.length} characters`,
    }
  }

  const parsed = parseSkillsShLeaderboardHtml(body.html, view, observedAt, limit)
  if (parsed._tag === 'error') {
    return {
      _tag: 'error',
      view,
      reason: parsed.reason,
      detail: `${parsed.malformedRows} malformed rows`,
    }
  }
  return parsed
}

export async function crawlSkillsSh(
  options: Pick<SkillsShCrawlOptions, 'limit' | 'views'>,
  observedAt: number,
  deps: CrawlDependencies = { fetch: globalThis.fetch },
): Promise<SkillsShCrawlResult> {
  const results = await Promise.all(
    options.views.map(view => fetchSkillsShView(view, observedAt, options.limit, deps)),
  )
  const failed = results.find(result => result._tag === 'error')
  if (failed?._tag === 'error')
    return failed

  const successful = results.filter(
    (result): result is Extract<SkillsShCrawlResult, { _tag: 'ok' }> => result._tag === 'ok',
  )
  return {
    _tag: 'ok',
    entries: successful.flatMap(result => result.entries),
    ignoredWellKnown: successful.reduce((total, result) => total + result.ignoredWellKnown, 0),
  }
}
