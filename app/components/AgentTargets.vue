<script setup lang="ts">
// No picker and no per-agent command. The CLI detects the agent and reports
// where it installed, so the only thing the site still knows that the CLI
// output does not is how a user confirms the install landed. Targets without a
// checked step show their project folder in a table instead.
const open = ref(false)

/**
 * Targets with a checked step lead. The rest share one fact, the folder the
 * CLI writes to, so they collapse into a compact two-column table instead of
 * fifty near-identical sentences.
 */
const checked = AGENT_TARGETS.filter(agent => agent.verify !== null)
const unchecked = AGENT_TARGETS.filter(agent => agent.verify === null)

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
    <div
      v-show="open"
      :id="listId"
      class="mt-2 max-h-64 overflow-y-auto pr-1 text-xs"
    >
      <dl class="space-y-3">
        <div v-for="agent in checked" :key="agent.id" class="space-y-0.5">
          <dt class="font-mono text-muted">
            {{ agent.label }}
          </dt>
          <dd class="text-toned">
            {{ agent.verify }}
          </dd>
        </div>
      </dl>
      <template v-if="unchecked.length">
        <p class="mt-4 text-toned">
          For the other Agents, check that the Skill landed in its folder:
        </p>
        <table class="mt-2 w-full border-collapse font-mono">
          <caption class="sr-only">
            Where each other Agent's Skills land in your project
          </caption>
          <tbody>
            <tr v-for="agent in unchecked" :key="agent.id" class="border-t border-default">
              <th scope="row" class="py-1 pr-3 text-left font-normal text-muted">
                {{ agent.label }}
              </th>
              <td class="py-1 text-toned">
                {{ agent.projectDir }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>
