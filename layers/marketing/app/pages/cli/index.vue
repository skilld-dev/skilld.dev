<script setup lang="ts">
/**
 * The CLI landing page. It sells the outcome, Skills in your Agent kept
 * current, and shows the CLI as the way there. `/docs/cli` stays the reference.
 *
 * TARGET QUERY. "skilld cli", then "agent skills cli".
 * ADMISSION BAR. One hand-written page. Like `/developers`, it sits in
 * `FREEZE_AUDIT_PATHS` with no `PAGE_ADMISSIONS` entry, so it renders
 * `noindex,follow` and stays out of the sitemap until a measured query admits it.
 * CULL PATH. If it earns no traffic by the 2026-11-11 gate, merge it into
 * `/docs/cli` and redirect `/cli` there with a 301.
 *
 * It is `pages/cli/index.vue`, never `pages/cli.vue`: a `cli.vue` would become
 * the parent route of `/cli/authorize` and swallow the CLI sign-in page.
 */
import {
  skillInstallCmd,
  skillOutdatedCmd,
  skillPageUrl,
  skillRemoveCmd,
  skillRunCmd,
  skillRunPrompt,
  skillSearchCmd,
  skillUpdateCmd,
} from '#shared/skill-commands'
import SetupSnippet from '../../components/_SetupSnippet.vue'
import { setupSnippets } from '../../utils/developer-setup'
import { pageRobots } from '../../utils/page-admissions'

/**
 * Every `--agent` value, copied from `skilld install --help` in skilld 3.6.0.
 * The CLI defines them in `crates/skilld-core/src/target.rs`. The site's
 * `AGENT_TARGETS` carries a confirm step for only some of them, so the count
 * comes from this list.
 */
const CLI_AGENT_TARGETS = [
  'claude-code',
  'cursor',
  'windsurf',
  'cline',
  'codex',
  'github-copilot',
  'gemini-cli',
  'goose',
  'amp',
  'opencode',
  'roo',
  'antigravity',
  'openclaw',
  'hermes',
  'kiro',
  'kilo',
  'droid',
  'trae',
  'zed',
] as const
const targetCount = CLI_AGENT_TARGETS.length

/** The README's example Skill. Its installed name is the last segment. */
const EXAMPLE = { owner: 'antfu', repo: 'skills', skill: 'vue' } as const

const agentPrompt = skillRunPrompt(skillPageUrl(EXAMPLE.owner, EXAMPLE.repo, EXAMPLE.skill))
const askPrompt = 'Find a skilld Skill for Vue and use it'

/** Each id is a stable anchor, so other pages can link one verb. */
const verbs = [
  {
    id: 'search',
    name: 'search',
    text: 'Finds Skills in the registry and prints the selector that run and install take.',
    code: skillSearchCmd('vue'),
  },
  {
    id: 'run',
    name: 'run',
    text: 'Prints the SKILL.md and writes no file. Your Agent follows it for this session only.',
    code: skillRunCmd(EXAMPLE.owner, EXAMPLE.repo, EXAMPLE.skill),
  },
  {
    id: 'install',
    name: 'install',
    text: 'Writes the Skill to the project, the lockfile, and each Agent it detects.',
    code: skillInstallCmd(EXAMPLE.owner, EXAMPLE.repo, EXAMPLE.skill),
  },
  {
    id: 'update',
    name: 'keep current',
    text: 'The first command reports each installed Skill whose source moved. The second moves one to its current source commit.',
    code: `${skillOutdatedCmd()}\n${skillUpdateCmd(EXAMPLE.skill)}`,
  },
  {
    id: 'remove',
    name: 'remove',
    text: 'Removes an installed Skill. A run leaves nothing to remove.',
    code: skillRemoveCmd(EXAMPLE.skill),
  },
] as const

/** The README's run versus install table. */
const comparison = [
  { label: 'Use it for', run: 'The task in front of you', install: 'Every session in this project' },
  { label: 'Files written', run: 'None', install: '.skills, the lockfile, and Agent targets' },
  { label: 'Cleanup', run: 'None', install: 'skilld remove', installIsCommand: true },
  { label: 'Updates', run: 'Loads the source each time', install: 'skilld update', installIsCommand: true },
  { label: 'Skill scripts', run: 'Never printed or executed', install: 'On disk for the Skill to use' },
] as const

const title = 'The skilld CLI for agent skills'
const description = `The skilld CLI searches, runs, and installs agent skills for Claude Code, Codex, Cursor, and ${targetCount - 3} more Agents. One native binary, pinned commits, no telemetry.`
const canonicalUrl = 'https://skilld.dev/cli'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogUrl: canonicalUrl,
  robots: pageRobots('/cli'),
})
useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })
defineOgImage('Page.takumi', { title: 'The skilld CLI', description }, { alt: 'The skilld CLI' })

// Text left, the command right, from md up. Below md the command drops under the text.
const stepClass = 'grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-3 py-5 md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,24rem)] md:gap-x-6'
const stepTextClass = 'min-w-0'
const stepActionClass = 'col-start-2 min-w-0 md:col-start-3 md:row-start-1'
const indexClass = 'pt-0.5 font-mono text-sm text-muted'
const codeClass = 'font-mono text-xs text-default'
</script>

<template>
  <div class="cli-page">
    <section class="editorial-band cli-hero" aria-labelledby="cli-heading">
      <!-- The band's one texture, in stone only: the "Teach your agent skilld"
           chip's dot is the band's one rose element (DESIGN.md "Brand
           System"). The mask keeps the names clear of the copy. -->
      <div class="cli-hero__texture" aria-hidden="true">
        <TextureBrailleNames />
      </div>

      <div class="editorial-band__content mx-auto max-w-5xl px-4 pt-10 pb-28 sm:px-6 md:pt-14 lg:pb-14">
        <div class="max-w-xl">
          <h1 id="cli-heading" class="cli-hero__title font-semibold">
            The skilld CLI
          </h1>
          <p class="mt-4 text-lg font-medium text-pretty sm:text-xl">
            Search, run, install, and keep Skills current.
          </p>
          <p class="mt-3 text-base leading-relaxed text-muted text-pretty">
            Give your Agent Skills that real maintainers write. A run reads the current source every time, and one command updates the Skills you install. Install the skilld Skill once, and your Agent searches and loads Skills on its own.
          </p>
          <p class="cli-hero__claims data-label mt-4">
            <a href="https://github.com/skilld-dev/skilld" target="_blank" rel="noopener">Open-source CLI</a>
            <span aria-hidden="true"> · </span>
            <span>No telemetry</span>
            <span aria-hidden="true"> · </span>
            <span>{{ targetCount }} Agent targets</span>
          </p>

          <div class="mt-8 grid gap-4">
            <div class="cli-hero__action">
              <span class="cli-hero__label">Teach your agent skilld</span>
              <SkilldInstallChip surface="cli-hero" />
            </div>
            <div class="cli-hero__action">
              <span class="cli-hero__label">Install the CLI</span>
              <CliInstallChip surface="cli-hero" quiet />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section aria-labelledby="ways-heading" class="border-t border-default">
      <div class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <h2 id="ways-heading" class="text-2xl font-semibold tracking-tight text-balance">
          Three ways in, smallest first
        </h2>
        <p class="data-label mt-2">
          The first two install nothing.
        </p>

        <ol class="editorial-ledger mt-8 list-none p-0">
          <li :class="stepClass">
            <span :class="indexClass" aria-hidden="true">01</span>
            <div :class="stepTextClass">
              <h3 class="text-base font-medium">
                Give your Agent a Skill URL
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-muted">
                Your Agent reads the page and follows the Skill for that session. Nothing lands in your project.
              </p>
            </div>
            <SetupSnippet :class="stepActionClass" :code="agentPrompt" label="Agent prompt" />
          </li>
          <li :class="stepClass">
            <span :class="indexClass" aria-hidden="true">02</span>
            <div :class="stepTextClass">
              <h3 class="text-base font-medium">
                Run it from a terminal
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-muted">
                A run prints the SKILL.md for your Agent and writes no file. Switch to install when you want the Skill in every session.
              </p>
            </div>
            <RunChip
              :owner="EXAMPLE.owner"
              :repo="EXAMPLE.repo"
              :skill="EXAMPLE.skill"
              surface="cli-ways"
              :class="stepActionClass"
            />
          </li>
          <li :class="stepClass">
            <span :class="indexClass" aria-hidden="true">03</span>
            <div :class="stepTextClass">
              <h3 class="text-base font-medium">
                Install the CLI and the skilld Skill
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-muted">
                Run the two commands at the top of this page. Then ask your Agent in your own words.
              </p>
            </div>
            <SetupSnippet :class="stepActionClass" :code="askPrompt" label="example prompt" />
          </li>
        </ol>
      </div>
    </section>

    <section aria-labelledby="verbs-heading" class="border-t border-default">
      <div class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <h2 id="verbs-heading" class="text-2xl font-semibold tracking-tight text-balance">
          What each command does
        </h2>
        <p class="data-label mt-2">
          Every example uses {{ EXAMPLE.owner }}/{{ EXAMPLE.repo }}/{{ EXAMPLE.skill }}.
        </p>

        <div class="editorial-ledger mt-8">
          <div
            v-for="verb in verbs"
            :id="verb.id"
            :key="verb.id"
            class="cli-verb grid gap-3 py-5 md:grid-cols-[9rem_minmax(0,1fr)_minmax(0,24rem)] md:gap-6"
          >
            <h3 class="font-mono text-sm font-medium">
              {{ verb.name }}
            </h3>
            <p class="text-sm leading-relaxed text-muted">
              {{ verb.text }}
            </p>
            <SetupSnippet :code="verb.code" :label="`${verb.name} command`" format="skilld" />
          </div>
        </div>

        <h3 class="mt-12 text-lg font-semibold">
          Run or install?
        </h3>
        <div class="mt-4">
          <table class="w-full border-collapse text-left text-sm">
            <thead>
              <tr class="border-b border-default">
                <th scope="col" class="py-2 pr-4 font-normal">
                  <span class="sr-only">Question</span>
                </th>
                <th scope="col" class="py-2 pr-4 font-mono text-xs font-medium">
                  skilld run
                </th>
                <th scope="col" class="py-2 font-mono text-xs font-medium">
                  skilld install
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in comparison" :key="row.label" class="border-b border-default">
                <th scope="row" class="py-2.5 pr-4 font-mono text-xs font-normal text-muted">
                  {{ row.label }}
                </th>
                <td class="py-2.5 pr-4">
                  {{ row.run }}
                </td>
                <td class="py-2.5">
                  <code v-if="'installIsCommand' in row" :class="codeClass">{{ row.install }}</code>
                  <template v-else>
                    {{ row.install }}
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="mt-4 text-sm leading-relaxed text-muted">
          Start with run. Install when you reach for the same Skill again.
        </p>
      </div>
    </section>

    <section aria-labelledby="agent-heading" class="border-t border-default">
      <div class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <h2 id="agent-heading" class="text-2xl font-semibold tracking-tight text-balance">
          Built for an Agent to drive
        </h2>

        <dl class="mt-8 grid gap-x-8 gap-y-8 md:grid-cols-2">
          <div class="min-w-0">
            <dt class="text-base font-medium">
              One install, {{ targetCount }} Agent targets
            </dt>
            <dd class="mt-2 text-sm leading-relaxed text-muted">
              <p>
                <code :class="codeClass">skilld install</code> detects the Agents you use and writes the same Skill to each. Name one with <code :class="codeClass">--agent</code>:
              </p>
              <ul class="mt-3 flex list-none flex-wrap gap-1.5 p-0" aria-label="Agent target values">
                <li
                  v-for="agent in CLI_AGENT_TARGETS"
                  :key="agent"
                  class="rounded-sm border border-default px-1.5 py-0.5 font-mono text-xs text-toned"
                >
                  {{ agent }}
                </li>
              </ul>
              <AgentTargets class="mt-4" />
            </dd>
          </div>
          <div class="grid min-w-0 content-start gap-8">
            <div>
              <dt class="text-base font-medium">
                Every install pins a commit
              </dt>
              <dd class="mt-2 text-sm leading-relaxed text-muted">
                The lockfile records the exact source commit. Before a file lands, the CLI checks the Artifact digest, the Artifact attestation, the check results, and the archive.
              </dd>
            </div>
            <div>
              <dt class="text-base font-medium">
                Five behaviors stop and ask
              </dt>
              <dd class="mt-2 text-sm leading-relaxed text-muted">
                Five Skill behaviors stop a remote run or install until you approve them. They include running code from the network and reading credential files. Your Agent gets the exact approval command. The checks use fixed text patterns, which miss obfuscated code.
              </dd>
            </div>
            <div>
              <dt class="text-base font-medium">
                One native binary
              </dt>
              <dd class="mt-2 text-sm leading-relaxed text-muted">
                No runtime to install, and it starts in under a millisecond. A curl or PowerShell install upgrades itself from signed releases. An npm install runs the same executable, and npm handles its upgrades.
              </dd>
            </div>
            <div>
              <dt class="text-base font-medium">
                No telemetry
              </dt>
              <dd class="mt-2 text-sm leading-relaxed text-muted">
                The CLI sends no analytics. Your account credentials go to the operating system keychain, never to a plain text file.
              </dd>
            </div>
          </div>
        </dl>
      </div>
    </section>

    <section aria-labelledby="plugin-heading" class="border-t border-default">
      <div class="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 md:py-16">
        <div class="min-w-0">
          <h2 id="plugin-heading" class="text-2xl font-semibold tracking-tight text-balance">
            Add it to Claude Code
          </h2>
          <p class="mt-3 text-sm leading-relaxed text-muted">
            The plugin installs the skilld-maintained Skills and adds the skilld.dev MCP server. Run these in Claude Code:
          </p>
          <SetupSnippet class="mt-3" :code="setupSnippets.claudeCodePlugin" label="plugin commands" />
          <p class="mt-4 text-sm leading-relaxed text-muted">
            The MCP server searches the registry and returns run and install commands. It never runs a Skill.
          </p>
          <UButton
            to="/developers"
            label="Set up MCP, the API, or the SDK"
            trailing-icon="i-lucide-arrow-right"
            color="neutral"
            variant="link"
            class="mt-2 min-h-11 px-0 text-sm"
          />
        </div>

        <div class="min-w-0">
          <h2 id="reference-heading" class="text-2xl font-semibold tracking-tight text-balance">
            Every command and flag
          </h2>
          <p class="mt-3 text-sm leading-relaxed text-muted">
            The reference holds the help text for every command, including the registry and account commands this page skips.
          </p>
          <UButton
            to="/docs/cli"
            label="Read the CLI reference"
            trailing-icon="i-lucide-arrow-right"
            class="mt-4 min-h-11 font-mono"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.cli-hero__title {
  font-size: clamp(2.25rem, 1.85rem + 1.8vw, 3.5rem);
  letter-spacing: -0.04em;
  line-height: 1.02;
  text-wrap: balance;
}

/* Below 64rem the names run as a strip under the chips. The band's bottom
   padding keeps that strip clear of text. */
/* Stone only, as on the home hero: the pick draws in muted ink, not rose. */
.cli-hero__texture {
  --brand-dot: var(--ui-text-muted);
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  z-index: 0;
  height: 7rem;
  pointer-events: none;
  mask-image: linear-gradient(to bottom, transparent, #000 45%);
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 45%);
}

@media (min-width: 64rem) {
  .cli-hero__texture {
    top: 0;
    height: auto;
    mask-image: linear-gradient(to right, transparent 55%, #000 78%);
    -webkit-mask-image: linear-gradient(to right, transparent 55%, #000 78%);
  }
}

.cli-hero__claims a {
  color: var(--ui-text);
  text-decoration-line: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.2em;
  transition: text-decoration-color 200ms ease-out;
}

@media (hover: hover) {
  .cli-hero__claims a:hover {
    text-decoration-color: currentColor;
  }
}

.cli-hero__action {
  display: grid;
  gap: 0.375rem;
  max-width: 30rem;
}

.cli-hero__label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

@media (min-width: 40rem) {
  .cli-hero__action {
    grid-template-columns: 11rem minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    max-width: 36rem;
  }
}

.cli-verb {
  scroll-margin-top: calc(var(--ui-header-height) + 1rem);
}
</style>
