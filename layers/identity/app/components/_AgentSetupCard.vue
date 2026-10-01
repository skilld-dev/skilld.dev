<script setup lang="ts">
// A cookie, not local storage, so the server renders the closed state and the
// card never flashes in. The privacy page lists it.
const dismissed = useCookie<boolean>('agent_setup_dismissed', {
  maxAge: 60 * 60 * 24 * 180,
  sameSite: 'lax',
  default: () => false,
})
</script>

<template>
  <section
    v-if="!dismissed"
    aria-labelledby="agent-setup-heading"
    class="rounded-lg border border-default p-4"
    data-testid="agent-setup-card"
  >
    <div class="flex items-start justify-between gap-3">
      <h2 id="agent-setup-heading" class="text-lg font-semibold">
        Search from your agent
      </h2>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        class="-mt-2 -mr-2 min-h-11 min-w-11 shrink-0"
        aria-label="Close agent setup"
        @click="dismissed = true"
      />
    </div>
    <p class="mt-2 text-sm leading-relaxed text-muted">
      Install the skilld Skill or add the MCP server. Your Agent finds curated Skills and hands you the run command.
    </p>
    <UButton
      to="/developers"
      label="Set up your agent"
      trailing-icon="i-lucide-arrow-right"
      color="neutral"
      variant="outline"
      class="mt-4 min-h-11"
    />
  </section>
</template>
