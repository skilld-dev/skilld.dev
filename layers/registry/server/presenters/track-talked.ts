import type { TrendingSkill, TrendingSkillEvidence } from '#shared/server/trending-skills'
import type { TrackRange } from '#shared/track-board'
import { clipPostText } from '#shared/server/trending-skills'

/** One post about a Skill, in the fields a board card renders. */
export interface TrackTalkedPost {
  url: string
  authorHandle: string
  authorName: string | null
  authorAvatar: string | null
  text: string
  postedAt: number
  platform: 'x' | 'bsky'
  /** Likes on this post, not the Skill's total. */
  favouriteCount: number
}

/** A Skill in the track that devs posted about, in rank order. */
export interface TrackTalkedSkill {
  owner: string
  repo: string
  name: string
  canonicalName: string
  /** Final public route. Clients must use this value directly. */
  registryPath: string
  description: string | null
  stars: number | null
  /** Separate accounts that posted about it in the window. */
  authorCount: number
  /** The quoted post first, then one from each other author. Never empty. */
  posts: TrackTalkedPost[]
  /** Mentions per rolling day across the last seven, oldest first. */
  mentionsByDay: number[] | null
}

export interface TrackTalkedResponse {
  range: TrackRange
  /** Unix seconds the ranking was computed at. Every post dates against it. */
  computedAt: number
  skills: TrackTalkedSkill[]
}

export interface TrackTalkedResult {
  computedAt: number
  skills: TrendingSkill[]
}

function presentPost(post: TrendingSkillEvidence): TrackTalkedPost {
  return {
    url: post.url,
    authorHandle: post.authorHandle,
    authorName: post.authorName,
    authorAvatar: post.authorAvatar,
    text: clipPostText(post.text),
    postedAt: post.postedAt,
    platform: post.platform,
    favouriteCount: post.favouriteCount,
  }
}

/**
 * Ranked Skills, each with the posts that ranked it.
 *
 * A Skill with no post is dropped here rather than shipped bare. A track
 * scope ranks by posts alone, so none should arrive, and ADR-0010 forbids a
 * socially ranked row without its evidence.
 */
export function presentTrackTalked(result: TrackTalkedResult, range: TrackRange): TrackTalkedResponse {
  return {
    range,
    computedAt: result.computedAt,
    skills: result.skills.flatMap((skill) => {
      if (!skill.evidence)
        return []
      return [{
        owner: skill.owner,
        repo: skill.repo,
        name: skill.slug,
        canonicalName: skill.canonicalName,
        registryPath: skill.registryPath,
        description: skill.description,
        stars: skill.stars,
        authorCount: skill.social?.authorCount ?? 0,
        posts: [skill.evidence, ...skill.morePosts].map(presentPost),
        mentionsByDay: skill.mentionsByDay,
      }]
    }),
  }
}
