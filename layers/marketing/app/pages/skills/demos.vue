<script setup lang="ts">
import type { HomeDemoItem } from '~~/app/utils/home-demos'
import { demoKey } from '~~/app/utils/home-demos'
import { groupDemos } from '#shared/demo-groups'
import { pageRobots } from '../../utils/page-admissions'

/**
 * Every demo, grouped by what the Skill makes. Each group is a prompt index:
 * pick a prompt and the stage shows the output. A picked demo lands in the URL
 * as `?demo=owner/repo/name`, so a shared link opens on it.
 *
 * Indexable surface (VISION principle 2): the target query and admission bar
 * live in `page-admissions.ts`. Below MIN_INDEXABLE_DEMOS the page answers
 * noindex, the same guard `/skills/best` uses. Cull path: remove the
 * admission entry, and the page goes noindex on the next deploy.
 */

// `await`, as on the other /skills pages: the server must render the demos.
const { data } = await useFetch<{ items: HomeDemoItem[] }>('/api/skill-demos', { key: 'skill-demos-page' })

const demos = computed(() => data.value?.items ?? [])
const groups = computed(() => groupDemos(demos.value))
const filmCount = computed(() => demos.value.filter(demo => demo.video).length)

const route = useRoute()
const sharedKey = typeof route.query.demo === 'string' ? route.query.demo : undefined

/** Keeps the picked demo in the URL without adding history or moving the page. */
function rememberPick(demo: HomeDemoItem) {
  return navigateTo({ query: { ...route.query, demo: demoKey(demo) }, hash: route.hash }, { replace: true })
}

/** Below this many demos the page is too thin to index. */
const MIN_INDEXABLE_DEMOS = 6

const title = 'Claude skill examples: see what each one makes'
const description = computed(() =>
  `${demos.value.length} recorded runs of agent skills: the prompt, and the film, page, component or diagram the Agent made with the Skill. Open any of them live.`,
)

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  robots: () => demos.value.length >= MIN_INDEXABLE_DEMOS ? pageRobots('/skills/demos') : 'noindex,follow',
})

useHead({
  link: [{ rel: 'canonical', href: 'https://skilld.dev/skills/demos' }],
})

defineOgImage('Page.takumi', {
  title: 'See what skills make',
  description: 'Recorded runs of agent skills: the prompt, and what the Agent made.',
}, { alt: 'Skill demos on skilld' })

function groupId(makes: string): string {
  return `demos-${makes}`
}

// A shared link scrolls to its demo's group once the page has painted.
onMounted(() => {
  const demo = sharedKey ? demos.value.find(item => demoKey(item) === sharedKey) : undefined
  if (demo)
    document.getElementById(groupId(demo.makes))?.scrollIntoView({ block: 'start' })
})
</script>

<template>
  <div>
    <CompactPageHeader
      title="See what skills make"
      description="Each demo is one recorded run: the prompt, and what the Agent built with the Skill. Pick a prompt to see the output, or open it live."
      heading-id="demos-heading"
    >
      <template #aside>
        <dl class="flex flex-wrap gap-x-6 gap-y-3 md:justify-end">
          <div>
            <dt class="data-label">
              Demos
            </dt>
            <dd class="mt-1 font-mono text-sm tabular-nums">
              {{ demos.length }}
            </dd>
          </div>
          <div>
            <dt class="data-label">
              Films
            </dt>
            <dd class="mt-1 font-mono text-sm tabular-nums">
              {{ filmCount }}
            </dd>
          </div>
        </dl>
      </template>
      <nav v-if="groups.length > 1" aria-label="Demo groups">
        <ul class="flex list-none flex-wrap gap-2 p-0">
          <li v-for="group in groups" :key="group.makes">
            <a :href="`#${groupId(group.makes)}`" class="demos-page__jump">
              {{ group.label }}
              <span class="font-mono text-xs text-muted tabular-nums">{{ group.demos.length }}</span>
            </a>
          </li>
        </ul>
      </nav>
    </CompactPageHeader>

    <div class="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6 md:py-14">
      <section
        v-for="group in groups"
        :id="groupId(group.makes)"
        :key="group.makes"
        class="scroll-mt-24"
        :aria-labelledby="`${groupId(group.makes)}-heading`"
      >
        <h2 :id="`${groupId(group.makes)}-heading`" class="text-xl font-semibold tracking-tight text-highlighted">
          {{ group.label }}
        </h2>
        <p class="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          {{ group.line }}
        </p>
        <DemoIndex
          :demos="group.demos"
          :initial-key="sharedKey"
          surface="demos-page"
          class="mt-6"
          @pick="rememberPick"
        />
      </section>

      <p v-if="!groups.length" class="text-sm text-muted">
        No demos are published yet.
      </p>
    </div>
  </div>
</template>

<style scoped>
.demos-page__jump {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0 0.875rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  font-size: 0.875rem;
  color: var(--ui-text);
  transition: border-color 150ms ease;
}

.demos-page__jump:hover,
.demos-page__jump:focus-visible {
  border-color: var(--ui-border-accented);
}

@media (prefers-reduced-motion: reduce) {
  .demos-page__jump {
    transition: none;
  }
}
</style>
