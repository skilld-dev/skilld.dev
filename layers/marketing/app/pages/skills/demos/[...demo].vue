<script setup lang="ts">
import type { HomeDemoItem } from '~~/app/utils/home-demos'
import { setResponseHeaders } from 'h3'
import { demoKey } from '~~/app/utils/home-demos'
import { resolveAuthorName } from '~~/app/utils/skill-byline'
import { demoNoun, groupDemos } from '#shared/demo-groups'
import { demoPagePath, DEMOS_PATH, MIN_INDEXABLE_DEMOS, parseDemoRoute } from '#shared/demo-pages'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { pageRobots } from '../../../utils/page-admissions'

/**
 * Every demo, in the board shell `/skills/trending` uses. The rail lists the
 * demos under what each Skill makes; the stage shows one in full: its prompt,
 * its output, and the Skill's run command. `/skills/demos` stages the rail's
 * first demo. Each demo also has its own page at
 * `/skills/demos/<owner>/<repo>/<name>`, which the rail links to.
 *
 * Indexable surface (VISION principle 2): the target query and admission bar
 * live in `page-admissions.ts`, and every demo page reads the `/skills/demos`
 * entry. Below MIN_INDEXABLE_DEMOS every page answers noindex, the same guard
 * `/skills/best` uses. Cull path: remove the admission entry, and the pages go
 * noindex and leave the sitemap on the next deploy.
 */

definePageMeta({
  // One board for every demo, so the rail keeps its place and only the stage swaps.
  key: 'skill-demos',
  // Moving between demos keeps the scroll position. Arriving from another page starts at the top.
  scrollToTop: (to, from) => to.name !== from.name,
})

// `await`, as on the other /skills pages: the server must render the demos.
const { data } = await useFetch<{ items: HomeDemoItem[] }>('/api/skill-demos', { key: 'skill-demos-page' })

const demos = computed(() => data.value?.items ?? [])
const groups = computed(() => groupDemos(demos.value))

const route = useRoute()
const demoRoute = computed(() => parseDemoRoute(route.params.demo))

function findDemo(key: string): HomeDemoItem | undefined {
  return demos.value.find(demo => demoKey(demo).toLowerCase() === key.toLowerCase())
}

// Before demo pages, a pick lived in the query as `?demo=owner/repo/name`. A shared link moves to the demo page.
const legacyKey = typeof route.query.demo === 'string' ? route.query.demo : undefined
const legacyDemo = demoRoute.value._tag === 'index' && legacyKey ? findDemo(legacyKey) : undefined
if (legacyDemo)
  await navigateTo(demoPagePath(legacyDemo), { redirectCode: 301, replace: true })

/** The demo this URL names; undefined on the board, and on a path that names no shown demo. */
const pageDemo = computed(() => demoRoute.value._tag === 'demo' ? findDemo(demoRoute.value.key) : undefined)

const missing = computed(() => demoRoute.value._tag === 'invalid' || (demoRoute.value._tag === 'demo' && !pageDemo.value))
watch(missing, (isMissing) => {
  if (!isMissing)
    return
  // A 404 must not enter the edge cache the demo pages share.
  const event = import.meta.server ? useRequestEvent() : undefined
  if (event)
    setResponseHeaders(event, { 'cloudflare-cdn-cache-control': 'no-store', 'cache-control': 'private, no-store' })
  showError(createError({ statusCode: 404, statusMessage: 'Unknown demo' }))
}, { immediate: true })

// The board stages the rail's first demo.
const current = computed(() => pageDemo.value ?? groups.value[0]?.demos[0])
const currentKey = computed(() => current.value ? demoKey(current.value) : '')

const stage = useTemplateRef<HTMLElement>('stage')
const wide = useMediaQuery('(min-width: 64rem)')
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

/** On narrow screens the stage sits under the rail, so a pick brings it into view. */
function revealStage() {
  if (!wide.value)
    stage.value?.scrollIntoView({ block: 'start', behavior: reducedMotion.value ? 'auto' : 'smooth' })
}

function author(demo: HomeDemoItem): string {
  return resolveAuthorName(demo.owner, demo.authorName) ?? demo.owner
}

/** Cuts text at a word to fit a meta description. */
function clip(text: string, max: number): string {
  if (text.length <= max)
    return text
  return `${text.slice(0, text.lastIndexOf(' ', max - 1))}…`
}

const pageTitle = computed(() => pageDemo.value
  ? `${pageDemo.value.name} skill example: ${demoNoun(pageDemo.value.makes)}`
  : 'Claude skill examples: see what each one makes')
const pageDescription = computed(() => pageDemo.value
  ? clip(`${pageDemo.value.agent} made this ${demoNoun(pageDemo.value.makes)} with the /${pageDemo.value.name} skill from one prompt: “${pageDemo.value.prompt}”`, 160)
  : `${demos.value.length} recorded runs of agent skills: the prompt, and the film, page, component or diagram the Agent made with the Skill. Open any of them live.`)
const canonicalPath = computed(() => pageDemo.value ? demoPagePath(pageDemo.value) : DEMOS_PATH)

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  ogTitle: pageTitle,
  ogDescription: pageDescription,
  robots: () => demos.value.length >= MIN_INDEXABLE_DEMOS ? pageRobots(DEMOS_PATH) : 'noindex,follow',
})

useHead({
  link: [{ rel: 'canonical', href: () => `https://skilld.dev${canonicalPath.value}` }],
})

defineOgImage('Page.takumi', pageDemo.value
  ? { title: `What /${pageDemo.value.name} made`, description: clip(pageDemo.value.prompt, 120) }
  : { title: 'See what skills make', description: 'Recorded runs of agent skills: the prompt, and what the Agent made.' }, { alt: pageDemo.value ? `What /${pageDemo.value.name} made, on skilld` : 'Skill demos on skilld' })
</script>

<template>
  <BoardShell heading-id="demos-heading" surface="demos" :show-weekly-cta="false" :cta-pending="false">
    <template #header>
      <h1 id="demos-heading" class="text-3xl font-semibold tracking-tight text-balance">
        {{ pageDemo ? `What /${pageDemo.name} made` : 'See what skills make' }}
      </h1>
      <p class="mt-2 text-sm text-muted">
        {{ pageDemo ? 'One recorded run: the prompt, and what the Agent built with the Skill.' : 'Each demo is one recorded run: the prompt, and what the Agent built with the Skill.' }}
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
              <NuxtLink
                :to="demoPagePath(demo)"
                class="demos-rail__pick"
                :aria-current="demoKey(demo) !== currentKey ? undefined : pageDemo ? 'page' : 'true'"
                @click="revealStage"
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
              </NuxtLink>
            </li>
          </ul>
        </section>
      </nav>
    </template>

    <div id="demos-stage" ref="stage" class="demos-stage scroll-mt-24">
      <Transition name="demos-swap" mode="out-in">
        <DemoStage v-if="current" :key="currentKey" :demo="current" show-prompt live eager opens="skill-page" surface="demos-page" />
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

.demos-rail__pick[aria-current] {
  background: var(--ui-bg-muted);
}

/* Stone dots, and one rose dot for the demo on the stage. */
.demos-rail__dot {
  inline-size: 0.375rem;
  block-size: 0.375rem;
  border-radius: 9999px;
  background: var(--ui-border-accented);
}

.demos-rail__pick[aria-current] .demos-rail__dot {
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
