<script setup lang="ts">
import { behaviorIcon } from '../utils/skill-behaviors'

// Feature-local: SkillDetail is the only consumer. Lists what SKILL.md and the
// file names ask an Agent to do, each with links to where it appears, so the
// reader can check the exact lines before running the Skill.

export interface SkillBehaviorLocation {
  path: string
  line: number | null
  url: string | null
}

export interface SkillBehavior {
  id: string
  tier: 'ask' | 'show'
  label: string
  locations: SkillBehaviorLocation[]
  total: number
}

const { behaviors } = defineProps<{
  behaviors: SkillBehavior[]
}>()

function locationLabel(location: SkillBehaviorLocation): string {
  return location.line === null ? location.path : `${location.path}:${location.line}`
}
</script>

<template>
  <section
    id="skill-behaviors"
    aria-labelledby="skill-behaviors-heading"
    class="scroll-mt-20 md:col-span-2"
  >
    <h2
      id="skill-behaviors-heading"
      class="section-label mb-3"
    >
      Skill behaviors
    </h2>

    <div class="rounded-lg border border-default">
      <ul
        v-if="behaviors.length"
        role="list"
        class="divide-y divide-default"
      >
        <li
          v-for="behavior in behaviors"
          :key="behavior.id"
          class="flex items-start gap-3 px-4 py-3"
        >
          <UIcon
            :name="behaviorIcon(behavior)"
            :class="behavior.tier === 'ask' ? 'text-warning' : 'text-muted'"
            class="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-baseline gap-x-2 font-mono text-sm text-default">
              {{ behavior.label }}
              <span
                v-if="behavior.tier === 'ask'"
                class="font-mono text-[10px] uppercase tracking-wide text-default"
              >Needs approval</span>
            </p>
            <p class="mt-0.5 break-words font-mono text-xs text-muted leading-snug">
              <template
                v-for="(location, index) in behavior.locations"
                :key="`${location.path}:${location.line}`"
              >
                <a
                  v-if="location.url"
                  :href="location.url"
                  target="_blank"
                  rel="noopener"
                  class="hover:text-default transition-colors"
                >{{ locationLabel(location) }}</a>
                <span v-else>{{ locationLabel(location) }}</span>
                <span v-if="index < behavior.locations.length - 1">, </span>
              </template>
              <span v-if="behavior.total > behavior.locations.length">, {{ behavior.total - behavior.locations.length }} more</span>
            </p>
          </div>
        </li>
      </ul>
      <p
        v-else
        class="px-4 py-3 font-mono text-xs text-muted"
      >
        No rule matched.
      </p>
      <div class="space-y-1 border-t border-default bg-muted/20 px-4 py-3 text-xs text-muted leading-snug">
        <p>skilld matched fixed text patterns in SKILL.md and file names. Patterns miss obfuscated code.</p>
        <p>
          <code class="font-mono">skilld run</code> checks every file with the same patterns. It asks for approval before it loads a Skill with a behavior marked Needs approval.
        </p>
      </div>
    </div>
  </section>
</template>
