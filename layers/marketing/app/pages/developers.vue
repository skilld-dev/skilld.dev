<script setup lang="ts">
import {
  cursorInstallUrl,
  mcpClients,
  mcpClientSchema,
  REGISTRY_MCP_URL,
  setupModes,
  setupModeSchema,
  setupSnippets,
  SKILLD_SKILL_SOURCE,
  vscodeInstallUrl,
} from '../utils/developer-setup'
import { pageRobots } from '../utils/page-admissions'

const route = useRoute()
const mode = computed(() => {
  const parsed = setupModeSchema.safeParse(route.query.setup)
  return parsed.success ? parsed.data : 'cli'
})
const client = computed(() => {
  const parsed = mcpClientSchema.safeParse(route.query.client)
  return parsed.success ? parsed.data : 'chatgpt'
})

const title = 'Developers'
const description = 'Search the skilld registry from your Agent. Install the skilld Skill for the CLI, or add the MCP server to ChatGPT, Claude, Codex, Cursor, or VS Code.'
const canonicalUrl = 'https://skilld.dev/developers'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogUrl: canonicalUrl,
  robots: pageRobots('/developers'),
})
useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })
defineOgImage('Page.takumi', { title, description }, { alt: title })
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-12 sm:px-6 md:py-16">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
        Developers
      </h1>
      <p class="mt-4 max-w-xl text-base leading-relaxed text-muted">
        Search the registry from your Agent. The skilld CLI and the MCP server read the same curated Skills.
      </p>
    </header>

    <section aria-labelledby="setup-mode-heading" class="mt-10">
      <h2 id="setup-mode-heading" class="text-xl font-semibold">
        Choose how to connect
      </h2>
      <nav aria-label="Setup" class="mt-4 grid gap-3 sm:grid-cols-2">
        <NuxtLink
          v-for="(item, key) in setupModes"
          :key="key"
          :to="{ query: { setup: key === 'cli' ? undefined : key } }"
          replace
          :aria-current="mode === key ? 'true' : undefined"
          class="flex min-h-20 flex-col gap-1 rounded-lg border p-4 transition-colors"
          :class="mode === key ? 'border-primary' : 'border-default hover:border-[var(--ui-text-muted)]'"
        >
          <span class="flex items-baseline justify-between gap-3">
            <span class="text-base font-medium">{{ item.label }}</span>
            <span class="data-label">{{ item.hint }}</span>
          </span>
          <span class="text-sm text-muted">{{ item.detail }}</span>
        </NuxtLink>
      </nav>
    </section>

    <section v-if="mode === 'cli'" aria-labelledby="cli-heading" class="mt-12">
      <h2 id="cli-heading" class="text-xl font-semibold">
        Set up the CLI
      </h2>
      <ol class="mt-6 list-none space-y-10 p-0">
        <li class="setup-step">
          <span class="setup-step__index" aria-hidden="true">01</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Install the skilld Skill
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              The skilld Skill teaches your Agent to search, run, and install Skills with the CLI. skilld writes it where your Agent reads Skills. Start a new session after the install.
            </p>
            <SetupSnippet class="mt-3" :code="setupSnippets.skilldSkill" label="install command" lang="sh" />
            <UButton
              :to="SKILLD_SKILL_SOURCE"
              target="_blank"
              label="Read the Skill on GitHub"
              color="neutral"
              variant="link"
              class="mt-2 min-h-11 px-0 text-sm"
            />
          </div>
        </li>
        <li class="setup-step">
          <span class="setup-step__index" aria-hidden="true">02</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Ask your Agent
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              Ask in plain words. Your Agent searches the registry, then runs the Skill for this session. A run writes nothing to your project.
            </p>
            <SetupSnippet class="mt-3" :code="setupSnippets.cliPrompt" label="example prompt" wrap />
          </div>
        </li>
        <li class="setup-step">
          <span class="setup-step__index" aria-hidden="true">03</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Keep the Skills you use
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              If a Skill earns a place in every session, ask your Agent to install it. Run <code class="font-mono text-xs text-default">npx skilld --help</code> for every command.
            </p>
          </div>
        </li>
      </ol>
    </section>

    <section v-else aria-labelledby="mcp-heading" class="mt-12">
      <h2 id="mcp-heading" class="text-xl font-semibold">
        Add the MCP server
      </h2>
      <ol class="mt-6 list-none space-y-10 p-0">
        <li class="setup-step">
          <span class="setup-step__index" aria-hidden="true">01</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Copy the server URL
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              No account and no API key. Every tool is read only.
            </p>
            <SetupSnippet class="mt-3" :code="REGISTRY_MCP_URL" label="server URL" />
          </div>
        </li>
        <li class="setup-step">
          <span class="setup-step__index" aria-hidden="true">02</span>
          <div class="min-w-0">
            <h3 id="mcp-client-heading" class="text-base font-medium">
              Add it to your client
            </h3>
            <!-- The border rides on the wrapper: the nav scrolls sideways, which would clip a tab's -mb-px underline. -->
            <div class="mt-3 border-b border-default">
              <nav
                aria-labelledby="mcp-client-heading"
                class="flex gap-4 overflow-x-auto"
              >
                <NuxtLink
                  v-for="(item, key) in mcpClients"
                  :key="key"
                  :to="{ query: { setup: 'mcp', client: key } }"
                  replace
                  :aria-current="client === key ? 'true' : undefined"
                  class="flex min-h-11 shrink-0 items-center border-b-2 font-mono text-xs whitespace-nowrap transition-colors"
                  :class="client === key ? 'border-primary text-default' : 'border-transparent text-muted hover:text-default'"
                >
                  {{ item.label }}
                </NuxtLink>
              </nav>
            </div>

            <div class="mt-5 text-sm leading-relaxed text-muted">
              <template v-if="client === 'chatgpt'">
                <ol class="setup-substeps">
                  <li>Open <strong class="setup-ui">Settings &gt; Security and login</strong>, then turn on <strong class="setup-ui">Developer mode</strong>.</li>
                  <li>Open <strong class="setup-ui">ChatGPT Plugins</strong> and select <strong class="setup-ui">+</strong>. Name the app skilld, paste the server URL, and choose <strong class="setup-ui">No Authentication</strong>.</li>
                  <li>In a chat, open the <strong class="setup-ui">+</strong> menu, choose <strong class="setup-ui">Developer mode</strong>, and select skilld.</li>
                </ol>
                <p class="mt-4">
                  Developer mode needs a Plus, Pro, Business, Enterprise, or Education plan, on the web.
                  <a href="https://developers.openai.com/api/docs/guides/developer-mode" target="_blank" rel="noopener" class="underline underline-offset-2 hover:text-default">Read OpenAI's guide</a>.
                </p>
              </template>

              <template v-else-if="client === 'claude'">
                <ol class="setup-substeps">
                  <li>Open <a href="https://claude.ai/customize/connectors" target="_blank" rel="noopener" class="setup-ui underline underline-offset-2">Customize &gt; Connectors</a> in claude.ai or the Claude desktop app.</li>
                  <li>Select <strong class="setup-ui">Add custom connector</strong>. Name it skilld and paste the server URL. If Claude asks about authentication, choose <strong class="setup-ui">No sign-in</strong>.</li>
                  <li>In a chat, open the <strong class="setup-ui">+</strong> menu, select <strong class="setup-ui">Connectors</strong>, and check that skilld is on.</li>
                </ol>
                <p class="mt-4">
                  Every plan can add a custom connector. The Free plan allows one. On a Team or Enterprise plan, an Owner adds it for the organization first.
                  <a href="https://claude.com/docs/connectors/custom/add-unlisted" target="_blank" rel="noopener" class="underline underline-offset-2 hover:text-default">Read Anthropic's guide</a>.
                </p>
              </template>

              <template v-else-if="client === 'claude-code'">
                <p>The skilld plugin adds the MCP server and the skilld Skill together. Run these in Claude Code:</p>
                <SetupSnippet class="mt-3" :code="setupSnippets.claudeCodePlugin" label="plugin commands" />
                <p class="mt-5">
                  To add only the MCP server, run this in your terminal. Add <code class="font-mono text-xs text-default">--scope project</code> to share it with your team through <code class="font-mono text-xs text-default">.mcp.json</code>.
                </p>
                <SetupSnippet class="mt-3" :code="setupSnippets.claudeCodeMcp" label="Claude Code command" lang="sh" />
              </template>

              <template v-else-if="client === 'codex'">
                <p>Run this in your terminal:</p>
                <SetupSnippet class="mt-3" :code="setupSnippets.codexMcp" label="Codex command" lang="sh" />
                <p class="mt-5">
                  Or add it to <code class="font-mono text-xs text-default">~/.codex/config.toml</code>:
                </p>
                <SetupSnippet class="mt-3" :code="setupSnippets.codexToml" label="Codex config" lang="toml" />
                <p class="mt-4">
                  Run <code class="font-mono text-xs text-default">/mcp</code> in Codex to check the connection.
                </p>
              </template>

              <template v-else-if="client === 'cursor'">
                <UButton
                  :to="cursorInstallUrl()"
                  external
                  label="Add to Cursor"
                  icon="i-lucide-external-link"
                  class="min-h-11 hover:bg-primary-600 active:bg-primary-700"
                />
                <p class="mt-5">
                  Or add it to <code class="font-mono text-xs text-default">~/.cursor/mcp.json</code>, or to <code class="font-mono text-xs text-default">.cursor/mcp.json</code> in your project:
                </p>
                <SetupSnippet class="mt-3" :code="setupSnippets.cursorJson" label="Cursor config" lang="json" />
              </template>

              <template v-else-if="client === 'vscode'">
                <UButton
                  :to="vscodeInstallUrl()"
                  external
                  label="Add to VS Code"
                  icon="i-lucide-external-link"
                  class="min-h-11 hover:bg-primary-600 active:bg-primary-700"
                />
                <p class="mt-5">
                  Or run this in your terminal:
                </p>
                <SetupSnippet class="mt-3" :code="setupSnippets.vscodeCli" label="VS Code command" lang="sh" />
              </template>

              <template v-else>
                <p>Most MCP clients take an entry like this one. If your client asks for a transport, choose streamable HTTP.</p>
                <SetupSnippet class="mt-3" :code="setupSnippets.genericJson" label="MCP config" lang="json" />
              </template>
            </div>
          </div>
        </li>
        <li class="setup-step">
          <span class="setup-step__index" aria-hidden="true">03</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Ask your Agent
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              The server returns the run command and the install command for each Skill. It never runs or installs a Skill. You choose what runs.
            </p>
            <SetupSnippet class="mt-3" :code="setupSnippets.mcpPrompt" label="example prompt" wrap />
          </div>
        </li>
      </ol>
    </section>

    <section aria-labelledby="discovery-heading" class="mt-16 border-t border-default pt-8">
      <h2 id="discovery-heading" class="text-xl font-semibold">
        Where Agents look on their own
      </h2>
      <ul class="mt-4 list-none space-y-4 p-0 text-sm leading-relaxed text-muted">
        <li>
          <a href="/.well-known/agent-skills/index.json" class="font-mono text-xs text-default underline underline-offset-2">/.well-known/agent-skills/index.json</a>
          lists the skilld-registry Skill. It teaches an Agent to search with the MCP server.
        </li>
        <li>
          <a href="/llms.txt" class="font-mono text-xs text-default underline underline-offset-2">/llms.txt</a>
          links every page on skilld.dev as Markdown.
        </li>
        <li>
          Every Skill page returns its SKILL.md when an Agent asks for <code class="font-mono text-xs text-default">text/markdown</code>.
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.setup-step {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  column-gap: 0.75rem;
}

.setup-step__index {
  padding-top: 0.125rem;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

.setup-substeps {
  list-style: decimal;
  padding-left: 1.25rem;
}

.setup-substeps > li + li {
  margin-top: 0.5rem;
}

.setup-ui {
  font-weight: 500;
  color: var(--ui-text);
}
</style>
