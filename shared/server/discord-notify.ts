/**
 * Post discovery events to a Discord channel via an incoming webhook.
 *
 * A webhook is deliberately the whole integration. A bot would need a gateway
 * connection, which a Worker cannot hold, plus a token with far more authority
 * than "write to one channel". The webhook URL alone carries the channel, so
 * changing where notifications land is a secret change and not a deploy.
 *
 * Notification is never load-bearing: a failed post is logged and the caller
 * carries on. Discovery that stopped because Discord was down would be a worse
 * outcome than a missed message.
 */

export type DiscordResult
  = | { _tag: 'sent' }
    | { _tag: 'skipped', reason: 'not-configured' | 'nothing-to-send' }
    | { _tag: 'failed', status: number, body: string }

export interface DiscordNotifier {
  trendingRepos: (input: TrendingAnnouncement[]) => Promise<DiscordResult>
}

export interface TrendingAnnouncement {
  owner: string
  repo: string
  /** Evidence post URL, so the channel can judge the claim for itself. */
  evidenceUrl: string
  evidenceText: string
  favouriteCount: number
  bookmarkCount: number
  authorHandle: string
  /** Indexed skills, when the repo has already resolved some. */
  skillCount: number
  /** skilld.dev page, present once the repo is indexed. */
  skilldUrl: string | null
}

export interface CreateDiscordNotifierOptions {
  webhookUrl: string | undefined
  fetchImpl?: typeof fetch
}

/** Discord rejects a payload over 2000 characters in `content`. */
const MAX_CONTENT = 1900
/** Embeds per message, per Discord's limit. */
const MAX_EMBEDS = 10

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed
}

export function createDiscordNotifier(options: CreateDiscordNotifierOptions): DiscordNotifier {
  const doFetch = options.fetchImpl ?? fetch

  return {
    async trendingRepos(items) {
      if (!options.webhookUrl)
        return { _tag: 'skipped', reason: 'not-configured' }
      if (items.length === 0)
        return { _tag: 'skipped', reason: 'nothing-to-send' }

      const shown = items.slice(0, MAX_EMBEDS)
      const overflow = items.length - shown.length

      const body = {
        content: truncate(
          overflow > 0
            ? `Trending on X: ${shown.length} repos, plus ${overflow} more`
            : `Trending on X: ${shown.length} ${shown.length === 1 ? 'repo' : 'repos'}`,
          MAX_CONTENT,
        ),
        embeds: shown.map(item => ({
          title: `${item.owner}/${item.repo}`,
          url: item.skilldUrl ?? `https://github.com/${item.owner}/${item.repo}`,
          description: truncate(item.evidenceText, 300),
          fields: [
            { name: 'Posted by', value: `@${item.authorHandle}`, inline: true },
            {
              name: 'Engagement',
              value: `${item.favouriteCount} favourites, ${item.bookmarkCount} bookmarks`,
              inline: true,
            },
            {
              name: 'Skills',
              value: item.skillCount > 0 ? String(item.skillCount) : 'not indexed yet',
              inline: true,
            },
          ],
          // Discord renders this as a link under the embed body.
          footer: { text: item.evidenceUrl },
        })),
        // Nothing here should ever ping a channel: this is a firehose.
        allowed_mentions: { parse: [] as string[] },
      }

      const res = await doFetch(options.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok)
        return { _tag: 'failed', status: res.status, body: (await res.text()).slice(0, 300) }

      return { _tag: 'sent' }
    },
  }
}
