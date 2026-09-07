<script setup lang="ts">
import GithubBadgePreview from './_GithubBadgePreview.vue'

const showLikes = ref(false)
const showLabel = ref(true)
const target = ref<'repository' | 'skill'>('repository')
const githubTheme = ref<'light' | 'dark'>('light')
const badgeDestination = computed(() => target.value === 'repository'
  ? 'skilld.dev/gh/jd-solanki/skills'
  : 'skilld.dev/gh/jd-solanki/skills/setup-jd-solanki-skills')
const badgeWidth = computed(() => (showLabel.value ? 153 : 81) + (showLikes.value ? 46 : 0))

const readmeSnippetInput = {
  owner: 'jd-solanki',
  repo: 'skills',
  name: 'skills',
  registryPath: '/gh/jd-solanki/skills',
}

useSeoMeta({
  title: 'GitHub badge · Brand kit',
  description: 'Add the skilld badge to a README. It links readers to the Skill or Repository page and shows no counts.',
  robots: 'index,follow',
})

useHead({
  link: [{ rel: 'canonical', href: 'https://skilld.dev/brand-kit/github-badge' }],
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 md:py-16">
    <header class="max-w-2xl">
      <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
        The GitHub badge, a small mark with one job
      </h1>
      <p class="data-label mt-3">
        Brand kit
      </p>
      <p class="mt-4 text-base leading-relaxed text-muted">
        Make a skill recognizable in a README, then earn the click.
      </p>
    </header>

    <div class="mt-8 grid gap-4 border-y border-default py-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="flex flex-wrap items-center gap-3">
        <span class="font-mono text-sm text-muted">Target</span>
        <div class="flex gap-2" role="group" aria-label="Badge target preview">
          <UButton
            label="Repository"
            color="neutral"
            :variant="target === 'repository' ? 'soft' : 'outline'"
            :aria-pressed="target === 'repository'"
            class="min-h-11"
            @click="target = 'repository'"
          />
          <UButton
            label="Individual skill"
            color="neutral"
            :variant="target === 'skill' ? 'soft' : 'outline'"
            :aria-pressed="target === 'skill'"
            class="min-h-11"
            @click="target = 'skill'"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <span class="font-mono text-sm text-muted">Category</span>
        <div class="flex gap-2" role="group" aria-label="Badge category preview">
          <UButton
            label="Show"
            color="neutral"
            :variant="showLabel ? 'soft' : 'outline'"
            :aria-pressed="showLabel"
            class="min-h-11"
            @click="showLabel = true"
          />
          <UButton
            label="Hide"
            color="neutral"
            :variant="showLabel ? 'outline' : 'soft'"
            :aria-pressed="!showLabel"
            class="min-h-11"
            @click="showLabel = false"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <span class="font-mono text-sm text-muted">Data</span>
        <div class="flex gap-2" role="group" aria-label="Badge data preview">
          <UButton
            label="Plain"
            color="neutral"
            :variant="showLikes ? 'outline' : 'soft'"
            :aria-pressed="!showLikes"
            class="min-h-11"
            @click="showLikes = false"
          />
          <UButton
            label="With likes"
            color="neutral"
            :variant="showLikes ? 'soft' : 'outline'"
            :aria-pressed="showLikes"
            class="min-h-11"
            @click="showLikes = true"
          />
        </div>
      </div>
    </div>

    <section class="mt-10" aria-labelledby="readme-context-heading">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="readme-context-heading" class="text-xl font-semibold text-highlighted">
            jd-solanki/skills
          </h2>
          <p class="data-label mt-2">
            README context
          </p>
        </div>
        <a
          href="https://github.com/jd-solanki/skills/tree/main"
          target="_blank"
          rel="noopener noreferrer"
          class="font-mono text-sm text-muted underline decoration-default underline-offset-4 hover:text-default"
        >
          Open repository
        </a>
      </div>

      <div
        class="github-readme mt-5 overflow-hidden rounded-lg border"
        :class="{ 'github-readme--dark': githubTheme === 'dark' }"
        :data-github-theme="githubTheme"
      >
        <div class="github-readme__bar flex min-h-11 items-center justify-between border-b ps-5">
          <div class="flex items-center gap-2">
            <span class="size-3 rounded-full bg-[#ff5f57]" aria-hidden="true" />
            <span class="size-3 rounded-full bg-[#febc2e]" aria-hidden="true" />
            <span class="size-3 rounded-full bg-[#28c840]" aria-hidden="true" />
            <span class="ml-2 font-mono text-xs">README.md</span>
          </div>
          <div class="flex" role="group" aria-label="README preview color">
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              class="min-h-11 min-w-11 justify-center rounded-none"
              aria-label="Preview light badge"
              :aria-pressed="githubTheme === 'light'"
              @click="githubTheme = 'light'"
            >
              <span
                class="size-3 rounded-sm border"
                :class="githubTheme === 'light' ? 'border-primary ring-2 ring-primary/20' : 'border-default'"
                style="background: #f6f8fa"
                aria-hidden="true"
              />
            </UButton>
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              class="min-h-11 min-w-11 justify-center rounded-none"
              aria-label="Preview dark badge"
              :aria-pressed="githubTheme === 'dark'"
              @click="githubTheme = 'dark'"
            >
              <span
                class="size-3 rounded-sm border"
                :class="githubTheme === 'dark' ? 'border-primary ring-2 ring-primary/20' : 'border-default'"
                style="background: #0d1117"
                aria-hidden="true"
              />
            </UButton>
          </div>
        </div>
        <div class="px-5 py-7 sm:px-8 sm:py-9">
          <h3 class="github-readme__title text-2xl font-semibold">
            JD Solanki's AI Agent Skills
          </h3>
          <div class="mt-5 flex items-center" aria-live="polite">
            <GithubBadgePreview
              :target="target"
              :theme="githubTheme"
              :show-label="showLabel"
              :show-likes="showLikes"
              class="max-w-full"
            />
          </div>
          <p class="github-readme__meta mt-4 break-all font-mono text-xs">
            Links to {{ badgeDestination }}
          </p>
          <h4 class="github-readme__subtitle mt-8 text-lg font-semibold">
            Setup
          </h4>
          <code class="github-readme__code mt-3 block w-fit max-w-full overflow-x-auto rounded-md border px-3 py-2 text-sm">npx skills@latest add jd-solanki/skills</code>
        </div>
      </div>
    </section>

    <section class="mt-12 grid gap-6 border-y border-default py-8 md:grid-cols-[minmax(260px,0.8fr)_1fr] md:items-center" aria-labelledby="chosen-badge-heading">
      <div class="flex min-h-24 items-center justify-center rounded-lg bg-muted px-5 py-7">
        <GithubBadgePreview
          :target="target"
          :theme="githubTheme"
          :show-label="showLabel"
          :show-likes="showLikes"
          class="max-w-full"
        />
      </div>
      <div class="max-w-xl">
        <h2 id="chosen-badge-heading" class="text-xl font-semibold text-highlighted">
          Category first
        </h2>
        <p class="mt-2 text-base leading-relaxed text-muted">
          Show the artifact when context helps. Hide it when space matters.
        </p>
        <p class="mt-3 font-mono text-xs text-muted">
          {{ badgeWidth }} × 22 px · GitHub selects the matching theme automatically
        </p>
      </div>
    </section>

    <div class="mt-12 max-w-2xl">
      <BadgeReadmeSnippet v-bind="readmeSnippetInput" />
      <p class="mt-3 text-sm leading-relaxed text-muted">
        Replace <code class="font-mono text-xs">jd-solanki/skills</code> with your own <code class="font-mono text-xs">owner/repository</code>. Add a third segment for one Skill. The copy button on any Repository page fills it in for you.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* GitHub's fixed canvas colors stay local to this third-party context preview. */
.github-readme {
  color-scheme: light;
  color: #1f2328;
  background: #ffffff;
  border-color: #d0d7de;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.github-readme__bar {
  color: #59636e;
  background: #f6f8fa;
  border-color: #d0d7de;
}

.github-readme__title,
.github-readme__subtitle {
  color: #1f2328;
}

.github-readme__meta {
  color: #59636e;
}

.github-readme__code {
  color: #1f2328;
  background: #f6f8fa;
  border-color: #d0d7de;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.github-readme--dark {
  color-scheme: dark;
  color: #f0f6fc;
  background: #0d1117;
  border-color: #30363d;
}

.github-readme--dark .github-readme__bar {
  color: #8b949e;
  background: #010409;
  border-color: #30363d;
}

.github-readme--dark .github-readme__title,
.github-readme--dark .github-readme__subtitle {
  color: #f0f6fc;
}

.github-readme--dark .github-readme__meta {
  color: #8b949e;
}

.github-readme--dark .github-readme__code {
  color: #f0f6fc;
  background: #161b22;
  border-color: #30363d;
}
</style>
