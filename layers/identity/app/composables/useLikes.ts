export interface SkillLikeRef {
  owner: string
  repo: string
  name: string
}

export function likeKey(ref: SkillLikeRef): string {
  return `${ref.owner}/${ref.repo}/${ref.name}`
}

interface LikeListItem extends SkillLikeRef {
  likeCount: number
}

interface LikeListResponse {
  items: LikeListItem[]
}

interface LikeMutationResponse {
  ok: true
  likeCount: number
}

/**
 * Shared in-flight fetch. A `loaded` boolean alone is not enough: a page renders
 * several LikeButtons (the skill detail has a mobile and a desktop copy, a grid
 * has sixty), and the second caller would see `loaded` already true and return
 * before any data had arrived, snapshotting an empty like set. Handing every
 * caller the same promise makes them all resume with the real answer.
 *
 * Client-only by construction — `ensureLoaded` returns early on the server, so
 * this never leaks state between requests.
 */
let inflight: Promise<void> | null = null
const ensureLikeInflight = new Map<string, Promise<boolean>>()

/**
 * Skill cards render inside SSR'd, cached marketing pages, so heart state
 * cannot travel in the HTML. It is fetched once per session into shared state
 * instead: every card and detail page reads the same map, so a page of sixty
 * cards costs one request rather than sixty.
 *
 * Anonymous visitors never fetch. They get the OAuth bounce in LikeButton.
 */
export function useLikes() {
  const { isAuthenticated } = useAuth()
  const fail = useActionFailure()

  const liked = useState<Record<string, true>>('skill-likes', () => ({}))
  const likeCounts = useState<Record<string, number>>('skill-like-counts', () => ({}))
  const loaded = useState<boolean>('skill-likes-loaded', () => false)
  const pending = useState<Record<string, true>>('skill-likes-pending', () => ({}))

  function isLiked(ref: SkillLikeRef): boolean {
    return !!liked.value[likeKey(ref)]
  }

  function isPending(ref: SkillLikeRef): boolean {
    return !!pending.value[likeKey(ref)]
  }

  function likeCount(ref: SkillLikeRef): number | undefined {
    return likeCounts.value[likeKey(ref)]
  }

  /** Cached page counts are a baseline only. A live mutation always wins. */
  function observeLikeCount(ref: SkillLikeRef, count: number): void {
    const key = likeKey(ref)
    if (likeCounts.value[key] === undefined)
      likeCounts.value = { ...likeCounts.value, [key]: count }
  }

  /**
   * Sixty cards mounting in the same tick share one request, and all sixty wait
   * for it. Cleared on failure so a transient error does not leave every heart
   * empty for the rest of the session.
   */
  function ensureLoaded(): Promise<void> {
    if (!import.meta.client || loaded.value || !isAuthenticated.value)
      return Promise.resolve()
    if (inflight)
      return inflight

    inflight = $fetch<LikeListResponse>('/api/me/likes')
      .then((res) => {
        const next: Record<string, true> = {}
        const nextCounts = { ...likeCounts.value }
        for (const item of res.items)
          next[likeKey(item)] = true
        for (const item of res.items)
          nextCounts[likeKey(item)] = item.likeCount
        liked.value = next
        likeCounts.value = nextCounts
        loaded.value = true
      })
      .catch((error) => {
        console.warn(`[likes] ${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        inflight = null
      })

    return inflight
  }

  /** Returns the state the heart settled on, so the caller can trust it after a rollback. */
  async function toggle(ref: SkillLikeRef): Promise<boolean> {
    await ensureLoaded()
    const key = likeKey(ref)
    const wasLiked = !!liked.value[key]
    const previousCount = likeCounts.value[key]

    liked.value = applyLiked(liked.value, key, !wasLiked)
    if (previousCount !== undefined) {
      likeCounts.value = {
        ...likeCounts.value,
        [key]: Math.max(0, previousCount + (wasLiked ? -1 : 1)),
      }
    }
    pending.value = { ...pending.value, [key]: true }

    const path = `/api/me/likes/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${encodeURIComponent(ref.name)}`
    const res = wasLiked
      ? await $fetch<LikeMutationResponse>(path, { method: 'DELETE' }).catch(fail('remove your like'))
      : await $fetch<LikeMutationResponse>('/api/me/likes', { method: 'POST', body: ref }).catch(fail('save your like'))

    const { [key]: _dropped, ...restPending } = pending.value
    pending.value = restPending

    if (!res) {
      liked.value = applyLiked(liked.value, key, wasLiked)
      if (previousCount !== undefined)
        likeCounts.value = { ...likeCounts.value, [key]: previousCount }
      return wasLiked
    }
    likeCounts.value = { ...likeCounts.value, [key]: res.likeCount }
    return !wasLiked
  }

  /** Idempotent unlike `toggle`: automatic flows can only move toward liked. */
  async function ensureLiked(ref: SkillLikeRef): Promise<boolean> {
    if (!isAuthenticated.value)
      return false

    await ensureLoaded()
    const key = likeKey(ref)
    if (liked.value[key])
      return true

    const existing = ensureLikeInflight.get(key)
    if (existing)
      return existing

    liked.value = applyLiked(liked.value, key, true)
    const previousCount = likeCounts.value[key]
    if (previousCount !== undefined)
      likeCounts.value = { ...likeCounts.value, [key]: previousCount + 1 }
    pending.value = { ...pending.value, [key]: true }

    const request = $fetch<LikeMutationResponse>('/api/me/likes', { method: 'POST', body: ref })
      .then((response) => {
        likeCounts.value = { ...likeCounts.value, [key]: response.likeCount }
        return true
      })
      .catch(fail('save your like'))
      .then((result) => {
        if (!result) {
          liked.value = applyLiked(liked.value, key, false)
          if (previousCount !== undefined)
            likeCounts.value = { ...likeCounts.value, [key]: previousCount }
        }
        const { [key]: _dropped, ...restPending } = pending.value
        pending.value = restPending
        return result === true
      })
      .finally(() => {
        ensureLikeInflight.delete(key)
      })

    ensureLikeInflight.set(key, request)
    return request
  }

  return { liked, isLiked, isPending, likeCount, observeLikeCount, ensureLoaded, ensureLiked, toggle }
}

function applyLiked(map: Record<string, true>, key: string, next: boolean): Record<string, true> {
  if (next)
    return { ...map, [key]: true }
  const { [key]: _removed, ...rest } = map
  return rest
}
