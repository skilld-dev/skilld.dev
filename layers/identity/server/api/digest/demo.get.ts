import { defineApiHandler } from '#shared/server/handler'
import {
  loadPublicDigestChanges,
  publicDigestCommitsSchema,
  publicDigestSkillSchema,
  publicDigestUpdatesSchema,
} from '../../utils/public-digest'
import { renderWeekly, renderWeeklyPreview } from '../../utils/weekly-template'

/** A sample watch list built from real public changes, never personal subscriptions. */
export interface DigestDemoResponse {
  card: string
  html: string
  subject: string
  windowEnd: number
  rowCount: number
}

export default defineCachedEventHandler(defineApiHandler({ handler: async () => {
  const windowEnd = Math.floor(Date.now() / 1000)
  const windowStart = windowEnd - 7 * 24 * 60 * 60
  const changes = await loadPublicDigestChanges({
    windowStart,
    windowEnd,
    loadUpdates: async () => publicDigestUpdatesSchema.parse(await $fetch('/api/feed/recent-updates')),
    loadSkill: async item => publicDigestSkillSchema.parse(await $fetch(
      `/api/v1/skills/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}/${encodeURIComponent(item.name)}`,
    )),
    loadCommits: async item => publicDigestCommitsSchema.parse(await $fetch(
      `/api/skill-related/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}/${encodeURIComponent(item.name)}`,
    )),
  })
  return { changes, windowStart, windowEnd }
}, presenter: ({ changes, windowStart, windowEnd }): DigestDemoResponse => {
  const render = (theme: 'light' | 'dark') => renderWeekly({
    edition: 'digest',
    changeSource: 'watches',
    theme,
    login: null,
    windowStart,
    windowEnd,
    likedChanges: changes,
    likedOverflow: 0,
    trackedCount: changes.length,
    trending: [],
    siteUrl: 'https://skilld.dev',
    settingsUrl: 'https://skilld.dev/me',
    unsubscribeUrl: 'https://skilld.dev/me',
  })
  const light = render('light')
  return {
    card: renderWeeklyPreview({
      edition: 'digest',
      changeSource: 'watches',
      login: null,
      windowStart,
      windowEnd,
      likedChanges: changes,
      likedOverflow: 0,
      trackedCount: changes.length,
      trending: [],
      siteUrl: 'https://skilld.dev',
      settingsUrl: 'https://skilld.dev/me',
      unsubscribeUrl: 'https://skilld.dev/me',
    }),
    html: light.html,
    subject: light.subject,
    windowEnd,
    rowCount: changes.length,
  }
} }), { maxAge: 3600, swr: true, name: 'public-digest-demo-v5' })
