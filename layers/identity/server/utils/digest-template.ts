import { renderWeekly } from './weekly-template'

export interface DigestRepoEntry {
  owner: string
  repo: string
  skillNames: string[]
  skills: Array<{
    name: string
    description: string | null
    changeCount: number
    commitMessages: string[]
    changedAt: number
    sourceUrl: string
    changeUrl: string
  }>
  changeCount: number
  /** Optional generated sentence. Commit messages remain the fallback. */
  summary?: string | null
}

export interface DigestRenderInput {
  login: string
  recipientName?: string | null
  /** Route same-site links through the aggregate click counter. Real sends only. */
  countClicks?: boolean
  windowStart: number
  windowEnd: number
  entries: DigestRepoEntry[]
  siteUrl?: string
  settingsUrl?: string
  unsubscribeUrl: string
}

export interface DigestRender {
  subject: string
  html: string
  text: string
}

export function renderDigest(input: DigestRenderInput): DigestRender {
  const siteUrl = input.siteUrl ?? 'https://skilld.dev'
  const changes = input.entries.flatMap(entry => entry.skills.map((skill, index) => ({
    owner: entry.owner,
    repo: entry.repo,
    name: skill.name,
    slug: skill.name,
    description: skill.description,
    changeCount: skill.changeCount,
    changedAt: skill.changedAt,
    commitMessages: entry.summary && index === 0
      ? [`Generated summary: ${entry.summary}`]
      : skill.commitMessages,
    sourceUrl: skill.sourceUrl,
    changeUrl: skill.changeUrl,
  })))
  const likedChanges = changes.slice(0, 5)

  return renderWeekly({
    edition: 'digest',
    changeSource: 'watches',
    recipientName: input.recipientName ?? null,
    countClicks: input.countClicks ?? false,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    likedChanges,
    likedOverflow: Math.max(0, changes.length - likedChanges.length),
    trackedCount: changes.length,
    trending: [],
    siteUrl,
    unsubscribeUrl: input.unsubscribeUrl,
    settingsUrl: input.settingsUrl ?? `${siteUrl}/me`,
  })
}
