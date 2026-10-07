/**
 * MCP answers, shaped for a model instead of a program.
 *
 * The public API answers stay complete and stable for the CLI and the SDK.
 * An MCP client puts every answer into a model's context, so each tool gets
 * two compact forms built here from the API answer:
 *
 * - `text`: Markdown a model can relay as it is. Some clients read only this.
 * - `structured`: the same facts as typed data, checked against the tool's
 *   output schema. Empty, zero, and false fields are left out.
 *
 * Every Skill names its repository and links its skilld.dev page, so
 * provenance is one click away (VISION principle 1). Run commands come
 * before install commands, because running is the default.
 */
import type { OperationOutput } from 'skilld-sdk'
import type { indexRequestsV1, repositoriesV1, skillsV1, trackSummarySchema, tracksV1, trendingSkillSchema } from 'skilld-sdk/contract'
import type { InstallRef } from './mcp-install-command'
import { skillDetailSchema } from 'skilld-sdk/contract'
import { z } from 'zod'
import { installCommandFor, skillRunCommand } from './mcp-install-command'

type SearchAnswer = OperationOutput<typeof skillsV1.operations.search>
type SkillAnswer = OperationOutput<typeof skillsV1.operations.get>
type TrackAnswer = OperationOutput<typeof tracksV1.operations.get>
/**
 * skilld-sdk 0.1.2 types the items of these two answers as unknown, although
 * its client parses them with the schemas below. The types come from those schemas.
 */
export interface TrackListAnswer { items: z.output<typeof trackSummarySchema.client>[], total: number }
export interface TrendingAnswer { items: z.output<typeof trendingSkillSchema.client>[], total: number }
type RepositoryAnswer = OperationOutput<typeof repositoriesV1.operations.get>
type IndexRequestAnswer = OperationOutput<typeof indexRequestsV1.operations.create>
type SkillCardAnswer = TrackAnswer['items'][number]
type TrendingSignal = TrendingAnswer['items'][number]['signal']

export interface Presented<T> {
  text: string
  structured: T
}

/** Skill pages live on the public site, whatever API origin the tools call. */
const SITE_ORIGIN = 'https://skilld.dev'
const CARD_DESCRIPTION_CHARS = 160
const TRENDING_DESCRIPTION_CHARS = 100
const POST_EXCERPT_CHARS = 140
const SAFETY_NOTE = 'skilld shows where a skill comes from. It does not check whether a skill is safe.'

// --- schemas ---

const skillCardSchema = z.object({
  /** owner/repository/name, the ref every skilld command takes. */
  ref: z.string(),
  /** The display name, only when it differs from the name in the ref. */
  name: z.string().optional(),
  description: z.string().optional(),
  stars: z.number().int().optional(),
  pageUrl: z.string(),
  runCommand: z.string(),
})
type SkillCard = z.infer<typeof skillCardSchema>

export const searchOutputSchema = z.object({
  query: z.string(),
  total: z.number().int(),
  items: z.array(skillCardSchema),
})

export const skillOutputSchema = z.object({
  ref: z.string(),
  name: z.string().optional(),
  author: z.string(),
  description: z.string().optional(),
  stars: z.number().int().optional(),
  pageUrl: z.string(),
  sourceUrl: z.string().optional(),
  sourceCommit: z.string().optional(),
  skillPath: z.string().optional(),
  /** YYYY-MM-DD of the last change to the Skill. */
  lastChanged: z.string().optional(),
  /** YYYY-MM-DD of the last push to its Repository. */
  lastPushed: z.string().optional(),
  license: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  files: z.array(z.object({ path: z.string(), size: z.number().int() })).optional(),
  behaviors: skillDetailSchema.client.shape.behaviors.optional(),
  /** Present only when the SKILL.md is gone upstream and this is the last copy. */
  sourceGone: z.literal(true).optional(),
  runCommand: z.string(),
  installCommand: z.string(),
  skillMarkdown: z.string().optional(),
})

export const trackListOutputSchema = z.object({
  total: z.number().int(),
  items: z.array(z.object({
    slug: z.string(),
    label: z.string(),
    goal: z.string(),
    pageUrl: z.string(),
    skillCount: z.number().int(),
  })),
})

export const trackOutputSchema = z.object({
  slug: z.string(),
  label: z.string(),
  goal: z.string(),
  pageUrl: z.string(),
  total: z.number().int(),
  offset: z.number().int(),
  items: z.array(skillCardSchema),
})

/** The post that put a row on the board. Its excerpt is in the text answer only. */
const postSchema = z.object({
  url: z.string(),
  platform: z.enum(['x', 'bsky']),
  author: z.string(),
  /** YYYY-MM-DD */
  date: z.string(),
})

const reasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('social'), devs: z.number().int(), posts: z.number().int(), post: postSchema }),
  z.object({ kind: z.literal('star-surge'), starGain: z.number().int(), surgedOn: z.string() }),
  z.object({ kind: z.literal('social-and-star-surge'), devs: z.number().int(), posts: z.number().int(), post: postSchema, starGain: z.number().int(), surgedOn: z.string() }),
  z.object({ kind: z.literal('star-count') }),
])
type Reason = z.infer<typeof reasonSchema>

export const trendingOutputSchema = z.object({
  window: z.enum(['week', 'month']),
  total: z.number().int(),
  items: z.array(skillCardSchema.extend({ rank: z.number().int(), reason: reasonSchema })),
})

export const repositoryOutputSchema = z.object({
  ref: z.string(),
  description: z.string().optional(),
  stars: z.number().int().optional(),
  lastPushed: z.string().optional(),
  pageUrl: z.string(),
  repositoryUrl: z.string(),
  installCommand: z.string(),
  total: z.number().int(),
  items: z.array(skillCardSchema),
})

export const indexRequestOutputSchema = z.object({
  status: z.enum(['indexed', 'queued']),
  repository: z.string(),
  pageUrl: z.string(),
  skillCount: z.number().int().optional(),
  id: z.string().optional(),
  stage: z.enum(['queued', 'checking', 'indexing']).optional(),
  indexed: z.number().int().optional(),
  indexTotal: z.number().int().optional(),
  statusUrl: z.string().optional(),
})

export const installCommandOutputSchema = z.object({
  ref: z.string(),
  kind: z.enum(['skill', 'repo']),
  runCommand: z.string().optional(),
  command: z.string(),
})

// --- helpers ---

/** Collapses whitespace and cuts at the last word boundary before `max`. */
export function trimText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max)
    return flat
  const cut = flat.slice(0, max)
  const boundary = cut.lastIndexOf(' ')
  // A text with no early space is cut mid-word rather than to almost nothing.
  const kept = boundary > max / 2 ? cut.slice(0, boundary) : cut
  return `${kept.trimEnd()}…`
}

function day(iso: string | null | undefined): string | undefined {
  return iso ? iso.slice(0, 10) : undefined
}

function count(n: number, noun: string): string {
  return `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`
}

/** A fence longer than any backtick run inside, so the Skill's own code blocks stay inside it. */
function fence(markdown: string): string {
  const longest = Math.max(0, ...[...markdown.matchAll(/`+/g)].map(match => match[0].length))
  return '`'.repeat(Math.max(3, longest + 1))
}

/** Leaves out `undefined` values so the structured answer carries only real facts. */
function compact<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T
}

function skillPageUrl(owner: string, repository: string, name: string): string {
  return `${SITE_ORIGIN}/gh/${owner}/${repository}/${name}`
}

function cardFromAnswer(skill: SkillCardAnswer, options: { descriptionChars?: number, withStars?: boolean } = {}): SkillCard {
  const { descriptionChars = CARD_DESCRIPTION_CHARS, withStars = true } = options
  return compact({
    ref: `${skill.owner}/${skill.repository}/${skill.name}`,
    name: skill.displayName !== skill.name ? skill.displayName : undefined,
    description: skill.description ? trimText(skill.description, descriptionChars) : undefined,
    stars: withStars && skill.stars > 0 ? skill.stars : undefined,
    pageUrl: skill.pageUrl,
    runCommand: skill.runCommand,
  })
}

/** `1. [**name**](page) · owner/repository · 96 stars`, then the description and the run command. */
function cardLines(card: SkillCard, position: number, options: { showRepository?: boolean } = {}): string[] {
  const { showRepository = true } = options
  const [owner, repository, name] = card.ref.split('/') as [string, string, string]
  const heading = [
    `[**${card.name ?? name}**](${card.pageUrl})`,
    showRepository ? `${owner}/${repository}` : undefined,
    card.stars ? count(card.stars, 'star') : undefined,
  ].filter(Boolean).join(' · ')
  return [
    `${position}. ${heading}`,
    ...(card.description ? [`   ${card.description}`] : []),
    `   Run: \`${card.runCommand}\``,
  ]
}

// --- presenters ---

export function presentSearch(query: string, answer: SearchAnswer): Presented<z.infer<typeof searchOutputSchema>> {
  const items = answer.items.map((item) => {
    const { owner, repository, selector } = item.source
    return compact({
      ref: `${owner}/${repository}/${selector.name}`,
      description: item.description ? trimText(item.description, CARD_DESCRIPTION_CHARS) : undefined,
      stars: item.stargazerCount > 0 ? item.stargazerCount : undefined,
      pageUrl: skillPageUrl(owner, repository, selector.name),
      runCommand: skillRunCommand(owner, repository, selector.name),
    })
  })
  const heading = items.length
    ? `${count(answer.total, 'skill')} on skilld.dev match "${query}". Showing ${items.length}:`
    : `No skills on skilld.dev match "${query}".`
  return {
    text: [heading, ...items.flatMap((card, index) => cardLines(card, index + 1))].join('\n'),
    structured: { query, total: answer.total, items },
  }
}

export function presentSkill(answer: SkillAnswer): Presented<z.infer<typeof skillOutputSchema>> {
  const author = answer.authorName ?? answer.owner
  const structured = compact({
    ref: `${answer.owner}/${answer.repository}/${answer.name}`,
    name: answer.displayName !== answer.name ? answer.displayName : undefined,
    author,
    description: answer.description ? trimText(answer.description, CARD_DESCRIPTION_CHARS) : undefined,
    stars: answer.stars > 0 ? answer.stars : undefined,
    pageUrl: answer.pageUrl,
    sourceUrl: answer.sourceUrl ?? undefined,
    sourceCommit: answer.sourceCommit ?? undefined,
    skillPath: answer.skillPath ?? undefined,
    lastChanged: day(answer.updatedAt),
    lastPushed: day(answer.pushedAt),
    license: answer.license ?? undefined,
    allowedTools: answer.allowedTools.length ? answer.allowedTools : undefined,
    files: answer.files.length ? answer.files.map(file => ({ path: file.path, size: file.size })) : undefined,
    behaviors: answer.behaviors.length ? answer.behaviors : undefined,
    sourceGone: answer.sourceGone ? true as const : undefined,
    runCommand: answer.runCommand,
    installCommand: answer.installCommand,
    skillMarkdown: answer.markdown ?? undefined,
  })

  const freshness = [
    structured.lastChanged ? `Last skill change ${structured.lastChanged}` : undefined,
    structured.lastPushed ? `last repository push ${structured.lastPushed}` : undefined,
  ].filter(Boolean).join(' · ')
  const source = structured.sourceUrl
    ? `Source: ${structured.sourceUrl}${structured.sourceCommit ? ` (commit ${structured.sourceCommit.slice(0, 7)})` : ''}`
    : undefined
  const lines = [
    `**${answer.displayName}** by ${author} · ${answer.owner}/${answer.repository}${structured.stars ? ` · ${count(structured.stars, 'star')}` : ''}`,
    structured.description,
    `Page: ${answer.pageUrl}`,
    source,
    structured.sourceGone ? 'The SKILL.md is gone upstream. This is the last copy skilld read.' : undefined,
    freshness || undefined,
    structured.license ? `License: ${structured.license}` : undefined,
    structured.allowedTools ? `Allowed tools: ${structured.allowedTools.join(', ')}` : undefined,
    structured.files ? `Files beside SKILL.md: ${structured.files.map(file => file.path).join(', ')}` : undefined,
    ...(structured.behaviors?.map(behavior => `Skill behaviors: ${behavior.label} (${behavior.tier}, ${behavior.total} ${behavior.total === 1 ? 'match' : 'matches'}) · ${behavior.locations.map(location => location.line === null ? location.path : `${location.path}:${location.line}`).join(', ')}`) ?? []),
    `Run once: \`${answer.runCommand}\` (one session, writes no files)`,
    `Install: \`${answer.installCommand}\` (keeps it in the project)`,
    SAFETY_NOTE,
  ].filter((line): line is string => Boolean(line))
  if (structured.skillMarkdown) {
    const marker = fence(structured.skillMarkdown)
    lines.push('', 'SKILL.md text:', `${marker}markdown`, structured.skillMarkdown, marker)
  }
  return { text: lines.join('\n'), structured }
}

export function presentTrackList(answer: TrackListAnswer): Presented<z.infer<typeof trackListOutputSchema>> {
  const items = answer.items.map(track => ({
    slug: track.slug,
    label: track.label,
    goal: track.line,
    pageUrl: track.pageUrl,
    skillCount: track.skillCount,
  }))
  const lines = [
    `skilld has ${count(answer.total, 'track')}. Each is a page of skills for one kind of work.`,
    ...items.map(track => `- **${track.label}** (\`${track.slug}\`, ${count(track.skillCount, 'skill')}): ${track.goal} ${track.pageUrl}`),
  ]
  return { text: lines.join('\n'), structured: { total: answer.total, items } }
}

export function presentTrack(answer: TrackAnswer, offset: number): Presented<z.infer<typeof trackOutputSchema>> {
  const items = answer.items.map(skill => cardFromAnswer(skill))
  const range = items.length ? `${offset + 1}–${offset + items.length} of ${answer.total}` : `none of ${answer.total}`
  const lines = [
    `**${answer.label}** track (\`${answer.slug}\`): ${answer.line}`,
    `Page: ${answer.pageUrl}`,
    `Skills ${range}, in page order:`,
    ...items.flatMap((card, index) => cardLines(card, offset + index + 1)),
  ]
  return {
    text: lines.join('\n'),
    structured: { slug: answer.slug, label: answer.label, goal: answer.line, pageUrl: answer.pageUrl, total: answer.total, offset, items },
  }
}

type Post = Extract<TrendingSignal, { kind: 'social' }>['post']

function postFrom(post: Post): z.infer<typeof postSchema> {
  return { url: post.url, platform: post.platform, author: post.authorHandle, date: post.postedAt.slice(0, 10) }
}

function reasonFrom(signal: TrendingSignal): Reason {
  switch (signal.kind) {
    case 'social':
      return { kind: 'social', devs: signal.authorCount, posts: signal.mentionCount, post: postFrom(signal.post) }
    case 'star-surge':
      return { kind: 'star-surge', starGain: signal.starGain, surgedOn: signal.surgedOn.slice(0, 10) }
    case 'social-and-star-surge':
      return {
        kind: 'social-and-star-surge',
        devs: signal.authorCount,
        posts: signal.mentionCount,
        post: postFrom(signal.post),
        starGain: signal.starGain,
        surgedOn: signal.surgedOn.slice(0, 10),
      }
    case 'star-count':
      return { kind: 'star-count' }
  }
}

const NETWORK: Record<z.infer<typeof postSchema>['platform'], string> = { x: 'X', bsky: 'Bluesky' }

/** The post text a social row quotes, trimmed for the text answer. */
function postExcerpt(signal: TrendingSignal): string {
  return signal.kind === 'social' || signal.kind === 'social-and-star-surge' ? trimText(signal.post.text, POST_EXCERPT_CHARS) : ''
}

/** ADR-0004: every row says which route put it on the board, in its own words. */
function reasonLines(reason: Reason, excerpt: string): string[] {
  const talked = (devs: number, posts: number) => `${count(devs, 'dev')} talked about it in ${count(posts, 'post')}.`
  const surge = (gain: number, on: string) => `Its repository gained ${count(gain, 'GitHub star')} in a surge on ${on}.`
  const quote = (post: z.infer<typeof postSchema>) => `   Post: @${post.author} on ${NETWORK[post.platform]}, ${post.date}: "${excerpt}" ${post.url}`
  switch (reason.kind) {
    case 'social':
      return [`   Why: ${talked(reason.devs, reason.posts)}`, quote(reason.post)]
    case 'star-surge':
      return [`   Why: ${surge(reason.starGain, reason.surgedOn)}`]
    case 'social-and-star-surge':
      return [`   Why: ${talked(reason.devs, reason.posts)} ${surge(reason.starGain, reason.surgedOn)}`, quote(reason.post)]
    case 'star-count':
      return ['   Why: Nobody posted about it this period. It fills the board by GitHub stars.']
  }
}

export function presentTrending(window: 'week' | 'month', answer: TrendingAnswer): Presented<z.infer<typeof trendingOutputSchema>> {
  const items = answer.items.map((row, index) => ({
    rank: index + 1,
    ...cardFromAnswer(row, { descriptionChars: TRENDING_DESCRIPTION_CHARS }),
    reason: reasonFrom(row.signal),
  }))
  const lines = [
    `skilld.dev trending board, past ${window}. Showing ${items.length} of ${answer.total} in board order:`,
    ...items.flatMap((row, index) => {
      const [first, ...rest] = cardLines(row, row.rank)
      return [first!, ...reasonLines(row.reason, postExcerpt(answer.items[index]!.signal)), ...rest]
    }),
  ]
  return { text: lines.join('\n'), structured: { window, total: answer.total, items } }
}

export function presentRepository(answer: RepositoryAnswer, limit: number): Presented<z.infer<typeof repositoryOutputSchema>> {
  const items = answer.skills.slice(0, limit).map(skill => cardFromAnswer(skill, { withStars: false }))
  const structured = compact({
    ref: `${answer.owner}/${answer.repository}`,
    description: answer.description ? trimText(answer.description, CARD_DESCRIPTION_CHARS) : undefined,
    stars: answer.stars > 0 ? answer.stars : undefined,
    lastPushed: day(answer.pushedAt),
    pageUrl: answer.pageUrl,
    repositoryUrl: answer.repositoryUrl,
    installCommand: answer.installCommand,
    total: answer.skills.length,
    items,
  })
  const facts = [
    `**${structured.ref}**`,
    structured.stars ? count(structured.stars, 'star') : undefined,
    structured.lastPushed ? `last push ${structured.lastPushed}` : undefined,
  ].filter(Boolean).join(' · ')
  const lines = [
    facts,
    structured.description,
    `Page: ${structured.pageUrl} · GitHub: ${structured.repositoryUrl}`,
    `Install every skill: \`${structured.installCommand}\``,
    `Skills ${items.length} of ${structured.total}, most recently changed first:`,
    ...items.flatMap((card, index) => cardLines(card, index + 1, { showRepository: false })),
  ].filter((line): line is string => Boolean(line))
  return { text: lines.join('\n'), structured }
}

export function presentIndexRequest(answer: IndexRequestAnswer): Presented<z.infer<typeof indexRequestOutputSchema>> {
  const repository = `${answer.owner}/${answer.repository}`
  const pageUrl = `${SITE_ORIGIN}/gh/${repository}`
  if (answer.status === 'indexed') {
    return {
      text: `${repository} is already in the skilld.dev registry with ${count(answer.skills.length, 'skill')}. Nothing was queued. Page: ${pageUrl}`,
      structured: { status: 'indexed', repository, skillCount: answer.skills.length, pageUrl },
    }
  }
  const statusUrl = `${SITE_ORIGIN}/api/v1/index-requests/${answer.id}`
  const { progress } = answer
  const stage = progress.stage === 'indexing'
    ? `indexing (${progress.indexed} of ${count(progress.total, 'skill')})`
    : progress.stage
  return {
    text: [
      `Queued ${repository} for indexing. Stage: ${stage}.`,
      `Status: ${statusUrl}`,
      'A person reviews which skills the registry admits. Nothing in the repository changes.',
      `Page after indexing: ${pageUrl}`,
    ].join('\n'),
    structured: compact({
      status: 'queued' as const,
      repository,
      pageUrl,
      id: answer.id,
      stage: progress.stage,
      indexed: progress.stage === 'indexing' ? progress.indexed : undefined,
      indexTotal: progress.stage === 'indexing' ? progress.total : undefined,
      statusUrl,
    }),
  }
}

export function presentInstallCommand(ref: InstallRef, raw: string): Presented<z.infer<typeof installCommandOutputSchema>> {
  const command = installCommandFor(ref)
  if (ref.kind === 'skill') {
    const runCommand = skillRunCommand(ref.owner, ref.repo, ref.name)
    return {
      text: [
        `Run once, in the project root: \`${runCommand}\``,
        'skilld run gives a coding agent the skill for one session and writes no files.',
        `Install it for every session: \`${command}\``,
        'You run these commands. This tool ran nothing.',
      ].join('\n'),
      structured: { ref: raw, kind: 'skill', runCommand, command },
    }
  }
  return {
    text: [
      `Install every skill from the repository, in the project root: \`${command}\``,
      'You run this command. This tool ran nothing.',
    ].join('\n'),
    structured: { ref: raw, kind: 'repo', command },
  }
}
