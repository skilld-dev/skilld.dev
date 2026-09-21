/// <reference types="@cloudflare/workers-types" />

/**
 * The weekly email as the homepage shows it.
 *
 * Renders through the real `renderWeekly`, so the band on the homepage cannot
 * claim something the email does not send. A screenshot would have gone stale
 * on the first row-style edit; this template changed on four consecutive days
 * while it was being written.
 *
 * Only the trending half. An anonymous visitor has no likes, and inventing a
 * liked section would put fabricated commit messages against real people's
 * repositories. The band's copy carries that half in words instead.
 */

import { loadWeeklyTrending } from '#layers/identity/server/utils/weekly-select'
import { renderWeekly } from '#layers/identity/server/utils/weekly-template'
import { getDB } from '#server/utils/db'

export interface WeeklyDemoResponse {
  /**
   * The email card in both themes, no document wrapper, ready to embed.
   *
   * Both, rather than one chosen server side, because colour mode is a client
   * decision and a single card would either flash on hydration or need a second
   * request. The pair is about 30KB of inline-styled markup below the fold.
   */
  card: { light: string, dark: string }
  subject: string
  /** Unix seconds the window ends, for an "as of" line if the UI wants one. */
  windowEnd: number
  /** Rows shown. Zero means the socials were quiet and the band should degrade. */
  rowCount: number
}

const WINDOW_SECONDS = 7 * 24 * 60 * 60

export default defineCachedEventHandler(
  async (event): Promise<WeeklyDemoResponse> => {
    const db = getDB(event)
    const windowEnd = Math.floor(Date.now() / 1_000)
    const trending = await loadWeeklyTrending(db, windowEnd)

    const config = useRuntimeConfig(event)
    const siteUrl = (config.publicSiteUrl as string) || 'https://skilld.dev'

    const render = (theme: 'light' | 'dark') => renderWeekly({
      theme,
      // No recipient: this is the email, not a send to anyone.
      login: null,
      windowStart: windowEnd - WINDOW_SECONDS,
      windowEnd,
      likedChanges: [],
      likedOverflow: 0,
      // Zero, so the render omits the quiet-week line. A visitor who has never
      // signed in is not being told that nothing they like changed.
      trackedCount: 0,
      trending,
      siteUrl,
      unsubscribeUrl: `${siteUrl}/me`,
      settingsUrl: `${siteUrl}/me`,
    })

    const light = render('light')
    return {
      card: { light: light.card, dark: render('dark').card },
      subject: light.subject,
      windowEnd,
      rowCount: trending.length,
    }
  },
  // The ranking is recomputed hourly at most upstream, so a shorter cache would
  // spend D1 reads to serve an answer that cannot have changed.
  // The name changes whenever the card markup changes, so a deploy never serves
  // the previous markup from cache.
  { maxAge: 3600, swr: true, name: 'weekly-demo-v2' },
)
