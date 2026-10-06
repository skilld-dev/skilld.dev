/**
 * Accounts that post on a schedule or on request, not by a person's choice.
 *
 * The trending board quotes people. A GitHub trending auto-poster or Grok
 * answering a tag still names the Skill, so its post stays in the evidence,
 * but it never leads: the quote line and the first poster faces go to a
 * person whenever one posted.
 *
 * Reviewed by hand against production posts on 2026-10-06. Each entry is a
 * Bluesky account with the network's `bot` self-label, an account whose
 * profile says it is a bot, or an account that posts one fixed template.
 */
const AUTOMATED_AUTHORS: ReadonlySet<string> = new Set([
  // X's own assistant, replying to whoever tagged it.
  'x:grok',
  // Numbered series and monthly leaderboards from one template.
  'x:blueoceanrefine',
  'x:skillleaderbd',
  // GitHub trending and tech news auto-posters.
  'bsky:dailygithubtrends.bsky.social',
  'bsky:github-trending-js.bsky.social',
  'bsky:github-trending.bsky.social',
  'bsky:sigmanor.net',
  'bsky:tech-trending.bsky.social',
  'bsky:technews4869.bsky.social',
])

export interface PostAuthor {
  platform: 'x' | 'bsky'
  handle: string
}

/** Handles compare without case, as each network does. */
export function isAutomatedAuthor(author: PostAuthor): boolean {
  return AUTOMATED_AUTHORS.has(`${author.platform}:${author.handle.toLowerCase()}`)
}
