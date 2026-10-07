<script setup lang="ts">
import type { BehaviorReading } from '#shared/behavior-readings'
import { behaviorVerdictLabel } from '#shared/behavior-readings'
import { behaviorIcon } from '../utils/skill-behaviors'

// Feature-local: SkillDetail is the only consumer. Lists what SKILL.md and the
// file names ask an Agent to do, each with links to where it appears, so the
// reader can check the exact lines before running the Skill. A match that
// needs approval can carry a behavior reading: a language model's reading of
// the line in its context (ADR-0016). It annotates the match and never
// changes the approval.

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

const { behaviors, readings = [] } = defineProps<{
  behaviors: SkillBehavior[]
  readings?: BehaviorReading[]
}>()

const readingByLocation = computed(() => new Map(readings.map(reading => [`${reading.behavior}:${reading.path}:${reading.line}`, reading])))

function readingFor(behavior: SkillBehavior, location: SkillBehaviorLocation): BehaviorReading | null {
  if (behavior.tier !== 'ask' || location.line === null)
    return null
  return readingByLocation.value.get(`${behavior.id}:${location.path}:${location.line}`) ?? null
}

function hasReadings(behavior: SkillBehavior): boolean {
  return behavior.locations.some(location => readingFor(behavior, location) !== null)
}

function locationRows(behavior: SkillBehavior): Array<{ location: SkillBehaviorLocation, reading: BehaviorReading | null }> {
  return behavior.locations.map(location => ({ location, reading: readingFor(behavior, location) }))
}

const anyReading = computed(() => behaviors.some(hasReadings))

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
            <ul
              v-if="hasReadings(behavior)"
              role="list"
              class="mt-1 space-y-1"
            >
              <li
                v-for="{ location, reading } in locationRows(behavior)"
                :key="`${location.path}:${location.line}`"
                class="break-words text-xs leading-snug"
              >
                <a
                  v-if="location.url"
                  :href="location.url"
                  target="_blank"
                  rel="noopener"
                  class="font-mono text-muted hover:text-default transition-colors"
                >{{ locationLabel(location) }}</a>
                <span
                  v-else
                  class="font-mono text-muted"
                >{{ locationLabel(location) }}</span>
                <template v-if="reading">
                  <span class="font-mono text-default"> · {{ behaviorVerdictLabel(reading.verdict) }}</span>
                  <span
                    v-if="reading.reason"
                    class="text-muted"
                  >. {{ reading.reason }}</span>
                </template>
              </li>
              <li
                v-if="behavior.total > behavior.locations.length"
                class="font-mono text-xs text-muted"
              >
                {{ behavior.total - behavior.locations.length }} more
              </li>
            </ul>
            <p
              v-else
              class="mt-0.5 break-words font-mono text-xs text-muted leading-snug"
            >
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
        <p
          v-if="anyReading"
        >
          A language model read each match that needs approval in its context. Its reading is no guarantee and changes no approval.
        </p>
        <p>
          <code class="font-mono">skilld run</code> checks every file with the same patterns. It asks for approval before it loads a Skill with a behavior marked Needs approval.
        </p>
      </div>
    </div>
  </section>
</template>
