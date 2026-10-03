<script setup lang="ts">
const { state: auth } = useAuth()
const cards = computed(() => [
  ...(auth.value._tag !== 'signed-in'
    ? [{ id: 'signup', icon: 'i-lucide-eye', title: 'Watch for changes', description: 'Watch a repo. Every Monday the digest lists what changed. If nothing changed, we send nothing.', label: 'Sign in with GitHub', to: '/login' }]
    : []),
  ...(auth.value._tag !== 'signed-in' || !auth.value.user.onboarded
    ? [{ id: 'weekly', icon: 'i-lucide-mail', title: 'Trending skills this week', description: 'Get the latest skills devs are talking about in your inbox.', label: 'Sign in with GitHub', to: '/login' }]
    : []),
  { id: 'mcp', icon: 'i-lucide-plug', title: 'Add the MCP server', description: 'Search from your agent instead.', label: 'Add the skilld MCP server', to: '/developers?setup=mcp' },
])
// Pick once per visit. The promotion stays still while someone reads or acts.
const selection = useState('skills-directory-promotion', () => Math.random())
const current = computed(() => cards.value[Math.floor(selection.value * cards.value.length)]!)
</script>

<template>
  <div class="directory-cta relative isolate overflow-hidden rounded-lg border border-default bg-elevated p-5">
    <span aria-hidden="true" class="directory-cta__wash pointer-events-none absolute inset-0 -z-10" />
    <span class="directory-cta__mark mb-5 flex size-11 items-center justify-center rounded-xl border" aria-hidden="true">
      <UIcon :name="current.icon" class="size-5 text-primary" />
    </span>
    <h2 class="text-base font-semibold leading-snug text-default">
      {{ current.title }}
    </h2>
    <p class="mt-2 text-sm leading-relaxed text-muted">
      {{ current.description }}
    </p>
    <UButton :to="current.to" :label="current.label" trailing-icon="i-lucide-arrow-up-right" class="mt-6 min-h-11 w-full justify-center" size="sm" />
    <NuxtLink v-if="current.id === 'weekly'" to="/weekly/preview" external class="mt-2 flex min-h-11 items-center justify-center text-center font-mono text-xs text-muted underline underline-offset-2 hover:text-default">
      See this week's digest
    </NuxtLink>
  </div>
</template>

<style scoped>
.directory-cta__wash {
  background:
    radial-gradient(ellipse at 90% 0%, color-mix(in oklch, var(--ui-primary) 11%, transparent), transparent 65%),
    linear-gradient(to top, color-mix(in oklch, var(--ui-primary) 4%, transparent), transparent 60%);
}

.directory-cta__mark {
  border-color: color-mix(in oklch, var(--ui-primary) 18%, var(--ui-border));
  background: color-mix(in oklch, var(--ui-primary) 6%, var(--ui-bg));
}
</style>
