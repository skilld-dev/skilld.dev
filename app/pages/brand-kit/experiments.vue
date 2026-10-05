<script setup lang="ts">
import HumanProvenance from '~/components/brand-experiments/HumanProvenance.vue'
import KnowledgeFreshness from '~/components/brand-experiments/KnowledgeFreshness.vue'
import PortableKnowledge from '~/components/brand-experiments/PortableKnowledge.vue'
import SessionBoundary from '~/components/brand-experiments/SessionBoundary.vue'
import SkillBloat from '~/components/brand-experiments/SkillBloat.vue'

const experiments = [
  { id: 'session', label: 'Session', component: SessionBoundary, constraint: 'Run a Skill without keeping it.', question: 'Can the session boundary become a recognisable brand shape?' },
  { id: 'bloat', label: 'Bloat', component: SkillBloat, constraint: 'Keep only the Skills you need.', question: 'Can a dense weave resolving into one thread show the cost of Skill bloat?' },
  { id: 'freshness', label: 'Freshness', component: KnowledgeFreshness, constraint: 'The source can change while your copy stays still.', question: 'Can a visible change seam give watch its own visual language?' },
  { id: 'provenance', label: 'Provenance', component: HumanProvenance, constraint: 'Knowledge has a human source.', question: 'Can a continuous thread make source ownership visible?' },
  { id: 'portability', label: 'Portability', component: PortableKnowledge, constraint: 'The Skill stays the same when you change Agents.', question: 'Can one stable shape moving across contexts express independence?' },
] as const

const selected = ref(0)
const activeExperiment = computed(() => experiments[selected.value]!)
const colorMode = useColorMode()
const dark = computed(() => colorMode.value === 'dark')

useSeoMeta({
  title: 'Brand experiments',
  description: 'Five visual experiments based on the limits skilld solves.',
  robots: 'noindex,nofollow',
})
</script>

<template>
  <div class="brand-lab mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
    <header>
      <NuxtLink to="/brand-kit" class="inline-flex min-h-11 items-center font-mono text-sm text-muted underline underline-offset-4">
        Brand kit
      </NuxtLink>
      <div class="mt-4 flex flex-wrap items-end justify-between gap-5">
        <div class="max-w-2xl">
          <h1 class="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
            Five ways to show what skilld solves.
          </h1>
          <p class="mt-4 text-base leading-relaxed text-muted">
            Each experiment starts with a product limit. These are exploratory visuals, not adopted brand assets.
          </p>
        </div>
        <ClientOnly>
          <UButton
            :label="dark ? 'Light mode' : 'Dark mode'"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="colorMode.preference = dark ? 'light' : 'dark'"
          />
        </ClientOnly>
      </div>
    </header>

    <nav class="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Brand experiments">
      <button
        v-for="(experiment, index) in experiments"
        :key="experiment.id"
        type="button"
        class="experiment-selector min-h-11 rounded-lg border px-3 py-3 text-left font-mono text-sm"
        :class="selected === index ? 'border-primary bg-primary/10 text-default' : 'border-default text-muted hover:text-default'"
        :aria-pressed="selected === index"
        aria-controls="experiment-stage"
        @click="selected = index"
      >
        <span class="mr-2 text-muted">0{{ index + 1 }}</span>{{ experiment.label }}
      </button>
    </nav>

    <section id="experiment-stage" class="mt-6" aria-labelledby="experiment-heading">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-default py-4">
        <h2 id="experiment-heading" class="text-lg font-medium">
          {{ activeExperiment.constraint }}
        </h2>
        <span class="font-mono text-sm text-muted">0{{ selected + 1 }} / 05</span>
      </div>
      <component :is="activeExperiment.component" :key="activeExperiment.id" />
      <p class="mt-6 max-w-2xl text-base leading-relaxed text-muted">
        {{ activeExperiment.question }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.experiment-selector:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 3px;
}
</style>
