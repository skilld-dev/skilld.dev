<script setup lang="ts">
const { owner, repo, name, count = 0, variant = 'detail' } = defineProps<{
  owner: string
  repo: string
  name: string
  count?: number
  variant?: 'detail' | 'card'
}>()

const route = useRoute()
const { isAuthenticated, user, loginUrl } = useAuth()
const { isLiked, isPending, ensureLoaded, toggle } = useLikes()

const skillRef = computed(() => ({ owner, repo, name }))
const liked = computed(() => isLiked(skillRef.value))
const busy = computed(() => isPending(skillRef.value))

/**
 * The server count ships in cached HTML, so it never includes the viewer's own
 * like. Offsetting locally keeps the number honest between the click and the
 * next recompute drain without re-rendering the page.
 */
const baseline = ref(count)
watch(() => count, (next) => {
  baseline.value = next
})
const likedAtLoad = ref(false)
const displayCount = computed(() => {
  const delta = (liked.value ? 1 : 0) - (likedAtLoad.value ? 1 : 0)
  return Math.max(0, baseline.value + delta)
})

// Anonymous clicks bounce through OAuth carrying the intent, and the callback
// replays it via watch-actions.ts, so the user lands back on a liked skill.
const anonHref = computed(() => loginUrl({ returnTo: route.fullPath, action: 'like-skill' }))

const NUDGE_KEY = 'skilld:like-digest-nudge-dismissed'
const nudgeDismissed = ref(true)
const showNudge = computed(() =>
  variant === 'detail' && liked.value && isAuthenticated.value && user.value?.onboarded === false && !nudgeDismissed.value,
)

onMounted(() => {
  nudgeDismissed.value = sessionStorage.getItem(NUDGE_KEY) === '1'
  // Detached on purpose: the heart renders immediately in its unliked state and
  // fills in when the session-wide like set arrives.
  void ensureLoaded().then(() => {
    likedAtLoad.value = liked.value
  })
})

function dismissNudge() {
  nudgeDismissed.value = true
  sessionStorage.setItem(NUDGE_KEY, '1')
}

async function onToggle() {
  if (busy.value)
    return
  await toggle(skillRef.value)
}

/**
 * On a card the heart follows the copy button's hover reveal, except once it is
 * liked — a liked skill has to be legible at a glance across a grid, which is
 * the whole point of putting hearts on cards. Safe to compute without a mounted
 * guard because this component is client-only, so there is no SSR class to
 * mismatch against.
 */
const revealClass = computed(() => {
  if (variant !== 'card')
    return ''
  return liked.value
    ? 'opacity-100'
    : 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
})
</script>

<template>
  <div :class="variant === 'detail' ? 'space-y-2' : ''">
    <UButton
      v-if="!isAuthenticated"
      :to="anonHref"
      external
      size="xs"
      color="neutral"
      :variant="variant === 'detail' ? 'outline' : 'ghost'"
      class="min-h-11 gap-1.5"
      :class="revealClass"
      :aria-label="`Like ${name}`"
    >
      <UIcon name="i-lucide-heart-plus" class="size-4" aria-hidden="true" />
      <span class="tabular-nums">{{ displayCount }}</span>
    </UButton>

    <UButton
      v-else
      type="button"
      size="xs"
      color="neutral"
      :variant="variant === 'detail' ? 'outline' : 'ghost'"
      class="min-h-11 gap-1.5"
      :class="revealClass"
      :disabled="busy"
      :aria-pressed="liked"
      :aria-label="liked ? `Unlike ${name}` : `Like ${name}`"
      @click.stop.prevent="onToggle"
    >
      <UIcon
        v-if="liked"
        name="i-lucide-heart"
        class="size-4 fill-current text-primary transition-transform duration-200 motion-reduce:transition-none"
        aria-hidden="true"
      />
      <UIcon
        v-else
        name="i-lucide-heart-plus"
        class="size-4 transition-transform duration-200 motion-reduce:transition-none"
        aria-hidden="true"
      />
      <span class="tabular-nums">{{ displayCount }}</span>
    </UButton>

    <p
      v-if="showNudge"
      class="flex items-start gap-2 text-xs text-muted"
    >
      <span class="flex-1">
        Add an email to hear when this changes.
        <ULink to="/onboarding/email" class="underline underline-offset-2">Set up digest</ULink>
      </span>
      <UButton
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Dismiss"
        @click="dismissNudge"
      />
    </p>
  </div>
</template>
