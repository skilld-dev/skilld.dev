<script setup lang="ts">
// No picker and no per-agent command. The CLI detects the agent and reports
// where it installed, so the only thing the site still knows that the CLI
// output does not is how a user confirms the install landed.
const open = ref(false)
</script>

<template>
  <div class="border-t border-default pt-2">
    <button
      type="button"
      class="min-h-11 font-mono text-xs text-muted transition-colors hover:brightness-125"
      :aria-expanded="open"
      aria-controls="agent-targets-list"
      @click="open = !open"
    >
      Check it worked
      <UIcon
        :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-3 align-middle"
        aria-hidden="true"
      />
    </button>
    <dl
      v-show="open"
      id="agent-targets-list"
      class="mt-2 space-y-1.5 text-xs"
    >
      <div v-for="agent in AGENT_TARGETS" :key="agent.id" class="flex gap-2">
        <dt class="w-28 shrink-0 font-mono text-muted">
          {{ agent.label }}
        </dt>
        <dd class="min-w-0 text-toned">
          {{ agent.verify }}
        </dd>
      </div>
    </dl>
  </div>
</template>
