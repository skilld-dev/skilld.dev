/// <reference types="@cloudflare/workers-types" />

/**
 * This week's weekly, rendered as a page anyone can read.
 *
 * The point is that nobody has to subscribe to find out what they would be
 * subscribing to. skilld's whole claim is that you read the SKILL.md before you
 * run it; the same courtesy applies to an email.
 *
 * Public on purpose, and safe to be: the trending half is identical for every
 * recipient, so this leaks nothing about anyone. The liked half is absent for
 * the same reason it is absent from the homepage demo.
 */

import { loadWeeklyTrending } from '#layers/identity/server/utils/weekly-select'
import { renderWeekly } from '#layers/identity/server/utils/weekly-template'
import { getDB } from '#server/utils/db'

const WINDOW_SECONDS = 7 * 24 * 60 * 60

export default defineCachedEventHandler(
  async (event) => {
    const db = getDB(event)
    const windowEnd = Math.floor(Date.now() / 1_000)
    const trending = await loadWeeklyTrending(db, windowEnd)

    const config = useRuntimeConfig(event)
    const siteUrl = (config.publicSiteUrl as string) || 'https://skilld.dev'

    const rendered = renderWeekly({
      // No recipient: this is the email, not a send to anyone.
      login: null,
      windowStart: windowEnd - WINDOW_SECONDS,
      windowEnd,
      likedChanges: [],
      likedOverflow: 0,
      trackedCount: 0,
      trending,
      siteUrl,
      unsubscribeUrl: `${siteUrl}/me`,
      settingsUrl: `${siteUrl}/me`,
    })

    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    // A preview of a mail-out is not a page we want ranking against the skill
    // pages it links to, and it changes weekly.
    setHeader(event, 'x-robots-tag', 'noindex, follow')
    return rendered.html
  },
  { maxAge: 3600, swr: true, name: 'weekly-preview-v1' },
)
