<script setup lang="ts">
// No picker and no per-agent command. The CLI detects the agent and reports
// where it installed, so the only thing the site still knows that the CLI
// output does not is how a user confirms the install landed.
const open = ref(false)

// Skill detail mounts this twice, so the list id must be unique per instance.
const listId = useId()
</script>

<template>
  <div class="border-t border-default pt-2">
    <button
      type="button"
      class="min-h-11 font-mono text-xs text-muted transition-colors hover:brightness-125"
      :aria-expanded="open"
      :aria-controls="listId"
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
      :id="listId"
      class="mt-2 max-h-64 space-y-3 overflow-y-auto pr-1 text-xs"
    >
      <div v-for="agent in AGENT_TARGETS" :key="agent.id" class="space-y-0.5">
        <dt class="font-mono text-muted">
          {{ agent.label }}
        </dt>
        <dd class="text-toned">
          {{ agent.verify }}
        </dd>
      </div>
    </dl>
  </div>
</template>
