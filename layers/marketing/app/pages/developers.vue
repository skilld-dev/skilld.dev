<script setup lang="ts">
import ApiTokenSetup from '../components/_ApiTokenSetup.vue'
import SetupSnippet from '../components/_SetupSnippet.vue'
import {
  API_OPENAPI_PATH,
  apiSamples,
  apiSampleSchema,
  apiSnippets,
  cursorInstallUrl,
  mcpApps,
  mcpAppSchema,
  REGISTRY_MCP_URL,
  setupModes,
  setupModeSchema,
  setupSnippets,
  SKILLD_SKILL_SOURCE,
  vscodeInstallUrl,
} from '../utils/developer-setup'
import { pageRobots } from '../utils/page-admissions'

definePageMeta({ layout: 'account' })

const route = useRoute()
const mode = computed(() => {
  const parsed = setupModeSchema.safeParse(route.query.setup)
  return parsed.success ? parsed.data : 'cli'
})
const app = computed(() => {
  const parsed = mcpAppSchema.safeParse(route.query.app)
  return parsed.success ? parsed.data : 'chatgpt'
})
const sample = computed(() => {
  const parsed = apiSampleSchema.safeParse(route.query.sample)
  return parsed.success ? parsed.data : 'typescript'
})

const title = 'Developers'
const description = 'Search the skilld registry from your Agent or your own code. Install the skilld Skill for the CLI, add the MCP server to ChatGPT, Claude, Codex, Cursor, or VS Code, or call the skilld API.'
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

const stepClass = 'grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3'
const indexClass = 'pt-0.5 font-mono text-sm text-muted'
const uiClass = 'font-medium text-default'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl py-6 sm:py-8">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
        Developers
      </h1>
      <p class="mt-4 max-w-xl text-base leading-relaxed text-muted">
        Search the registry from your Agent or your own code. The skilld CLI, the MCP server, and the skilld API read the same curated Skills.
      </p>
    </header>

    <section aria-labelledby="setup-mode-heading" class="mt-10">
      <h2 id="setup-mode-heading" class="text-xl font-semibold">
        Choose how to connect
      </h2>
      <nav aria-label="Setup" class="mt-4 grid gap-3 sm:grid-cols-3">
        <NuxtLink
          v-for="(item, key) in setupModes"
          :key="key"
          :to="{ query: { setup: key === 'cli' ? undefined : key } }"
          replace
          :aria-current="mode === key ? 'true' : undefined"
          class="flex min-h-20 flex-col gap-1 rounded-lg border p-4 transition-colors"
          :class="mode === key ? 'border-primary bg-elevated' : 'border-default hover:border-[var(--ui-text-muted)]'"
        >
          <!-- Three cards share a row from sm up, so the hint drops under the label there. -->
          <span class="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
            <span class="flex items-center gap-2 text-base font-medium">
              <UIcon
                :name="mode === key ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                class="size-4 shrink-0"
                :class="mode === key ? 'text-primary' : 'text-muted'"
                aria-hidden="true"
              />
              {{ item.label }}
            </span>
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
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">01</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Install the skilld Skill
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              The skilld Skill teaches your Agent to search, run, and install Skills with the CLI. skilld writes it where your Agent reads Skills. Start a new session after the install.
            </p>
            <SetupSnippet class="mt-3" :code="setupSnippets.skilldSkill" label="install command" format="skilld" />
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
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">02</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Ask your agent
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              Ask in plain words. Your Agent searches the registry, then runs the Skill for this session. A run writes nothing to your project.
            </p>
            <SetupSnippet class="mt-3" :code="setupSnippets.cliPrompt" label="example prompt" />
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">03</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Keep the Skills you use
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              If a Skill earns a place in every session, ask your Agent to install it.
            </p>
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">04</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Act for your account
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              Sign in once, and your Agent can like and watch Skills for you. The digest then reports what changed in the Repositories you watch. A script or a CI job has no browser, so set <code class="font-mono text-xs text-default">SKILLD_TOKEN</code> to a token instead.
            </p>
            <SetupSnippet class="mt-3" :code="setupSnippets.cliAccount" label="account commands" format="skilld" />
            <UButton
              to="/docs/cli"
              label="Every command"
              color="neutral"
              variant="link"
              class="mt-2 min-h-11 px-0 text-sm"
            />
          </div>
        </li>
      </ol>
    </section>

    <section v-else-if="mode === 'mcp'" aria-labelledby="mcp-heading" class="mt-12">
      <h2 id="mcp-heading" class="text-xl font-semibold">
        Add the MCP server
      </h2>
      <ol class="mt-6 list-none space-y-10 p-0">
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">01</span>
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
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">02</span>
          <div class="min-w-0">
            <h3 id="mcp-app-heading" class="text-base font-medium">
              Add it where you work
            </h3>
            <!-- Tabs wrap to a second line instead of scrolling, so none hides off screen on a phone. -->
            <nav
              aria-labelledby="mcp-app-heading"
              class="mt-3 flex flex-wrap gap-x-4 border-b border-default"
            >
              <NuxtLink
                v-for="(item, key) in mcpApps"
                :key="key"
                :to="{ query: { setup: 'mcp', app: key } }"
                replace
                :aria-current="app === key ? 'true' : undefined"
                class="-mb-px flex min-h-11 items-center border-b-2 font-mono text-xs whitespace-nowrap transition-colors"
                :class="app === key ? 'border-primary text-default' : 'border-transparent text-muted hover:text-default'"
              >
                {{ item.label }}
              </NuxtLink>
            </nav>

            <div class="mt-5 text-sm leading-relaxed text-muted">
              <template v-if="app === 'chatgpt'">
                <ol class="list-decimal space-y-2 pl-5">
                  <li>Open <strong :class="uiClass">Settings &gt; Security and login</strong>, then turn on <strong :class="uiClass">Developer mode</strong>.</li>
                  <li>Open <strong :class="uiClass">ChatGPT Plugins</strong> and select <strong :class="uiClass">+</strong>. Name the app skilld, paste the server URL, and choose <strong :class="uiClass">No Authentication</strong>.</li>
                  <li>In a chat, open the <strong :class="uiClass">+</strong> menu, choose <strong :class="uiClass">Developer mode</strong>, and select skilld.</li>
                </ol>
                <p class="mt-4">
                  Developer mode needs a Plus, Pro, Business, Enterprise, or Education plan, on the web.
                  <a href="https://developers.openai.com/api/docs/guides/developer-mode" target="_blank" rel="noopener" class="underline underline-offset-2 hover:text-default">Read OpenAI's guide</a>.
                </p>
              </template>

              <template v-else-if="app === 'claude'">
                <ol class="list-decimal space-y-2 pl-5">
                  <li>Open <a href="https://claude.ai/customize/connectors" target="_blank" rel="noopener" :class="uiClass" class="underline underline-offset-2">Customize &gt; Connectors</a> in claude.ai or the Claude desktop app.</li>
                  <li>Select <strong :class="uiClass">Add custom connector</strong>. Name it skilld and paste the server URL. If Claude asks about authentication, choose <strong :class="uiClass">No sign-in</strong>.</li>
                  <li>In a chat, open the <strong :class="uiClass">+</strong> menu, select <strong :class="uiClass">Connectors</strong>, and check that skilld is on.</li>
                </ol>
                <p class="mt-4">
                  Every plan can add a custom connector. The Free plan allows one. On a Team or Enterprise plan, an Owner adds it for the organization first.
                  <a href="https://claude.com/docs/connectors/custom/add-unlisted" target="_blank" rel="noopener" class="underline underline-offset-2 hover:text-default">Read Anthropic's guide</a>.
                </p>
              </template>

              <template v-else-if="app === 'claude-code'">
                <p>The skilld plugin adds the MCP server and the skilld Skill together. Run these in Claude Code:</p>
                <SetupSnippet class="mt-3" :code="setupSnippets.claudeCodePlugin" label="plugin commands" />
                <p class="mt-5">
                  To add only the MCP server, run this in your terminal. Add <code class="font-mono text-xs text-default">--scope project</code> to share it with your team through <code class="font-mono text-xs text-default">.mcp.json</code>.
                </p>
                <SetupSnippet class="mt-3" :code="setupSnippets.claudeCodeMcp" label="Claude Code command" />
              </template>

              <template v-else-if="app === 'codex'">
                <p>Run this in your terminal:</p>
                <SetupSnippet class="mt-3" :code="setupSnippets.codexMcp" label="Codex command" />
                <p class="mt-5">
                  Or add it to <code class="font-mono text-xs text-default">~/.codex/config.toml</code>:
                </p>
                <SetupSnippet class="mt-3" :code="setupSnippets.codexToml" label="Codex config" format="toml" />
                <p class="mt-4">
                  Run <code class="font-mono text-xs text-default">/mcp</code> in Codex to check the connection.
                </p>
              </template>

              <template v-else-if="app === 'cursor'">
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
                <SetupSnippet class="mt-3" :code="setupSnippets.cursorJson" label="Cursor config" format="json" />
              </template>

              <template v-else-if="app === 'vscode'">
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
                <SetupSnippet class="mt-3" :code="setupSnippets.vscodeCli" label="VS Code command" />
              </template>

              <template v-else>
                <p>Most apps that speak MCP take an entry like this one. If your app asks for a transport, choose streamable HTTP.</p>
                <SetupSnippet class="mt-3" :code="setupSnippets.genericJson" label="MCP config" format="json" />
              </template>
            </div>
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">03</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Ask your agent
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              The server returns the run command and the install command for each Skill. It never runs or installs a Skill. You choose what runs.
            </p>
            <SetupSnippet class="mt-3" :code="setupSnippets.mcpPrompt" label="example prompt" />
          </div>
        </li>
      </ol>
    </section>

    <section v-else aria-labelledby="api-heading" class="mt-12">
      <h2 id="api-heading" class="text-xl font-semibold">
        Call the skilld API
      </h2>
      <ol class="mt-6 list-none space-y-10 p-0">
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">01</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Create a skilld token
            </h3>
            <ApiTokenSetup />
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">02</span>
          <div class="min-w-0">
            <h3 id="api-sample-heading" class="text-base font-medium">
              Call your first operation
            </h3>
            <!-- Same tab pattern as the MCP apps: a query link, so the server renders the chosen sample. -->
            <nav
              aria-labelledby="api-sample-heading"
              class="mt-3 flex flex-wrap gap-x-4 border-b border-default"
            >
              <NuxtLink
                v-for="(item, key) in apiSamples"
                :key="key"
                :to="{ query: { setup: 'api', sample: key } }"
                replace
                :aria-current="sample === key ? 'true' : undefined"
                class="-mb-px flex min-h-11 items-center border-b-2 font-mono text-xs whitespace-nowrap transition-colors"
                :class="sample === key ? 'border-primary text-default' : 'border-transparent text-muted hover:text-default'"
              >
                {{ item.label }}
              </NuxtLink>
            </nav>

            <div class="mt-5 text-sm leading-relaxed text-muted">
              <template v-if="sample === 'typescript'">
                <p>Install the SDK, then search the registry. Every call returns a result: check <code class="font-mono text-xs text-default">_tag</code> before you read <code class="font-mono text-xs text-default">value</code>. Nothing throws for an expected failure.</p>
                <SetupSnippet class="mt-3" :code="apiSnippets.sdkInstall" label="install command" format="bash" />
                <SetupSnippet class="mt-3" :code="apiSnippets.sdkQuickStart" label="TypeScript example" format="typescript" />
                <p class="mt-3">
                  Save it as script.ts. Load your .env file when you run it:
                </p>
                <SetupSnippet class="mt-3" code="node --env-file=.env script.ts" label="script command" format="bash" />
              </template>

              <template v-else>
                <p>Search needs no token. The answer is plain JSON: the matching Skills in <code class="font-mono text-xs text-default">items</code>, and their count in <code class="font-mono text-xs text-default">total</code>.</p>
                <SetupSnippet class="mt-3" :code="apiSnippets.curlQuickStart" label="cURL command" format="bash" />
              </template>
            </div>
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">03</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Query trending Skills
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              Read the weekly board without a token. Use <code class="font-mono text-default">{{ sample === 'typescript' ? "window: 'month'" : 'window=month' }}</code> for the monthly board.
            </p>
            <SetupSnippet v-if="sample === 'typescript'" class="mt-3" :code="apiSnippets.sdkTrending" label="trending TypeScript example" format="typescript" />
            <SetupSnippet v-else class="mt-3" :code="apiSnippets.curlTrending" label="trending cURL command" format="bash" />
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">04</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Browse every operation
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              The OpenAPI document lists every operation with its input, its answer, its errors, and an example.
            </p>
            <UButton
              :to="API_OPENAPI_PATH"
              external
              target="_blank"
              label="Read the OpenAPI document"
              color="neutral"
              variant="link"
              class="mt-2 min-h-11 px-0 text-sm"
            />
          </div>
        </li>
        <li :class="stepClass">
          <span :class="indexClass" aria-hidden="true">05</span>
          <div class="min-w-0">
            <h3 class="text-base font-medium">
              Code samples
            </h3>
            <template v-if="sample === 'typescript'">
              <p class="mt-2 text-sm leading-relaxed text-muted">
                Reuse <code class="font-mono text-xs text-default">skilld</code> from step 02. The watch is an account operation, so it needs the token from step 01.
              </p>
              <SetupSnippet class="mt-3" :code="apiSnippets.sdkSamples" label="TypeScript samples" format="typescript" />
            </template>
            <template v-else>
              <p class="mt-2 text-sm leading-relaxed text-muted">
                The watch sends the token from step 01. Load your .env file into your shell first.
              </p>
              <SetupSnippet class="mt-3" :code="'set -a\n. ./.env\nset +a'" label="load environment command" format="bash" />
              <SetupSnippet class="mt-3" :code="apiSnippets.curlSamples" label="cURL samples" format="bash" />
            </template>
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
          <a :href="API_OPENAPI_PATH" class="font-mono text-xs text-default underline underline-offset-2">{{ API_OPENAPI_PATH }}</a>
          describes every operation of the skilld API.
        </li>
        <li>
          Every Skill page returns its SKILL.md when an Agent asks for <code class="font-mono text-xs text-default">text/markdown</code>.
        </li>
      </ul>
    </section>
  </div>
</template>
