<script setup lang="ts">
import type { HomeDemoItem } from '~~/app/utils/home-demos'
import { demoKey } from '~~/app/utils/home-demos'
import { resolveAuthorName } from '~~/app/utils/skill-byline'
import { groupDemos } from '#shared/demo-groups'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { pageRobots } from '../../utils/page-admissions'

/**
 * Every demo, in the board shell `/skills/trending` uses. The rail lists the
 * demos under what each Skill makes; the stage shows the picked one in full:
 * its prompt, its output, and the Skill's run command. A pick lands in the URL
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

const route = useRoute()
const sharedKey = typeof route.query.demo === 'string' ? route.query.demo : undefined

// The rail's first demo leads unless a shared link names another.
const firstDemo = computed(() => groups.value[0]?.demos[0])
const picked = ref(sharedKey ?? (firstDemo.value ? demoKey(firstDemo.value) : ''))
const current = computed(() => demos.value.find(demo => demoKey(demo) === picked.value) ?? firstDemo.value)
const currentKey = computed(() => current.value ? demoKey(current.value) : '')

const stage = useTemplateRef<HTMLElement>('stage')
const wide = useMediaQuery('(min-width: 64rem)')
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

/** Shows the demo, keeps it in the URL, and on narrow screens brings the stage into view. */
function pick(demo: HomeDemoItem) {
  picked.value = demoKey(demo)
  if (!wide.value)
    stage.value?.scrollIntoView({ block: 'start', behavior: reducedMotion.value ? 'auto' : 'smooth' })
  return navigateTo({ query: { ...route.query, demo: demoKey(demo) }, hash: route.hash }, { replace: true })
}

function author(demo: HomeDemoItem): string {
  return resolveAuthorName(demo.owner, demo.authorName) ?? demo.owner
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
</script>

<template>
  <BoardShell heading-id="demos-heading" surface="demos" :show-weekly-cta="false" :cta-pending="false">
    <template #header>
      <h1 id="demos-heading" class="text-3xl font-semibold tracking-tight text-balance">
        See what skills make
      </h1>
      <p class="mt-2 text-sm text-muted">
        Each demo is one recorded run: the prompt, and what the Agent built with the Skill.
      </p>
    </template>

    <template #sidebar>
      <nav aria-label="Demos" class="demos-rail">
        <section v-for="group in groups" :key="group.makes" :aria-labelledby="`demos-${group.makes}`">
          <h2 :id="`demos-${group.makes}`" class="demos-rail__heading">
            {{ group.label }}
          </h2>
          <ul class="list-none p-0">
            <li v-for="demo in group.demos" :key="demoKey(demo)">
              <button
                type="button"
                class="demos-rail__pick"
                :aria-pressed="demoKey(demo) === currentKey"
                aria-controls="demos-stage"
                @click="() => pick(demo)"
              >
                <span class="demos-rail__dot" aria-hidden="true" />
                <img
                  :src="githubAvatarProxyUrl(demo.owner, 40)"
                  alt=""
                  width="20"
                  height="20"
                  loading="lazy"
                  decoding="async"
                  class="demos-rail__avatar"
                >
                <span class="min-w-0">
                  <span class="demos-rail__name">/{{ demo.name }}</span>
                  <span class="demos-rail__by">{{ author(demo) }}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      </nav>
    </template>

    <div id="demos-stage" ref="stage" class="demos-stage scroll-mt-24">
      <Transition name="demos-swap" mode="out-in">
        <DemoStage v-if="current" :key="currentKey" :demo="current" show-prompt live eager surface="demos-page" />
      </Transition>
      <p v-if="!current" class="text-sm text-muted">
        No demos are published yet.
      </p>
    </div>
  </BoardShell>
</template>

<style scoped>
.demos-rail {
  display: grid;
  gap: 1.25rem;
}

.demos-rail__heading {
  margin-block-end: 0.375rem;
  padding-inline: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.demos-rail__pick {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 0.5rem;
  inline-size: 100%;
  min-block-size: 2.75rem;
  padding: 0.375rem 0.5rem;
  border-radius: var(--ui-radius);
  text-align: start;
  cursor: pointer;
  transition: background-color 150ms ease;
}

@media (hover: hover) {
  .demos-rail__pick:hover {
    background: var(--ui-bg-elevated);
  }
}

.demos-rail__pick:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

.demos-rail__pick[aria-pressed='true'] {
  background: var(--ui-bg-muted);
}

/* Stone dots, and one rose dot for the demo on the stage. */
.demos-rail__dot {
  inline-size: 0.375rem;
  block-size: 0.375rem;
  border-radius: 9999px;
  background: var(--ui-border-accented);
}

.demos-rail__pick[aria-pressed='true'] .demos-rail__dot {
  background: var(--ui-primary);
}

.demos-rail__avatar {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  border-radius: 9999px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
}

.demos-rail__name {
  display: block;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: var(--ui-text-highlighted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demos-rail__by {
  display: block;
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--ui-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 64rem) {
  .demos-stage {
    position: sticky;
    inset-block-start: 5rem;
  }
}

.demos-swap-enter-active,
.demos-swap-leave-active {
  transition: opacity 150ms ease-out;
}

.demos-swap-enter-from,
.demos-swap-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .demos-rail__pick,
  .demos-swap-enter-active,
  .demos-swap-leave-active {
    transition: none;
  }
}
</style>
