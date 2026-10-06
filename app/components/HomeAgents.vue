<script setup lang="ts">
import { agentSetupPrompt, REGISTRY_MCP_URL } from '#shared/agent-setup'
import { AGENT_REACH, MORE_AGENT_COUNT } from '~/utils/agent-reach'
import { AGENT_TARGETS } from '~/utils/agents'

/**
 * Every way into skilld, by what the Agent can do: read a pasted prompt, run
 * a terminal command, or speak MCP. The tiles show which Agents those paths
 * reach, so a visitor finds their own tool before they read a command.
 */
const setupPrompt = agentSetupPrompt()
</script>

<template>
  <section id="agents" class="home-wm" aria-labelledby="agents-heading">
    <!-- The mask fades the word to the right, so it stays short like Week and Work. -->
    <span class="home-watermark" aria-hidden="true">Any</span>
    <div class="home-agents mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <div class="min-w-0">
        <h2 id="agents-heading" class="home-h2 text-balance">
          Works with <span class="home-ink">your agent</span>.
        </h2>
        <p class="mt-4 max-w-xl text-base leading-relaxed text-muted text-pretty">
          The CLI installs into {{ AGENT_TARGETS.length }} Agents. ChatGPT, Claude, and other MCP apps search the registry from the chat.
        </p>
        <ul class="home-agents__tiles mt-8 list-none p-0" aria-label="Agents skilld works with">
          <li v-for="agent in AGENT_REACH" :key="agent.id">
            <NuxtLink :to="agent.to" class="home-agents__tile" :aria-label="`${agent.label}, ${agent.via}`">
              <UIcon :name="agent.icon" class="size-5 shrink-0 text-default" aria-hidden="true" />
              <span class="min-w-0 truncate text-sm font-medium text-default">{{ agent.label }}</span>
              <!-- Hidden on phones, where two tiles share a row and the name needs the room. -->
              <span class="data-label ml-auto hidden shrink-0 sm:inline" aria-hidden="true">{{ agent.via }}</span>
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/cli#install" class="home-agents__tile home-agents__tile--more">
              <span class="text-sm text-muted">+{{ MORE_AGENT_COUNT }} more Agents</span>
              <UIcon name="i-lucide-arrow-right" class="ml-auto size-4 shrink-0 text-muted" aria-hidden="true" />
            </NuxtLink>
          </li>
        </ul>
      </div>

      <ol class="home-agents__ways list-none p-0" aria-label="Ways to set up skilld">
        <li class="home-agents__way">
          <h3 class="text-sm font-semibold text-highlighted">
            Paste into any agent
          </h3>
          <p class="mt-1 text-sm leading-relaxed text-muted">
            Your agent reads the setup steps and picks the path that fits it.
          </p>
          <CopyText class="mt-3" :text="setupPrompt" label="setup prompt" />
        </li>
        <li class="home-agents__way">
          <h3 class="text-sm font-semibold text-highlighted">
            From a terminal
          </h3>
          <p class="mt-1 text-sm leading-relaxed text-muted">
            Teaches your agent to search and run Skills in every project.
          </p>
          <SkilldInstallChip class="mt-3" surface="home-agents" />
        </li>
        <li class="home-agents__way">
          <h3 class="text-sm font-semibold text-highlighted">
            In ChatGPT, Claude, and other MCP apps
          </h3>
          <p class="mt-1 text-sm leading-relaxed text-muted">
            Add the server once. Then ask the chat to find a Skill.
          </p>
          <CopyText class="mt-3" :text="REGISTRY_MCP_URL" label="MCP server URL" />
          <NuxtLink
            to="/developers?setup=mcp"
            class="mt-2 inline-flex min-h-11 items-center gap-1 text-sm text-default underline underline-offset-4 hover:text-primary"
          >
            Setup steps for each app
            <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
          </NuxtLink>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.home-agents {
  display: grid;
  gap: 2.5rem;
}

@media (min-width: 64rem) {
  .home-agents {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 4rem;
    align-items: start;
  }
}

.home-agents__tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.home-agents__tile {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.75rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  transition: border-color 150ms ease;
}

.home-agents__tile:hover,
.home-agents__tile:focus-visible {
  border-color: var(--ui-border-accented);
}

.home-agents__tile--more {
  border-style: dashed;
}

.home-agents__ways {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
}

.home-agents__way {
  padding: 1rem;
}

.home-agents__way + .home-agents__way {
  border-top: 1px solid var(--ui-border);
}

@media (prefers-reduced-motion: reduce) {
  .home-agents__tile {
    transition: none;
  }
}
</style>
