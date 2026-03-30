import type { AppBskyActorDefs } from '@atproto/api'

/** Label values that indicate an account should be filtered from public listings. */
const FILTERED_LABELS = new Set([
  '!no-unauthenticated',
  'spam',
  'impersonation',
  '!takedown',
])

/** Check if a profile has labels that should exclude it from public curator listings. */
export function isProfileFlagged(profile: AppBskyActorDefs.ProfileViewDetailed | AppBskyActorDefs.ProfileView): boolean {
  if (!profile.labels?.length)
    return false
  return profile.labels.some(l => FILTERED_LABELS.has(l.val))
}

/** Filter a list of profiles, removing any with moderation flags. */
export function filterFlaggedProfiles<T extends { labels?: AppBskyActorDefs.ProfileViewDetailed['labels'] }>(profiles: T[]): T[] {
  return profiles.filter(p => !p.labels?.some(l => FILTERED_LABELS.has(l.val)))
}
