import { createHmac, randomBytes } from 'node:crypto'
import { z } from 'zod'

const identifier = z.string().min(1).max(100).regex(/^[\w.-]+$/)
const evidenceSchema = z.object({
  url: z.url().max(2000).refine(value => ['https://x.com', 'https://twitter.com', 'https://bsky.app', 'https://news.ycombinator.com'].includes(new URL(value).origin)),
  platform: z.enum(['x', 'bsky', 'hn']),
})
const feedRow = z.object({
  owner: identifier,
  repo: identifier,
  name: identifier,
  registryPath: z.string().regex(/^\/gh\/[\w./-]+$/),
  authorCount: z.number().int().nonnegative(),
  attribution: z.enum(['social', 'github', 'both']),
  evidence: evidenceSchema.nullable(),
})
const feedSchema = z.object({ computedAt: z.number().int(), namedSkills: z.array(feedRow) })
const detailSchema = z.object({
  owner: identifier,
  repository: identifier,
  name: identifier,
  sourceUrl: z.url().max(2000),
  repositoryUrl: z.url(),
  sourceGone: z.boolean(),
  runCommand: z.string().max(300).regex(/^npx skilld run [\w./-]+$/),
})
export const socialSkillSchema = feedRow.extend({ evidence: evidenceSchema, sourceUrl: detailSchema.shape.sourceUrl, runCommand: detailSchema.shape.runCommand })
export type SocialSkill = z.infer<typeof socialSkillSchema>

export function assertWeeklyClaim(value: unknown, runId: string): void {
  const claims = z.object({
    total_count: z.number().int().nonnegative(),
    artifacts: z.array(z.object({ workflow_run: z.object({ id: z.number().int() }) })),
  }).parse(value)
  if (claims.total_count !== 1 || claims.artifacts.length !== 1 || String(claims.artifacts[0]?.workflow_run.id) !== runId)
    throw new Error('This run does not own the weekly claim')
}

export function weekOf(now: Date): string {
  const monday = new Date(now)
  monday.setUTCHours(0, 0, 0, 0)
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  return monday.toISOString().slice(0, 10)
}

async function readJson(url: string, fetchImpl: typeof fetch, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000) })
  if (!response.ok)
    throw new Error(`Social API request failed: HTTP ${response.status}`)
  return response.json()
}

export async function loadWeeklySocial({ now, fetchImpl = fetch }: { now: Date, fetchImpl?: typeof fetch }) {
  const feed = feedSchema.parse(await readJson('https://skilld.dev/api/feed/trending?window=168&limit=20', fetchImpl))
  const age = now.getTime() / 1000 - feed.computedAt
  if (age > 3600 || age < -60)
    throw new Error('Trending feed is stale')
  const seen = new Set<string>()
  const rows = feed.namedSkills.filter((row) => {
    const key = `${row.owner}/${row.repo}/${row.name}`.toLowerCase()
    if (row.attribution === 'github' || row.authorCount === 0 || row.evidence === null || seen.has(key))
      return false
    seen.add(key)
    return true
  }).slice(0, 5)
  const skills: SocialSkill[] = []
  for (const row of rows) {
    if (row.evidence === null)
      continue
    const path = [row.owner, row.repo, row.name].map(encodeURIComponent).join('/')
    const detail = detailSchema.parse(await readJson(`https://skilld.dev/api/v1/skills/${path}`, fetchImpl))
    const source = new URL(detail.sourceUrl)
    const repository = new URL(detail.repositoryUrl)
    if (source.origin !== 'https://github.com'
      || repository.origin !== 'https://github.com'
      || !/^\/[\w.-]+\/[\w.-]+$/.test(repository.pathname)
      || !source.pathname.toLowerCase().startsWith(`${repository.pathname}/blob/`.toLowerCase())
      || detail.owner.toLowerCase() !== row.owner.toLowerCase()
      || detail.repository.toLowerCase() !== row.repo.toLowerCase()
      || detail.name !== row.name) {
      throw new Error('Skill source does not match its repository')
    }
    if (!detail.sourceGone)
      skills.push({ ...row, evidence: row.evidence, sourceUrl: detail.sourceUrl, runCommand: detail.runCommand })
  }
  return { skills, computedAt: feed.computedAt }
}

export function buildWeeklySocial(skills: SocialSkill[], now: Date) {
  const week = weekOf(now)
  if (skills.length === 0)
    return { _tag: 'empty' as const, week }
  const selected = skills.slice(0, 3)
  const renderX = () => [
    'Trending agent skills this week:',
    '',
    ...selected.map((skill, index) => `${index + 1}. ${skill.owner}/${skill.name}\n${skill.sourceUrl}\n${skill.evidence.url}`),
    '',
    'Read and run: https://skilld.dev/skills/trending',
  ].join('\n')
  while (renderX().replace(/https:\/\/\S+/g, 'x'.repeat(23)).length > 280) {
    selected.pop()
    if (selected.length === 0)
      throw new Error('Skill identity exceeds the X post limit')
  }
  const discordRows: string[] = []
  for (const [index, skill] of skills.slice(0, 5).entries()) {
    const row = [
      `**${index + 1} · [${skill.owner}/${skill.name}](https://skilld.dev${skill.registryPath})** · [${skill.authorCount} ${skill.authorCount === 1 ? 'dev' : 'devs'}](${skill.evidence.url})`,
      `[Source](${skill.sourceUrl}) · \`${skill.runCommand}\``,
    ].join('\n')
    if ([...discordRows, row].join('\n\n').length > 4096) {
      if (discordRows.length === 0)
        throw new Error('Skill provenance exceeds the Discord message limit')
      break
    }
    discordRows.push(row)
  }
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(now)
  return {
    _tag: 'ready' as const,
    week,
    x: { text: renderX() },
    discord: {
      username: 'skilld',
      avatar_url: 'https://skilld.dev/logo-icon.png',
      content: '',
      allowed_mentions: { parse: [] as string[] },
      embeds: [{
        title: 'Trending skills this week',
        url: 'https://skilld.dev/skills/trending',
        color: 0xE11D48,
        description: discordRows.join('\n\n'),
        footer: { text: `7-day social mentions · ${date}` },
      }],
    },
  }
}

export interface XCredentials {
  consumerKey: string
  consumerSecret: string
  accessToken: string
  accessSecret: string
}
export type SocialDestination
  = | { _tag: 'x', username: string, credentials: XCredentials }
    | { _tag: 'discord', webhookUrl: string, channelId: string }

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** JSON bodies are excluded from OAuth 1.0a's normalized parameters. */
export function oauthHeader(method: string, url: string, credentials: XCredentials, clock = {
  nonce: randomBytes(16).toString('hex'),
  timestamp: Math.floor(Date.now() / 1000),
}): string {
  const target = new URL(url)
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_token: credentials.accessToken,
    oauth_nonce: clock.nonce,
    oauth_timestamp: String(clock.timestamp),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_version: '1.0',
  }
  const parameters = [...Object.entries(oauth), ...target.searchParams.entries()]
    .map(([key, value]) => [encode(key), encode(value)] as const)
    .sort(([ak, av], [bk, bv]) => ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1)
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  const baseUrl = `${target.origin}${target.pathname}`
  const signatureBase = [method.toUpperCase(), encode(baseUrl), encode(parameters)].join('&')
  oauth.oauth_signature = createHmac('sha1', `${encode(credentials.consumerSecret)}&${encode(credentials.accessSecret)}`)
    .update(signatureBase)
    .digest('base64')
  return `OAuth ${Object.entries(oauth).sort().map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(', ')}`
}

const discordWebhookSchema = z.url().refine((value) => {
  const url = new URL(value)
  return url.origin === 'https://discord.com' && /^\/api\/(?:v10\/)?webhooks\/\d+\/[\w-]+$/.test(url.pathname) && !url.search && !url.hash
}, 'Use a Discord channel webhook URL')

export function parseSocialDestination(destination: 'x' | 'discord', env: Record<string, string | undefined>): SocialDestination {
  if (destination === 'discord') {
    return { _tag: 'discord', webhookUrl: discordWebhookSchema.parse(env.SKILLD_WEEKLY_DISCORD_WEBHOOK), channelId: z.string().regex(/^\d+$/).parse(env.SKILLD_WEEKLY_DISCORD_CHANNEL_ID) }
  }
  return {
    _tag: 'x',
    username: z.string().regex(/^skilld\w{0,9}$/i).parse(env.SKILLD_WEEKLY_X_USERNAME || 'skilld_dev'),
    credentials: {
      consumerKey: z.string().min(1).parse(env.SKILLD_WEEKLY_X_API_KEY),
      consumerSecret: z.string().min(1).parse(env.SKILLD_WEEKLY_X_API_SECRET),
      accessToken: z.string().min(1).parse(env.SKILLD_WEEKLY_X_ACCESS_TOKEN),
      accessSecret: z.string().min(1).parse(env.SKILLD_WEEKLY_X_ACCESS_SECRET),
    },
  }
}

export async function verifySocialDestination(destination: SocialDestination, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (destination._tag === 'x') {
    const url = 'https://api.x.com/2/users/me'
    const user = z.object({ data: z.object({ username: z.string() }) }).parse(await readJson(url, fetchImpl, {
      headers: { authorization: oauthHeader('GET', url, destination.credentials) },
    }))
    if (user.data.username.toLowerCase() !== destination.username.toLowerCase())
      throw new Error('X credentials belong to another account')
  }
  else {
    const webhook = z.object({ guild_id: z.string(), channel_id: z.string() }).parse(await readJson(destination.webhookUrl, fetchImpl))
    if (webhook.guild_id !== '931135234261532713' || webhook.channel_id !== destination.channelId)
      throw new Error('Discord webhook belongs to another server or channel')
  }
}

export async function publishWeeklySocial(destination: SocialDestination, post: ReturnType<typeof buildWeeklySocial>, fetchImpl: typeof fetch = fetch) {
  if (post._tag === 'empty')
    return { _tag: 'skipped' as const }
  await verifySocialDestination(destination, fetchImpl)
  const url = destination._tag === 'x' ? 'https://api.x.com/2/tweets' : `${destination.webhookUrl}?wait=true`
  const response = await readJson(url, fetchImpl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(destination._tag === 'x' ? { authorization: oauthHeader('POST', url, destination.credentials) } : {}) },
    body: JSON.stringify(destination._tag === 'x' ? post.x : post.discord),
  })
  const id = destination._tag === 'x'
    ? z.object({ data: z.object({ id: z.string() }) }).parse(response).data.id
    : z.object({ id: z.string() }).parse(response).id
  return { _tag: 'sent' as const, id }
}
