import type { MaybeRefOrGetter, Ref } from 'vue'
import type { DemoCampaign, DemoEngagement } from '#shared/demo-engagement'
import { demoElapsedBucket, demoFrameIsVisible } from '#shared/demo-engagement'

export function useDemoEngagement(slug: MaybeRefOrGetter<string>, surface: string, stage: Readonly<Ref<HTMLElement | null>>) {
  const route = useRoute()
  const exposed = new Set<string>()
  const firstSeen = new Map<string, number>()
  const visible = ref(false)
  const campaign = computed<DemoCampaign>(() => {
    const value = route.query.campaign
    return value === 'demo-component' || value === 'demo-page' || value === 'demo-motion' ? value : 'direct'
  })
  function record(action: { event: 'exposure' } | { event: 'share' } | { event: 'copy', format: 'agent' | 'terminal' }) {
    const key = toValue(slug)
    const since = firstSeen.get(key)
    const context = { slug: key, surface, campaign: campaign.value }
    const body: DemoEngagement = action.event === 'exposure'
      ? { ...context, ...action }
      : { ...context, ...action, elapsed: demoElapsedBucket(since === undefined ? null : performance.now() - since) }
    void $fetch('/api/events/demo', { method: 'POST', body }).catch((error) => {
      console.warn('[demo-engagement] Could not record demo event:', error)
    })
  }
  useIntersectionObserver(stage, ([entry]) => {
    visible.value = demoFrameIsVisible(entry)
  }, { threshold: 0.5 })
  watch([() => toValue(slug), visible], ([key, isVisible]) => {
    if (!isVisible || exposed.has(key))
      return
    exposed.add(key)
    firstSeen.set(key, performance.now())
    record({ event: 'exposure' })
  })
  return { record }
}
