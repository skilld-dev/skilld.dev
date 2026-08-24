/**
 * The weekly email, rendered as plain HTML tables.
 *
 * Pure and side-effect free so the worker hot path stays cheap and so the
 * preview route can render every scenario without a database. Every colour,
 * radius, and font here traces back to DESIGN.md: warm stone neutrals, rose as
 * a <=10% accent, IBM Plex Mono for chrome and Plus Jakarta Sans for content,
 * 8px radius everywhere except avatars.
 *
 * Email clients ignore most CSS, so the tokens live in one place below and get
 * inlined at every use rather than being set through classes.
 */

import type { WeeklyPlacement } from './weekly-tracking'
import { trackedUrl } from './weekly-tracking'

export type WeeklyTheme = 'light' | 'dark'

/**
 * Two palettes, both from DESIGN.md.
 *
 * Light is what the Monday send uses, because inline styles are the only thing
 * every mail client honours and a client that forces its own dark mode will
 * invert this one anyway. Dark exists so the preview embedded in the site can
 * match the page around it instead of sitting on it as a white rectangle.
 */
interface Tokens {
  page: string
  surface: string
  border: string
  borderStrong: string
  text: string
  body: string
  muted: string
  faint: string
  accent: string
  onAccent: string
  quote: string
  /** The brand rule above the footer. Same rose in both themes; it reads on each. */
  mark: string
}

const PALETTE: Record<WeeklyTheme, Tokens> = {
  light: {
    page: '#f5f4f2',
    surface: '#ffffff',
    border: '#e7e5e4',
    borderStrong: '#d6d3d1',
    text: '#1c1917',
    body: '#44403c',
    muted: '#6b625c',
    faint: '#6b625c',
    accent: '#be123c',
    onAccent: '#ffffff',
    quote: '#fafaf9',
    mark: '#fb7185',
  },
  dark: {
    page: '#14110d',
    surface: '#1c1917',
    border: '#3a342c',
    borderStrong: '#4d453b',
    text: '#ede9e4',
    body: '#cdc6bd',
    muted: '#9c9389',
    faint: '#7a726a',
    // Rose 400 rather than the darkened 500: on a warm near-black the darker
    // token loses too much contrast, and white on it fails AA the other way.
    accent: '#fb7185',
    onAccent: '#1c1917',
    quote: '#211d18',
    mark: '#fb7185',
  },
}

const SANS = `'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
const MONO = `'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`

/**
 * Why a skill is on the trending list, as one value rather than a bag of
 * nullable counters.
 *
 * The distinction is not cosmetic. `named` means a person wrote the skill's
 * name in a post. `stars` means the repository surged and holds exactly one
 * skill, so nobody named anything. An earlier version of the trending page put
 * both under a heading reading "Named by developers", which was false for
 * every star row on it. The email states the route per row for the same
 * reason.
 */
export type WeeklyReason
  = { _tag: 'named', authorCount: number, mentionCount: number, latestAt: number }
    | { _tag: 'stars', gain: number, day: number }
    | {
      _tag: 'named-and-stars'
      authorCount: number
      mentionCount: number
      latestAt: number
      gain: number
      day: number
    }
    | { _tag: 'popular', stars: number }

export interface WeeklyEvidence {
  url: string
  authorHandle: string
  text: string
  platform: 'x' | 'bsky'
}

export interface WeeklyTrendingSkill {
  owner: string
  repo: string
  slug: string
  canonicalName: string
  description: string | null
  stars: number | null
  /** Exact current SKILL.md source. */
  sourceUrl?: string
  reason: WeeklyReason
  evidence: WeeklyEvidence | null
}

export interface WeeklyLikedChange {
  owner: string
  repo: string
  name: string
  slug: string
  description: string | null
  changeCount: number
  /** Unix seconds of the most recent change. */
  changedAt: number
  /**
   * Commit subjects from the window, newest first.
   *
   * The subjects are the news. "3 changes" tells a reader something happened;
   * "Replace the FID section with INP" tells them whether they care. Capped by
   * the caller, and empty when every revision in the window landed without a
   * message.
   */
  commitMessages: string[]
  /** Exact current SKILL.md source. */
  sourceUrl?: string
  /** The latest revision that caused this row. */
  changeUrl?: string
}

export interface WeeklyRenderInput {
  /** Product label. The default keeps the public weekly preview unchanged. */
  edition?: 'weekly' | 'digest'
  /**
   * Who it is addressed to, or null when nobody.
   *
   * The homepage demo and the public preview render the same email with no
   * recipient. Passing a placeholder login instead produced "Hey you, you have
   * not liked any skills yet" on a marketing surface: the empty state, correct
   * for a real send and wrong as a first impression.
   */
  login?: string | null
  /** A person's display name. Omit the greeting when unavailable. */
  recipientName?: string | null
  /**
   * Recipient id, carried on tracked links so a click can be attributed.
   * Null for the admin preview, which must not write click rows.
   */
  userId?: number | null
  /** Unix seconds. */
  windowStart: number
  /** Unix seconds. */
  windowEnd: number
  /** Changes to skills this person liked. Capped by the caller at 5. */
  likedChanges: WeeklyLikedChange[]
  /** Liked skills that changed beyond the ones listed. */
  likedOverflow: number
  /**
   * Liked skills this email could have reported on, changed or not.
   *
   * Without it a quiet week and an empty account render identically, and they
   * are opposite states: one means the product watched thirty things and found
   * nothing, the other means it was never given anything to watch. The first
   * deserves a report, the second deserves an ask.
   */
  trackedCount: number
  trending: WeeklyTrendingSkill[]
  siteUrl: string
  unsubscribeUrl: string
  settingsUrl: string
  /** Defaults to light, which is what the Monday send uses. */
  theme?: WeeklyTheme
}

export interface WeeklyRender {
  subject: string
  html: string
  text: string
  /**
   * The email card on its own, with no document wrapper.
   *
   * The homepage embeds this so the band cannot drift from what the email
   * sends. A screenshot would have gone stale on the first row-style edit, and
   * this template changed on four consecutive days while it was being built.
   */
  card: string
}

/** The weekly stays scannable while showing enough breadth to be useful. */
export const MAX_WEEKLY_TRENDING = 7

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function day(epoch: number): { day: number, month: string } {
  const date = new Date(epoch * 1000)
  return { day: date.getUTCDate(), month: MONTHS[date.getUTCMonth()]! }
}

/** "18\u201324 Aug", or "29 Jul \u2013 4 Aug" when the window straddles a month. */
export function formatWindow(start: number, end: number): string {
  const from = day(start)
  const to = day(end)
  return from.month === to.month
    ? `${from.day}\u2013${to.day} ${to.month}`
    : `${from.day} ${from.month} \u2013 ${to.day} ${to.month}`
}

/** Whole days between a change and the email going out. */
function relativeDay(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400)
  if (days <= 0)
    return 'today'
  if (days === 1)
    return 'yesterday'
  return `${days}d ago`
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/**
 * Star counts short enough to sit in a metadata line.
 *
 * Carried to millions because repositories reach them: 1284000 rendered as
 * "1284k stars", which is not a number anyone reads.
 */
function compactCount(value: number): string {
  if (value < 1000)
    return String(value)
  if (value < 1_000_000)
    return `${short(value / 1000)}k`
  return `${short(value / 1_000_000)}m`
}

function short(value: number): string {
  return value < 10 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value))
}

/**
 * The claim a row is allowed to make, in the reader's words.
 *
 * Kept exported so the plain-text half and the tests read the same sentence
 * the HTML does, rather than two drifting copies of the same rule.
 */
export function reasonLine(reason: WeeklyReason, now: number): string {
  switch (reason._tag) {
    case 'named':
      return `${reason.authorCount} ${plural(reason.authorCount, 'account', 'accounts')} mentioned it${mentionAge(reason.latestAt, now)}`
    case 'stars':
      return `+${compactCount(reason.gain)} stars ${relativeDay(reason.day, now)}`
    case 'named-and-stars':
      return `${reason.authorCount} ${plural(reason.authorCount, 'account', 'accounts')} mentioned it${mentionAge(reason.latestAt, now)} \u00B7 +${compactCount(reason.gain)} stars ${relativeDay(reason.day, now)}`
    case 'popular':
      return `${compactCount(reason.stars)} stars, no posts this week`
  }
}

/** Metadata segments, middle-dot separated, with the empty ones dropped. */
function joinMeta(parts: Array<string | null>): string {
  return parts.filter(Boolean).join(' \u00B7 ')
}

/**
 * The quiet line under a trending skill.
 *
 * `popular` already says the star count in its own sentence, so appending the
 * count again produced rows reading "47k stars, no posts this week \u00B7 47k stars".
 */
function trendingMeta(skill: WeeklyTrendingSkill, now: number): string {
  const stars = skill.stars === null || skill.reason._tag === 'popular'
    ? null
    : `${compactCount(skill.stars)} stars`
  return joinMeta([`${skill.owner}/${skill.repo}`, reasonLine(skill.reason, now), stars])
}

/**
 * A skill description cut to something a person reads in one glance.
 *
 * SKILL.md descriptions are written for an agent deciding whether to load the
 * file, so they run long: production served one at 620 characters, which took
 * six lines of the email on its own. Cut on a word boundary so the tail is a
 * word rather than half of one.
 */
const MAX_DESCRIPTION = 140

export function trimDescription(value: string | null): string | null {
  const text = collapse(value ?? '')
  if (!text)
    return null
  if (text.length <= MAX_DESCRIPTION)
    return text
  const cut = text.slice(0, MAX_DESCRIPTION)
  const boundary = cut.lastIndexOf(' ')
  return `${(boundary > 60 ? cut.slice(0, boundary) : cut).replace(/[,.;:]$/, '')}\u2026`
}

/**
 * A quoted post with its link shorteners removed.
 *
 * A post ending in two `t.co` URLs reads as noise in an email: the row already
 * links to the skill, and the handle already links to the post.
 */
const MAX_QUOTE = 180

export function trimQuote(value: string): string {
  const withoutCommands = value.replace(
    /(?:^|\s)(?:npx|bunx|pnpm\s+(?:dlx|exec)|npm\s+(?:exec|x)|yarn\s+dlx)\s+skills\s+add\s+\S+/gi,
    ' ',
  )
  const text = collapse(withoutCommands.replace(/https?:\/\/\S+/g, ''))
  if (text.length <= MAX_QUOTE)
    return text
  const cut = text.slice(0, MAX_QUOTE - 1)
  const boundary = cut.lastIndexOf(' ')
  return `${(boundary > 60 ? cut.slice(0, boundary) : cut).trimEnd()}\u2026`
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * How old the newest mention is, when we know.
 *
 * A star row dates itself ("+449 stars today") and a named row did not, so in
 * an email headed with a week the reader could not tell whether five people
 * named something on Monday or six days ago. Zero means the loader had no
 * timestamp, and an invented one would be worse than none.
 *
 * Always says "latest". A bare age reads as the date they all posted, and it
 * is the date of the newest one: "2 devs talked about it yesterday" claims both
 * did something only one of them did.
 */
function mentionAge(latestAt: number, now: number): string {
  return latestAt ? ` \u00B7 latest ${relativeDay(latestAt, now)}` : ''
}

function avatarUrl(owner: string): string {
  return `https://github.com/${encodeURIComponent(owner)}.png?size=80`
}

function skillUrl(siteUrl: string, owner: string, repo: string, name: string): string {
  return `${siteUrl}/gh/${owner}/${repo}/${encodeURIComponent(name)}`
}

function sectionLabel(t: Tokens, text: string): string {
  return `<tr><td style="padding:28px 0 10px;"><h2 style="margin:0;font-family:${MONO};font-size:14px;line-height:1.5;letter-spacing:0.08em;text-transform:uppercase;color:${t.faint};">${esc(text)}</h2></td></tr>`
}

/**
 * One ledger row: avatar, title, description, metadata.
 *
 * Built as a two-cell table rather than a float so Outlook keeps the avatar
 * beside the text instead of stacking it. `valign="top"` on both cells is what
 * stops a two-line description from centring the face against it.
 */
function row(t: Tokens, options: {
  owner: string
  title: string
  href: string
  description: string | null
  /** Rendered content between the description and the metadata line. */
  body?: string
  meta: string
  extra?: string
  links?: string
}): string {
  const description = trimDescription(options.description)
  return `
<tr><td style="padding:14px 0;border-top:1px solid ${t.border};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td valign="top" width="44" style="width:44px;padding-right:12px;">
        <img src="${esc(avatarUrl(options.owner))}" width="36" height="36" alt=""
             style="width:36px;height:36px;border-radius:18px;display:block;border:1px solid ${t.border};background:${t.quote};" />
      </td>
      <td valign="top">
        <a href="${esc(options.href)}" style="display:inline-block;padding:11px 0;margin:-11px 0;font-family:${MONO};font-size:15px;line-height:1.45;font-weight:600;color:${t.text};text-decoration:underline;text-decoration-color:${t.borderStrong};text-underline-offset:3px;">${esc(options.title)}</a>
        ${description ? `<div style="margin-top:11px;font-family:${SANS};font-size:14px;line-height:1.55;color:${t.body};">${esc(description)}</div>` : ''}
        ${options.body ?? ''}
        <div style="margin-top:8px;font-family:${MONO};font-size:14px;line-height:1.55;color:${t.muted};font-variant-numeric:tabular-nums;">${esc(options.meta)}</div>
        ${options.links ?? ''}
        ${options.extra ?? ''}
      </td>
    </tr>
  </table>
</td></tr>`
}

/**
 * A dense trending row.
 *
 * Seven full editorial rows turned the email into a feed. The Skill name,
 * exact source, ranking reason, and evidence account stay. Descriptions,
 * quotes, and the duplicate source action remain in the plain-text version.
 */
function trendingRow(t: Tokens, options: {
  owner: string
  title: string
  href: string
  meta: string
  evidence: WeeklyEvidence | null
}): string {
  const evidence = options.evidence
    ? ` · <a href="${esc(options.evidence.url)}" style="display:inline-block;padding:12px 0;margin:-12px 0;color:${t.muted};text-decoration:underline;text-underline-offset:3px;">@${esc(options.evidence.authorHandle)} ${options.evidence.platform === 'x' ? 'on X' : 'on Bluesky'}</a>`
    : ''
  return `
<tr><td style="padding:10px 0;border-top:1px solid ${t.border};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td valign="top" width="36" style="width:36px;padding-right:10px;">
        <img src="${esc(avatarUrl(options.owner))}" width="28" height="28" alt=""
             style="width:28px;height:28px;border-radius:14px;display:block;border:1px solid ${t.border};background:${t.quote};" />
      </td>
      <td valign="top">
        <a href="${esc(options.href)}" style="display:inline-block;padding:11px 0;margin:-11px 0;font-family:${MONO};font-size:14px;line-height:1.45;font-weight:600;color:${t.text};text-decoration:underline;text-decoration-color:${t.borderStrong};text-underline-offset:3px;">${esc(options.title)}</a>
        <div style="margin-top:3px;font-family:${MONO};font-size:14px;line-height:1.45;color:${t.muted};font-variant-numeric:tabular-nums;">${esc(options.meta)}${evidence}</div>
      </td>
    </tr>
  </table>
</td></tr>`
}

/**
 * Commit subjects under a changed skill.
 *
 * A plain list rather than the quote treatment used for posts: these are not
 * somebody's words about the skill, they are the skill's own history, and
 * giving them the same left rule would make the two read as one kind of thing.
 */
const MAX_COMMITS = 3
const MAX_COMMIT_LENGTH = 90

export function commitSubjects(messages: readonly string[]): string[] {
  const seen = new Set<string>()
  const subjects: string[] = []
  for (const message of messages) {
    // A commit body in a one-line row is noise; the subject is the part its
    // author wrote to be read alone.
    const subject = collapse(message.split('\n')[0] ?? '')
    if (!subject || seen.has(subject))
      continue
    seen.add(subject)
    subjects.push(subject.length > MAX_COMMIT_LENGTH
      ? `${subject.slice(0, MAX_COMMIT_LENGTH - 1).trimEnd()}\u2026`
      : subject)
    if (subjects.length === MAX_COMMITS)
      break
  }
  return subjects
}

function commitList(t: Tokens, messages: readonly string[]): string {
  const subjects = commitSubjects(messages)
  if (!subjects.length)
    return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px;">${
    subjects.map(subject => `
    <tr>
      <td valign="top" width="16" style="width:16px;font-family:${MONO};font-size:14px;line-height:1.55;color:${t.faint};">&middot;</td>
      <td valign="top" style="font-family:${MONO};font-size:14px;line-height:1.55;color:${t.body};">${esc(subject)}</td>
    </tr>`).join('')
  }</table>`
}

/**
 * The post that named a skill, quoted.
 *
 * The quote is the evidence for the claim in the row above it, so it carries a
 * handle and a link back to the post. Without the link a reader has a sentence
 * in quotation marks and no way to check it.
 */
function button(t: Tokens, href: string, label: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;">
  <tr><td style="background:${t.accent};border-radius:8px;">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 18px;font-family:${MONO};font-size:14px;line-height:1.3;font-weight:600;color:${t.onAccent};text-decoration:none;">${esc(label)}</a>
  </td></tr>
</table>`
}

function rowLinks(t: Tokens, links: Array<{ href: string, label: string }>): string {
  return `<div style="margin-top:4px;font-family:${MONO};font-size:14px;line-height:20px;">${links.map(link =>
    `<a href="${esc(link.href)}" style="display:inline-block;padding:12px 12px 12px 0;color:${t.accent};text-decoration:underline;text-underline-offset:3px;">${esc(link.label)}</a>`,
  ).join('')}</div>`
}

/**
 * Names, then a count of what is left over.
 *
 * "vitest, tdd and 4 more" rather than "6 skills". The email is full of names
 * a reader recognises and a count is the one form of them that carries none of
 * that recognition into the inbox list.
 */
const SUBJECT_NAMES = 2

function nameList(names: readonly string[], extra: number): string {
  const shown = names.slice(0, SUBJECT_NAMES)
  const rest = names.length - shown.length + extra
  if (!shown.length)
    return ''
  if (rest > 0)
    return `${shown.join(', ')} and ${rest} more`
  return shown.length === 1 ? shown[0]! : `${shown[0]!} and ${shown[1]!}`
}

const LIKE_PROMPT = 'Like a Skill and it shows up here the week it changes.'

function subjectFor(input: WeeklyRenderInput): string {
  const edition = input.edition ?? 'weekly'
  // The liked half wins the subject when it has anything in it. Those are
  // skills this person chose; the trending half is a stranger's.
  if (input.likedChanges.length) {
    const names = nameList(input.likedChanges.map(change => change.name), input.likedOverflow)
    const verb = input.likedChanges.length + input.likedOverflow === 1 ? 'was' : 'were'
    return `skilld ${edition}: ${names} ${verb} updated`
  }
  if (input.trending.length)
    return `skilld ${edition}: ${nameList(input.trending.map(skill => skill.canonicalName), 0)}`
  return `skilld ${edition}: a quiet week`
}

/**
 * The line an inbox shows next to the subject.
 *
 * Deliberately not the greeting. This was `greeting(input)`, so the same
 * sentence appeared in the preview pane and then again as the first line of
 * the email, spending a free slot on an echo. It names whichever half the
 * subject did not.
 */
function preheader(input: WeeklyRenderInput): string {
  const trendingNames = nameList(input.trending.map(skill => skill.canonicalName), 0)
  if (input.likedChanges.length) {
    return input.trending.length
      ? `Also trending: ${trendingNames}.`
      : `${input.likedChanges.reduce((total, change) => total + change.changeCount, 0)} changes across the skills you like.`
  }
  if (input.trending.length) {
    return input.trackedCount
      ? `${trackedLine(input.trackedCount)}. Accounts mentioned ${trendingNames}.`
      : `Accounts mentioned ${trendingNames}.`
  }
  return input.trackedCount ? `${trackedLine(input.trackedCount)}.` : 'No updates this week.'
}

function greeting(input: WeeklyRenderInput): string {
  const liked = input.likedChanges.length + input.likedOverflow
  const trending = input.trending.length
  // With no recipient there is nothing true to say about what they like.
  if (!input.recipientName)
    return 'Updates from the Skills you like, plus trending Skills this week.'
  if (liked && trending)
    return `${liked} ${plural(liked, 'Skill you like was', 'Skills you like were')} updated.`
  if (liked)
    return `${liked} ${plural(liked, 'Skill you like was', 'Skills you like were')} updated this week.`
  if (trending) {
    return input.trackedCount
      ? 'Here are this week’s trending Skills.'
      : 'You have not liked any Skills yet. Here are this week’s trending Skills.'
  }
  return input.trackedCount
    ? 'A quiet week. Back next week.'
    : 'You have not liked any skills yet, and the week was quiet. Back next week.'
}

/**
 * What the liked section says when it has nothing to report.
 *
 * The section used to vanish, which read as though the email had forgotten the
 * half it promises. Naming the number turns an absence into a report: the
 * product watched these and found nothing, rather than finding nothing to say.
 */
function trackedLine(count: number): string {
  return `${count} ${plural(count, 'Skill', 'Skills')} tracked, no updates this week`
}

export function renderWeekly(input: WeeklyRenderInput): WeeklyRender {
  input = { ...input, trending: input.trending.slice(0, MAX_WEEKLY_TRENDING) }
  const t = PALETTE[input.theme ?? 'light']
  const now = input.windowEnd
  const window = formatWindow(input.windowStart, input.windowEnd)
  const subject = subjectFor(input)
  const edition = input.edition ?? 'weekly'
  const empty = !input.likedChanges.length && !input.trackedCount && !input.trending.length

  // Only the HTML is tracked. The plain-text part is read by clients that
  // often cannot follow a redirect cleanly, and a bare skilld.dev link is
  // worth more there than the measurement.
  const track = (url: string, placement: WeeklyPlacement): string => trackedUrl(
    { siteUrl: input.siteUrl, userId: input.userId ?? null, windowEnd: input.windowEnd },
    url,
    placement,
  )

  const likedRows = input.likedChanges.map((change) => {
    const subjects = commitSubjects(change.commitMessages)
    const sourceUrl = change.sourceUrl ?? skillUrl(input.siteUrl, change.owner, change.repo, change.name)
    return row(t, {
      owner: change.owner,
      title: change.name,
      href: sourceUrl,
      // The description explains the skill, and it only earns its line when
      // there are no commit subjects to explain what actually changed.
      description: subjects.length ? null : change.description,
      body: commitList(t, change.commitMessages),
      meta: joinMeta([
        `${change.owner}/${change.repo}`,
        `${change.changeCount} ${plural(change.changeCount, 'change', 'changes')}`,
        relativeDay(change.changedAt, now),
      ]),
      links: rowLinks(t, [
        ...(change.changeUrl ? [{ href: change.changeUrl, label: 'View change' }] : []),
        { href: sourceUrl, label: 'Open SKILL.md' },
      ]),
    })
  }).join('')

  const overflowRow = input.likedOverflow
    ? `<tr><td style="padding:12px 0 0;border-top:1px solid ${t.border};font-family:${MONO};font-size:14px;line-height:20px;color:${t.muted};">
         <a href="${esc(track(`${input.siteUrl}/me/likes`, 'overflow'))}" style="display:inline-block;padding:12px 0;color:${t.muted};text-decoration:underline;text-underline-offset:3px;">+${input.likedOverflow} more ${plural(input.likedOverflow, 'Skill', 'Skills')} you like were updated</a>
       </td></tr>`
    : ''

  // The section exists to report on liked skills, so when it has nothing to
  // report the email should say how to fill it. The fully-empty state already
  // does; this is the far more common case where trending carried the week and
  // the reader is never told the other half is theirs to populate.
  const quietRow = !input.likedChanges.length && input.trackedCount
    ? `<tr><td style="padding:14px 0;border-top:1px solid ${t.border};font-family:${MONO};font-size:14px;line-height:1.55;color:${t.muted};font-variant-numeric:tabular-nums;">${esc(trackedLine(input.trackedCount))}</td></tr>`
    : ''

  // Only when there is nothing to track. Telling someone who likes thirty
  // skills to go like a skill is the product failing to notice it worked.
  const likePrompt = !input.trackedCount && !input.likedChanges.length && input.trending.length
    ? `<tr><td style="padding:16px 0 0;border-top:1px solid ${t.border};font-family:${SANS};font-size:14px;line-height:1.55;color:${t.muted};">
         ${LIKE_PROMPT} <a href="${esc(track(`${input.siteUrl}/skills`, 'cta'))}" style="display:inline-block;padding:12px 0;line-height:20px;color:${t.accent};text-decoration:underline;text-underline-offset:3px;">Browse the registry</a>.
       </td></tr>`
    : ''

  const trendingRows = input.trending.map((skill) => {
    const sourceUrl = skill.sourceUrl ?? skillUrl(input.siteUrl, skill.owner, skill.repo, skill.canonicalName)
    return trendingRow(t, {
      owner: skill.owner,
      title: skill.canonicalName,
      href: sourceUrl,
      meta: trendingMeta(skill, now),
      evidence: skill.evidence,
    })
  }).join('')

  const body = empty
    ? `<tr><td style="padding:22px 0 4px;margin-top:16px;border-top:1px solid ${t.border};font-family:${SANS};font-size:14px;line-height:1.6;color:${t.body};">
         Like a few Skills and they will show up here the week they change.
         <a href="${esc(track(`${input.siteUrl}/skills`, 'cta'))}" style="display:inline-block;padding:12px 0;line-height:20px;color:${t.accent};text-decoration:underline;text-underline-offset:3px;">Browse the registry</a>.
       </td></tr>`
    : `${input.likedChanges.length || input.trackedCount
      ? `${sectionLabel(t, 'Skills you like')}${likedRows}${overflowRow}${quietRow}`
      : ''}${input.trending.length
      ? `${sectionLabel(t, 'Trending this week')}${trendingRows}${likePrompt}`
      : ''}`

  const shareUrl = track(`${input.siteUrl}/api/share/weekly`, 'share')
  const card = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:${t.surface};border:1px solid ${t.border};border-radius:8px;">
      <tr><td style="padding:22px 20px 26px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-bottom:1px solid ${t.border};padding-bottom:14px;">
          <tr>
            <!-- The mark is a hosted PNG because Gmail strips SVG. The nearby
                 wordmark carries the name when images are blocked. -->
            <td valign="middle" style="font-family:${MONO};font-size:14px;font-weight:600;color:${t.text};letter-spacing:-0.01em;">
              <a href="${esc(track(input.siteUrl, 'footer'))}" style="display:inline-block;padding:11px 0;color:${t.text};text-decoration:none;"><img src="${esc(input.siteUrl)}/logo-icon.png" width="22" height="22" alt="" style="display:inline-block;width:22px;height:22px;margin-right:9px;border:0;border-radius:5px;vertical-align:middle;" /><span style="vertical-align:middle;">skilld <span style="color:${t.faint};font-weight:400;">${edition}</span></span></a>
            </td>
            <td align="right" valign="middle" style="font-family:${MONO};font-size:14px;color:${t.faint};font-variant-numeric:tabular-nums;">${esc(window)}</td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:22px 0 8px;">
            <h1 style="margin:0;font-family:${SANS};font-size:20px;font-weight:600;line-height:1.35;color:${t.text};">${input.recipientName ? `Hi ${esc(input.recipientName)},` : 'Your Skill updates'}</h1>
            <div style="margin-top:6px;font-family:${SANS};font-size:14px;line-height:1.6;color:${t.body};">${esc(greeting(input))}</div>
          </td></tr>
          ${body}
        </table>

        ${input.trending.length ? button(t, track(`${input.siteUrl}/skills/trending`, 'cta'), 'Browse trending Skills') : ''}
        ${input.trending.length ? `<div style="font-family:${MONO};font-size:14px;line-height:20px;"><a href="${esc(shareUrl)}" style="display:inline-block;padding:12px 0;color:${t.muted};text-decoration:underline;text-underline-offset:3px;">Share this week’s board</a></div>` : ''}

      </td></tr>
      <tr><td style="height:3px;background:${t.mark};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:16px 20px 20px;border-top:1px solid ${t.border};font-family:${MONO};font-size:14px;line-height:1.7;color:${t.faint};">
        ${edition === 'weekly'
          ? 'You get this once a week because you have a skilld account.'
          : 'You get this because you enabled the digest.'}
        <a href="${esc(track(input.settingsUrl, 'footer'))}" style="display:inline-block;padding:12px 0;color:${t.muted};text-decoration:underline;text-underline-offset:3px;">Settings</a>
        &middot;
        <a href="${esc(input.unsubscribeUrl)}" style="display:inline-block;padding:12px 0;color:${t.muted};text-decoration:underline;text-underline-offset:3px;">Unsubscribe</a>
      </td></tr>
    </table>`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="${input.theme ?? 'light'}" />
<meta name="supported-color-schemes" content="${input.theme ?? 'light'}" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${t.page};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader(input))}</div>
<main role="main" aria-label="skilld ${edition}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${t.page};padding:24px 8px;">
  <tr><td align="center">
    ${card}
  </td></tr>
</table>
</main>
</body>
</html>`

  const text = renderWeeklyText(input)
  return { subject, html, text, card }
}

export function renderWeeklyText(input: WeeklyRenderInput): string {
  const now = input.windowEnd
  const lines: string[] = [
    `skilld ${input.edition ?? 'weekly'}  ${formatWindow(input.windowStart, input.windowEnd)}`,
    '',
    ...(input.recipientName ? [`Hi ${input.recipientName},`] : []),
    greeting(input),
  ]

  if (!input.likedChanges.length && input.trackedCount)
    lines.push('', 'SKILLS YOU LIKE', '', trackedLine(input.trackedCount))

  if (input.likedChanges.length) {
    lines.push('', 'SKILLS YOU LIKE', '')
    for (const change of input.likedChanges) {
      lines.push(`- ${change.owner}/${change.repo} ${change.name}`)
      const subjects = commitSubjects(change.commitMessages)
      if (subjects.length) {
        lines.push(...subjects.map(subject => `  * ${subject}`))
      }
      else {
        const description = trimDescription(change.description)
        if (description)
          lines.push(`  ${description}`)
      }
      lines.push(`  ${change.owner}/${change.repo}, ${change.changeCount} ${plural(change.changeCount, 'change', 'changes')}, ${relativeDay(change.changedAt, now)}`)
      if (change.changeUrl)
        lines.push(`  Change: ${change.changeUrl}`)
      lines.push(`  Source: ${change.sourceUrl ?? skillUrl(input.siteUrl, change.owner, change.repo, change.name)}`)
      lines.push('')
    }
    if (input.likedOverflow)
      lines.push(`+${input.likedOverflow} more you like were updated: ${input.siteUrl}/me/likes`, '')
  }

  if (input.trending.length) {
    lines.push('', 'TRENDING THIS WEEK', '')
    for (const skill of input.trending) {
      lines.push(`- ${skill.owner}/${skill.repo} ${skill.canonicalName}`)
      const description = trimDescription(skill.description)
      if (description)
        lines.push(`  ${description}`)
      lines.push(`  ${trendingMeta(skill, now)}`)
      if (skill.evidence)
        lines.push(`  “${trimQuote(skill.evidence.text)}” from @${skill.evidence.authorHandle}: ${skill.evidence.url}`)
      lines.push(`  Source: ${skill.sourceUrl ?? skillUrl(input.siteUrl, skill.owner, skill.repo, skill.canonicalName)}`)
      lines.push('')
    }
    if (!input.trackedCount)
      lines.push(LIKE_PROMPT, '')
    lines.push(`Full board: ${input.siteUrl}/skills/trending`, '')
  }

  lines.push('', `Settings: ${input.settingsUrl}`, `Unsubscribe: ${input.unsubscribeUrl}`)
  return lines.join('\n')
}
