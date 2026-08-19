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

const TOKEN = {
  page: '#f5f4f2',
  surface: '#ffffff',
  border: '#e7e5e4',
  borderStrong: '#d6d3d1',
  text: '#1c1917',
  body: '#44403c',
  muted: '#78716c',
  faint: '#a8a29e',
  accent: '#e11d48',
  // The brand mark's own rose, lighter than the accent on purpose. Used only
  // where the mark itself appears, so the two never sit side by side.
  mark: '#fb7185',
  quote: '#fafaf9',
} as const

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
}

export interface WeeklyRenderInput {
  login: string
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
  trending: WeeklyTrendingSkill[]
  siteUrl: string
  unsubscribeUrl: string
  settingsUrl: string
}

export interface WeeklyRender {
  subject: string
  html: string
  text: string
}

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
      return `${reason.authorCount} ${plural(reason.authorCount, 'person', 'people')} named it${mentionAge(reason.latestAt, now)}`
    case 'stars':
      return `+${compactCount(reason.gain)} stars ${relativeDay(reason.day, now)}`
    case 'named-and-stars':
      return `${reason.authorCount} ${plural(reason.authorCount, 'person', 'people')} named it${mentionAge(reason.latestAt, now)} \u00B7 +${compactCount(reason.gain)} stars ${relativeDay(reason.day, now)}`
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
  const text = collapse(value.replace(/https?:\/\/\S+/g, ''))
  return text.length <= MAX_QUOTE ? text : `${text.slice(0, MAX_QUOTE - 1).trimEnd()}\u2026`
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
 * is the date of the newest one: "2 people named it yesterday" claims both did
 * something only one of them did.
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

function sectionLabel(text: string): string {
  return `<tr><td style="padding:28px 0 10px;font-family:${MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${TOKEN.faint};">${esc(text)}</td></tr>`
}

/**
 * One ledger row: avatar, title, description, metadata.
 *
 * Built as a two-cell table rather than a float so Outlook keeps the avatar
 * beside the text instead of stacking it. `valign="top"` on both cells is what
 * stops a two-line description from centring the face against it.
 */
function row(options: {
  owner: string
  title: string
  href: string
  description: string | null
  /** Rendered content between the description and the metadata line. */
  body?: string
  meta: string
  extra?: string
}): string {
  const description = trimDescription(options.description)
  return `
<tr><td style="padding:14px 0;border-top:1px solid ${TOKEN.border};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td valign="top" width="44" style="width:44px;padding-right:12px;">
        <img src="${esc(avatarUrl(options.owner))}" width="36" height="36" alt="${esc(options.owner)}"
             style="width:36px;height:36px;border-radius:18px;display:block;border:1px solid ${TOKEN.border};background:${TOKEN.quote};" />
      </td>
      <td valign="top">
        <a href="${esc(options.href)}" style="font-family:${MONO};font-size:14px;font-weight:600;color:${TOKEN.text};text-decoration:none;">${esc(options.title)}</a>
        ${description ? `<div style="margin-top:4px;font-family:${SANS};font-size:13px;line-height:1.5;color:${TOKEN.body};">${esc(description)}</div>` : ''}
        ${options.body ?? ''}
        <div style="margin-top:6px;font-family:${MONO};font-size:11px;color:${TOKEN.muted};font-variant-numeric:tabular-nums;">${esc(options.meta)}</div>
        ${options.extra ?? ''}
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

function commitList(messages: readonly string[]): string {
  const subjects = commitSubjects(messages)
  if (!subjects.length)
    return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px;">${
    subjects.map(subject => `
    <tr>
      <td valign="top" width="12" style="width:12px;font-family:${MONO};font-size:11px;line-height:1.55;color:${TOKEN.faint};">&middot;</td>
      <td valign="top" style="font-family:${MONO};font-size:11.5px;line-height:1.55;color:${TOKEN.body};">${esc(subject)}</td>
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
function quote(evidence: WeeklyEvidence): string {
  const network = evidence.platform === 'x' ? 'on X' : 'on Bluesky'
  const text = trimQuote(evidence.text)
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:9px;">
  <tr><td style="border-left:2px solid ${TOKEN.borderStrong};padding:2px 0 2px 10px;">
    <div style="font-family:${SANS};font-size:13px;line-height:1.5;color:${TOKEN.body};">${esc(text)}</div>
    <div style="margin-top:4px;font-family:${MONO};font-size:11px;color:${TOKEN.muted};">
      <a href="${esc(evidence.url)}" style="color:${TOKEN.muted};text-decoration:none;">@${esc(evidence.authorHandle)} ${esc(network)}</a>
    </div>
  </td></tr>
</table>`
}

function button(href: string, label: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;">
  <tr><td style="background:${TOKEN.accent};border-radius:8px;">
    <a href="${esc(href)}" style="display:inline-block;padding:11px 18px;font-family:${MONO};font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(label)}</a>
  </td></tr>
</table>`
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

const LIKE_PROMPT = 'Like a skill and it shows up here the week it changes.'

function subjectFor(input: WeeklyRenderInput): string {
  // The liked half wins the subject when it has anything in it. Those are
  // skills this person chose; the trending half is a stranger's.
  if (input.likedChanges.length) {
    const names = nameList(input.likedChanges.map(change => change.name), input.likedOverflow)
    return `skilld weekly: ${names} changed`
  }
  if (input.trending.length)
    return `skilld weekly: ${nameList(input.trending.map(skill => skill.canonicalName), 0)}`
  return 'skilld weekly: a quiet week'
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
  if (input.trending.length)
    return `Nothing you like changed. People named ${trendingNames}.`
  return 'Nothing changed this week.'
}

function greeting(input: WeeklyRenderInput): string {
  const liked = input.likedChanges.length + input.likedOverflow
  const trending = input.trending.length
  if (liked && trending)
    return `${liked} ${plural(liked, 'skill you like', 'skills you like')} changed, and ${trending} more ${plural(trending, 'is', 'are')} getting talked about.`
  if (liked)
    return `${liked} ${plural(liked, 'skill you like', 'skills you like')} changed this week.`
  if (trending)
    return `Nothing you like changed, so here is what the ecosystem was talking about.`
  return 'Nothing you like changed and the ecosystem was quiet. Back next week.'
}

export function renderWeekly(input: WeeklyRenderInput): WeeklyRender {
  const now = input.windowEnd
  const window = formatWindow(input.windowStart, input.windowEnd)
  const subject = subjectFor(input)
  const empty = !input.likedChanges.length && !input.trending.length

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
    return row({
      owner: change.owner,
      title: change.name,
      href: track(skillUrl(input.siteUrl, change.owner, change.repo, change.name), 'liked'),
      // The description explains the skill, and it only earns its line when
      // there are no commit subjects to explain what actually changed.
      description: subjects.length ? null : change.description,
      body: commitList(change.commitMessages),
      meta: joinMeta([
        `${change.owner}/${change.repo}`,
        `${change.changeCount} ${plural(change.changeCount, 'change', 'changes')}`,
        relativeDay(change.changedAt, now),
      ]),
    })
  }).join('')

  const overflowRow = input.likedOverflow
    ? `<tr><td style="padding:12px 0 0;border-top:1px solid ${TOKEN.border};font-family:${MONO};font-size:11px;color:${TOKEN.muted};">
         <a href="${esc(track(`${input.siteUrl}/me/likes`, 'overflow'))}" style="color:${TOKEN.muted};text-decoration:none;">+${input.likedOverflow} more ${plural(input.likedOverflow, 'skill', 'skills')} you like changed</a>
       </td></tr>`
    : ''

  // The section exists to report on liked skills, so when it has nothing to
  // report the email should say how to fill it. The fully-empty state already
  // does; this is the far more common case where trending carried the week and
  // the reader is never told the other half is theirs to populate.
  const likePrompt = !input.likedChanges.length && input.trending.length
    ? `<tr><td style="padding:16px 0 0;border-top:1px solid ${TOKEN.border};font-family:${SANS};font-size:13px;line-height:1.5;color:${TOKEN.muted};">
         ${LIKE_PROMPT} <a href="${esc(track(`${input.siteUrl}/skills`, 'cta'))}" style="color:${TOKEN.accent};text-decoration:none;">Browse the registry</a>.
       </td></tr>`
    : ''

  const trendingRows = input.trending.map(skill => row({
    owner: skill.owner,
    title: skill.canonicalName,
    href: track(skillUrl(input.siteUrl, skill.owner, skill.repo, skill.canonicalName), 'trending'),
    description: skill.description,
    meta: trendingMeta(skill, now),
    extra: skill.evidence ? quote(skill.evidence) : '',
  })).join('')

  const body = empty
    ? `<tr><td style="padding:22px 0 4px;margin-top:16px;border-top:1px solid ${TOKEN.border};font-family:${SANS};font-size:14px;line-height:1.6;color:${TOKEN.body};">
         Like a few skills and they will show up here the week they change.
         <a href="${esc(track(`${input.siteUrl}/skills`, 'cta'))}" style="color:${TOKEN.accent};text-decoration:none;">Browse the registry</a>.
       </td></tr>`
    : `${input.likedChanges.length
      ? `${sectionLabel('Skills you like')}${likedRows}${overflowRow}`
      : ''}${input.trending.length
      ? `${sectionLabel(input.likedChanges.length ? 'Also trending' : 'Trending this week')}${trendingRows}${likePrompt}`
      : ''}`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<!-- Apple Mail and iOS honour this; every other client falls through to the
     stacks declared inline, which is why both are spelled out in full. -->
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;600&display=swap" rel="stylesheet" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${TOKEN.page};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader(input))}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${TOKEN.page};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:${TOKEN.surface};border:1px solid ${TOKEN.border};border-radius:8px;">
      <tr><td style="padding:22px 28px 26px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-bottom:1px solid ${TOKEN.border};padding-bottom:14px;">
          <tr>
            <!-- The mark is a hosted PNG, not the SVG the site uses: Gmail
                 strips SVG entirely. Images are blocked by default in plenty of
                 clients too, so the wordmark beside it carries the brand on its
                 own and the alt text repeats it. -->
            <td width="26" valign="middle" style="width:26px;padding-right:9px;">
              <a href="${esc(track(input.siteUrl, 'footer'))}" style="text-decoration:none;">
                <img src="${esc(input.siteUrl)}/logo-icon.png" width="22" height="22" alt="skilld" style="display:block;width:22px;height:22px;border:0;border-radius:5px;" />
              </a>
            </td>
            <td valign="middle" style="font-family:${MONO};font-size:13px;font-weight:600;color:${TOKEN.text};letter-spacing:-0.01em;">
              <a href="${esc(track(input.siteUrl, 'footer'))}" style="color:${TOKEN.text};text-decoration:none;">skilld</a>
              <span style="color:${TOKEN.faint};font-weight:400;"> weekly</span>
            </td>
            <td align="right" valign="middle" style="font-family:${MONO};font-size:11px;color:${TOKEN.faint};font-variant-numeric:tabular-nums;">${esc(window)}</td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:22px 0 8px;">
            <div style="font-family:${SANS};font-size:19px;font-weight:600;line-height:1.3;color:${TOKEN.text};">Hey ${esc(input.login)},</div>
            <div style="margin-top:6px;font-family:${SANS};font-size:14px;line-height:1.6;color:${TOKEN.body};">${esc(greeting(input))}</div>
          </td></tr>
          ${body}
        </table>

        ${empty ? '' : button(track(`${input.siteUrl}/skills/trending`, 'cta'), 'See the full board')}

      </td></tr>
      <tr><td style="height:3px;background:${TOKEN.mark};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:16px 28px 20px;border-top:1px solid ${TOKEN.border};font-family:${MONO};font-size:11px;line-height:1.6;color:${TOKEN.faint};">
        You get this once a week because you have a skilld account.
        <a href="${esc(track(input.settingsUrl, 'footer'))}" style="color:${TOKEN.muted};text-decoration:none;">Settings</a>
        &middot;
        <a href="${esc(input.unsubscribeUrl)}" style="color:${TOKEN.muted};text-decoration:none;">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

  const text = renderWeeklyText(input)
  return { subject, html, text }
}

export function renderWeeklyText(input: WeeklyRenderInput): string {
  const now = input.windowEnd
  const lines: string[] = [
    `skilld weekly  ${formatWindow(input.windowStart, input.windowEnd)}`,
    '',
    `Hey ${input.login},`,
    greeting(input),
  ]

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
      lines.push(`  ${skillUrl(input.siteUrl, change.owner, change.repo, change.name)}`)
      lines.push('')
    }
    if (input.likedOverflow)
      lines.push(`+${input.likedOverflow} more you like changed: ${input.siteUrl}/me/likes`, '')
  }

  if (input.trending.length) {
    lines.push('', input.likedChanges.length ? 'ALSO TRENDING' : 'TRENDING THIS WEEK', '')
    for (const skill of input.trending) {
      lines.push(`- ${skill.owner}/${skill.repo} ${skill.canonicalName}`)
      const description = trimDescription(skill.description)
      if (description)
        lines.push(`  ${description}`)
      lines.push(`  ${trendingMeta(skill, now)}`)
      if (skill.evidence)
        lines.push(`  "${trimQuote(skill.evidence.text)}" \u2014 @${skill.evidence.authorHandle} ${skill.evidence.url}`)
      lines.push(`  ${skillUrl(input.siteUrl, skill.owner, skill.repo, skill.canonicalName)}`)
      lines.push('')
    }
    if (!input.likedChanges.length)
      lines.push(LIKE_PROMPT, '')
    lines.push(`Full board: ${input.siteUrl}/skills/trending`, '')
  }

  lines.push('', `Settings: ${input.settingsUrl}`, `Unsubscribe: ${input.unsubscribeUrl}`)
  return lines.join('\n')
}
