<script setup lang="ts">
import { pageRobots } from '../utils/page-admissions'

/** Setup for the skilld-skillgen GitHub App. The requirements mirror the checks in `workers/skill-harness/src`. */
const INSTALL_URL = 'https://github.com/apps/skilld-skillgen/installations/new'

const title = 'Skillgen'
const description = 'Keep your package skill current. After each release tag, Skillgen opens a pull request that updates the Skill in your repository.'
const canonicalUrl = 'https://skilld.dev/skillgen'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogUrl: canonicalUrl,
  robots: pageRobots('/skillgen'),
})
useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })
defineOgImage('Page.takumi', { title, description }, { alt: title })

const stepClass = 'grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3'
const indexClass = 'pt-0.5 font-mono text-sm text-muted'
const codeClass = 'font-mono text-xs text-default'
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-12 sm:px-6 md:py-16">
    <header>
      <!-- `/make-skill` is the one entry for authors, and it routes here. -->
      <UButton
        to="/make-skill"
        label="Make a skill"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="link"
        class="mb-4 min-h-11 px-0 font-mono text-sm text-muted"
      />
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
        Skillgen
      </h1>
      <p class="mt-4 text-base leading-relaxed text-muted">
        Keep your package skill current. After each release tag, Skillgen opens a pull request that updates the Skill in your repository. You review it and decide what merges.
      </p>
    </header>

    <section aria-labelledby="setup-heading" class="mt-12">
      <h2 id="setup-heading" class="text-xl font-semibold">
        Set up Skillgen
      </h2>
      <ol class="mt-6 list-none space-y-10 p-0">
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">01</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Check your repository
            </h3>
            <ul class="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
              <li>
                A public GitHub repository with a published npm package. Its <code :class="codeClass">package.json</code> sits at the root, or in a monorepo under <code :class="codeClass">packages/&lt;name&gt;/</code>. Skillgen supports npm packages only.
              </li>
              <li>
                A Skill in <code :class="codeClass">skills/&lt;name&gt;/SKILL.md</code> beside that <code :class="codeClass">package.json</code>. A root package may keep one <code :class="codeClass">SKILL.md</code> at the root instead.
              </li>
              <li>
                Up to 9 files and 64 KiB in total: <code :class="codeClass">SKILL.md</code> and Markdown files under <code :class="codeClass">references/</code>.
              </li>
              <li>
                Release tags that match the package version, such as <code :class="codeClass">1.4.0</code>, <code :class="codeClass">v1.4.0</code> or <code :class="codeClass">name@1.4.0</code>. If one tag releases several packages with Skills, each gets its own pull request. A tag older than the version on your default branch, such as a maintenance release, starts no run.
              </li>
              <li>
                npm links each version to its tag commit, through provenance or <code :class="codeClass">gitHead</code>.
              </li>
            </ul>
            <UButton
              to="/make-skill"
              label="No Skill yet? Make a skill"
              color="neutral"
              variant="link"
              class="mt-2 min-h-11 px-0 text-sm"
            />
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">02</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Turn it on for each repository
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              Sign in to skilld with GitHub. Your account lists the public repositories you maintain that have a Skill. Turn Skillgen on for each one it should update. Skillgen never runs on a repository you did not turn on.
            </p>
            <UButton
              to="/me?view=skillgen"
              label="Choose repositories"
              color="neutral"
              variant="outline"
              class="mt-4 min-h-11"
            />
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">03</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Install the App
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              On GitHub, choose <strong class="font-medium text-default">Only select repositories</strong>, then pick the repositories you turned on.
            </p>
            <UButton
              :to="INSTALL_URL"
              target="_blank"
              label="Install Skillgen"
              icon="i-lucide-github"
              class="mt-4 min-h-11 hover:bg-primary-600 active:bg-primary-700"
            />
            <ul class="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
              <li><strong class="font-medium text-default">Contents: write.</strong> Skillgen pushes one branch for each release.</li>
              <li><strong class="font-medium text-default">Pull requests: write.</strong> Skillgen opens the pull request.</li>
              <li>It asks for no Actions, administration, or issues access.</li>
            </ul>
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">04</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Review the pull request
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              Skillgen starts with your latest tag when you install the App. If you turned the repository on after the install, it starts at your next tag. Each new tag starts another run. If npm has not published the version yet, the run waits. Each run must finish within 30 minutes.
            </p>
            <p class="mt-3 text-sm leading-relaxed text-muted">
              A model drafts the update from the tagged source with the skilld Harness. A separate review must accept it before anything reaches your repository. If the Skill needs no change, Skillgen opens nothing.
            </p>
            <p class="mt-3 text-sm leading-relaxed text-muted">
              Look for a pull request titled <code :class="codeClass">docs(skills): update for v1.4.0</code>. It changes only your Skill's folder. Skillgen never overwrites a branch that already exists. You decide what merges.
            </p>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>
