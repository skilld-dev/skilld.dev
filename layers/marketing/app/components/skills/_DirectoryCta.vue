<script setup lang="ts">
import { useDocumentVisibility, useElementHover, useElementVisibility, useFocusWithin, useIntervalFn, usePreferredReducedMotion } from '@vueuse/core'

const { state: auth } = useAuth()
const cards = computed(() => [
  ...(auth.value._tag !== 'signed-in'
    ? [{ id: 'signup', title: 'Watch for changes', description: 'Watch a repo. Every Monday the digest lists what changed. If nothing changed, we send nothing.', label: 'Sign in with GitHub', to: '/login' }]
    : []),
  ...(auth.value._tag !== 'signed-in' || !auth.value.user.onboarded
    ? [{ id: 'weekly', title: 'Trending skills this week', description: 'Get the latest skills devs are talking about in your inbox.', label: 'Sign in with GitHub', to: '/login' }]
    : []),
  { id: 'mcp', title: 'Add the MCP server', description: 'Search from your agent instead.', label: 'Add the skilld MCP server', to: '/developers?setup=mcp' },
])

const index = ref(0)
const current = computed(() => cards.value[index.value % cards.value.length]!)
const root = useTemplateRef<HTMLElement>('root')
const visible = useElementVisibility(root)
const hovered = useElementHover(root)
const { focused } = useFocusWithin(root)
const documentVisibility = useDocumentVisibility()
const reducedMotion = usePreferredReducedMotion()
const paused = ref(false)
function advance() {
  index.value = (index.value + 1) % cards.value.length
}
function next() {
  paused.value = true
  advance()
}
const { pause, resume } = useIntervalFn(advance, 10000, { immediate: false })
watch([visible, hovered, focused, documentVisibility, reducedMotion, paused, cards], () => {
  if (visible.value && !hovered.value && !focused.value && documentVisibility.value === 'visible' && reducedMotion.value !== 'reduce' && !paused.value && cards.value.length > 1)
    resume()
  else
    pause()
}, { immediate: true })
</script>

<template>
  <div ref="root" class="rounded-lg border border-default bg-elevated p-4" role="group" aria-label="Skilld suggestions" aria-roledescription="carousel">
    <div class="flex min-h-52 flex-col">
      <h2 class="text-base font-semibold leading-snug text-default">
        {{ current.title }}
      </h2>
      <p class="mt-3 text-sm leading-relaxed text-muted">
        {{ current.description }}
      </p>
      <div class="mt-auto pt-5">
        <UButton :to="current.to" :label="current.label" class="min-h-11 w-full justify-center" size="sm" />
        <NuxtLink v-if="current.id === 'weekly'" to="/weekly/preview" external class="mt-3 block text-center font-mono text-xs text-muted underline underline-offset-2 hover:text-default">
          See this week's digest
        </NuxtLink>
      </div>
    </div>
    <div v-if="cards.length > 1" class="mt-4 flex items-center justify-between border-t border-default pt-2">
      <span class="font-mono text-xs tabular-nums text-muted">{{ index % cards.length + 1 }} / {{ cards.length }}</span>
      <div class="flex items-center gap-1">
        <UButton color="neutral" variant="ghost" size="xs" :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'" :aria-label="paused ? 'Resume suggestions' : 'Pause suggestions'" class="size-11 justify-center sm:size-8" @click="paused = !paused" />
        <UButton color="neutral" variant="ghost" size="xs" label="Next" trailing-icon="i-lucide-chevron-right" aria-label="Next suggestion" class="min-h-11 sm:min-h-8" @click="next" />
      </div>
    </div>
  </div>
</template>
