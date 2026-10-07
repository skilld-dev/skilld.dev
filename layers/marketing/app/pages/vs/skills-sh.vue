<script setup lang="ts">
import type { TrendingFeedResponse } from '~~/server/api/feed/trending.get'
import type { HomeDemoItem } from '~/utils/home-demos'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { feedBoardRows } from '#shared/trending-range'
import WhyText from '~/components/why/_WhyText.vue'
import WhyVisual from '~/components/why/_WhyVisual.vue'
import { AGENT_TARGETS } from '~/utils/agents'
import { comparisonRows, SKILLS_SH_CHECKED_ON, skillsShLeads, VS_WHY_REASONS, WHY_REASONS } from '~/utils/why-skilld'
import { pageRobots } from '../../utils/page-admissions'

const PATH = '/vs/skills-sh'
const canonicalUrl = `https://skilld.dev${PATH}`
const title = 'skilld vs skills.sh: a skills.sh alternative'
const description = 'Looking for a skills.sh alternative? skilld runs a Skill without writing files, shows every file first, and ranks Skills by devs, not installs.'

useSeoMeta({
  title,
  description,
  author: 'Harlan Wilton',
  ogTitle: title,
  ogDescription: description,
  ogUrl: canonicalUrl,
  robots: pageRobots(PATH),
})
useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })
defineOgImage('Page.takumi', { title: 'skilld vs skills.sh', description }, { alt: 'skilld vs skills.sh' })

// Two pictures draw live data: the head of the trending board and one demo.
// Both endpoints are cached at the edge, and each picture draws without them.
const [{ data: trendingRow }, { data: demo }] = await Promise.all([
  useFetch('/api/feed/trending', {
    key: 'vs-skills-sh-trending',
    query: { limit: 6 },
    transform: (feed: TrendingFeedResponse) => feedBoardRows(feed).find(row => row.reason._tag === 'posts') ?? null,
  }),
  useFetch('/api/skill-demos', {
    key: 'vs-skills-sh-demo',
    transform: (response: { items: HomeDemoItem[] }) => response.items[0] ?? null,
  }),
])

const reasons = VS_WHY_REASONS.map(id => WHY_REASONS[id])
const leads = skillsShLeads(AGENT_TARGETS.length)
const rows = comparisonRows(AGENT_TARGETS.length)

function sourceLabel(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}
</script>

<template>
  <article class="vs-page">
    <header class="vs-page__head mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <h1 class="vs-page__title font-semibold text-highlighted text-balance">
        skilld vs skills.sh
      </h1>
      <p class="mt-5 max-w-2xl text-base leading-relaxed text-muted text-pretty md:text-lg">
        skills.sh is Vercel's directory of Agent Skills. It lists every public Skill its CLI has seen and ranks them by installs. skilld is smaller: curated Skills, ranked by devs, with every file readable before your agent runs one.
      </p>
      <div class="mt-5 flex items-center gap-3">
        <img
          :src="githubAvatarProxyUrl('harlan-zw', 64)"
          alt=""
          width="32"
          height="32"
          class="size-8 shrink-0 rounded-full border border-default"
        >
        <p class="data-label">
          Written by Harlan Wilton · skills.sh facts checked {{ SKILLS_SH_CHECKED_ON }}
        </p>
      </div>
      <nav class="vs-page__index mt-8" aria-label="On this page">
        <ol class="list-none p-0">
          <li v-for="(reason, index) in reasons" :key="reason.id">
            <a :href="`#${reason.id}`">
              <span class="vs-page__index-num">{{ String(index + 1).padStart(2, '0') }}</span>
              {{ reason.title }}
            </a>
          </li>
        </ol>
      </nav>
    </header>

    <div class="mx-auto max-w-6xl px-4 sm:px-6">
      <section
        v-for="(reason, index) in reasons"
        :id="reason.id"
        :key="reason.id"
        class="vs-row"
        :data-flip="index % 2 === 1 ? '' : undefined"
        :aria-labelledby="`${reason.id}-heading`"
      >
        <div class="vs-row__words">
          <p class="data-label">
            {{ String(index + 1).padStart(2, '0') }} / {{ String(reasons.length).padStart(2, '0') }}
          </p>
          <h2 :id="`${reason.id}-heading`" class="vs-row__title text-highlighted text-balance">
            {{ reason.title }}
          </h2>
          <p class="mt-3 text-base leading-relaxed text-default text-pretty">
            <WhyText :text="reason.line" />
          </p>
          <div class="vs-row__them">
            <p class="vs-row__them-label">
              skills.sh
            </p>
            <p class="text-sm leading-relaxed text-muted text-pretty">
              <WhyText :text="reason.skillsSh" />
            </p>
            <p class="vs-row__sources">
              <a
                v-for="source in reason.sources"
                :key="source"
                :href="source"
                target="_blank"
                rel="nofollow noopener"
              >
                {{ sourceLabel(source) }}<UIcon name="i-lucide-arrow-up-right" class="size-3 shrink-0" aria-hidden="true" />
              </a>
            </p>
          </div>
          <template v-if="reason.link">
            <a
              v-if="reason.link.external"
              :href="reason.link.to"
              target="_blank"
              rel="noopener"
              class="vs-row__link"
            >
              {{ reason.link.label }}
              <UIcon name="i-lucide-arrow-up-right" class="size-3.5 shrink-0" aria-hidden="true" />
            </a>
            <NuxtLink v-else :to="reason.link.to" class="vs-row__link">
              {{ reason.link.label }}
              <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
            </NuxtLink>
          </template>
        </div>
        <div class="vs-row__visual">
          <WhyVisual :id="reason.id" :trending-row="trendingRow" :demo />
        </div>
      </section>

      <section class="vs-block" aria-labelledby="leads-heading">
        <h2 id="leads-heading" class="vs-block__title text-highlighted">
          Where skills.sh is ahead
        </h2>
        <ul class="vs-leads mt-6 list-none p-0">
          <li v-for="lead in leads" :key="lead.title" class="vs-leads__item">
            <h3 class="text-base font-semibold text-highlighted">
              {{ lead.title }}
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted text-pretty">
              {{ lead.line }}
            </p>
            <p class="vs-row__sources">
              <a
                v-for="source in lead.sources"
                :key="source"
                :href="source"
                target="_blank"
                rel="nofollow noopener"
              >
                {{ sourceLabel(source) }}<UIcon name="i-lucide-arrow-up-right" class="size-3 shrink-0" aria-hidden="true" />
              </a>
            </p>
          </li>
        </ul>
      </section>

      <section class="vs-block" aria-labelledby="table-heading">
        <h2 id="table-heading" class="vs-block__title text-highlighted">
          Side by side
        </h2>
        <div class="vs-table-wrap mt-6">
          <table class="vs-table">
            <thead>
              <tr>
                <th scope="col">
                  <span class="sr-only">Feature</span>
                </th>
                <th scope="col">
                  skills.sh
                </th>
                <th scope="col">
                  skilld
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.label">
                <th scope="row">
                  {{ row.label }}
                </th>
                <td><WhyText :text="row.skillsSh" /></td>
                <td><WhyText :text="row.skilld" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="vs-close" aria-labelledby="close-heading">
        <h2 id="close-heading" class="vs-block__title text-highlighted text-balance">
          Both read the same SKILL.md files.
        </h2>
        <p class="mt-3 max-w-2xl text-base leading-relaxed text-muted text-pretty">
          The difference is what you see before your agent runs one, and who decides what ranks.
        </p>
        <div class="mt-6 flex flex-wrap items-center gap-3">
          <UButton
            to="/skills"
            label="Browse skills"
            trailing-icon="i-lucide-arrow-right"
            class="min-h-11"
          />
          <UButton
            to="/cli"
            label="Get the CLI"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
.vs-page__title {
  font-size: clamp(2.5rem, 2rem + 2.5vw, 3.75rem);
  letter-spacing: -0.045em;
  line-height: 1;
}

.vs-page__index ol {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.vs-page__index a {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text);
  transition: border-color 200ms ease-out;
}

.vs-page__index a:hover,
.vs-page__index a:focus-visible {
  border-color: var(--ui-border-accented);
}

.vs-page__index-num {
  color: var(--ui-text-dimmed);
}

.vs-row {
  display: grid;
  /* minmax, so a nowrap line inside a picture cannot widen the column past the screen. */
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
  margin-top: 3rem;
  padding-top: 2.5rem;
  border-top: 1px solid var(--ui-border);
  scroll-margin-top: 5rem;
}

@media (min-width: 56rem) {
  .vs-row {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: 4rem;
    align-items: center;
  }

  /* The picture leads on every other row, at the same width as the others. */
  .vs-row[data-flip] {
    grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
  }

  .vs-row[data-flip] .vs-row__words {
    order: 2;
  }
}

.vs-row__title {
  margin-top: 0.5rem;
  font-size: clamp(1.5rem, 1.25rem + 1vw, 2rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.vs-row__them {
  margin-top: 1.25rem;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--ui-border-accented);
  border-radius: var(--ui-radius);
}

.vs-row__them-label {
  margin-bottom: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.vs-row__sources {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  margin-top: 0.375rem;
}

.vs-row__sources a {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  min-height: 1.75rem;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--ui-text-dimmed);
}

.vs-row__sources a:hover {
  color: var(--ui-text-muted);
}

.vs-row__link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 2.75rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--ui-text);
  text-decoration-line: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.25em;
}

.vs-row__link:hover {
  text-decoration-color: currentColor;
}

.vs-block {
  margin-top: 4rem;
  padding-top: 2.5rem;
  border-top: 1px solid var(--ui-border);
}

.vs-block__title {
  font-size: clamp(1.5rem, 1.25rem + 1vw, 2rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.vs-leads {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
}

@media (min-width: 48rem) {
  .vs-leads {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.vs-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.vs-table {
  width: 100%;
  min-width: 36rem;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.vs-table th,
.vs-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  vertical-align: top;
}

.vs-table thead th {
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.vs-table tbody tr + tr {
  border-top: 1px solid var(--ui-border);
}

.vs-table tbody th {
  width: 28%;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ui-text-muted);
}

.vs-table td {
  color: var(--ui-text);
}

.vs-table td:first-of-type {
  color: var(--ui-text-muted);
}

.vs-close {
  margin-top: 4rem;
  padding-block: 2.5rem 4rem;
  border-top: 1px solid var(--ui-border);
}

@media (prefers-reduced-motion: reduce) {
  .vs-page__index a {
    transition: none;
  }
}
</style>
