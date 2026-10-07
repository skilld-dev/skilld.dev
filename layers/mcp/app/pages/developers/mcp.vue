<script setup lang="ts">
import { claudeConnectorUrl, REGISTRY_MCP_URL } from '#shared/agent-setup'
import { mcpTools } from '../../../shared/mcp-tools'

definePageMeta({ layout: 'account' })

const title = 'MCP server'
const description = 'What the skilld MCP server does, what it cannot do, and how to connect it to ChatGPT, Claude, and other MCP apps.'
const canonicalUrl = 'https://skilld.dev/developers/mcp'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogUrl: canonicalUrl,
  // A reference page with no measured query. FREEZE_AUDIT_PATHS in the
  // marketing layer lists it, which also keeps it out of the pages sitemap.
  robots: 'noindex,follow',
})
useHead({ link: [{ rel: 'canonical', href: canonicalUrl }] })
defineOgImage('Page.takumi', { title, description }, { alt: title })

/** The guest allowance on every `/api/v1` operation a tool calls (ADR-0008). */
const RATE_LIMIT_PER_MINUTE = 60
const SUPPORT_EMAIL = 'harlan@harlanzw.com'
const DISCORD_INVITE_URL = 'https://discord.com/invite/275MBUBvgP'

const sectionClass = 'mt-12'
const headingClass = 'text-xl font-semibold'
const bodyClass = 'mt-3 text-sm leading-relaxed text-muted'
const linkClass = 'underline underline-offset-2 hover:text-default'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl py-6 sm:py-8">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
        MCP server
      </h1>
      <p class="mt-4 max-w-xl text-base leading-relaxed text-muted">
        The skilld MCP server lets ChatGPT, Claude, and other MCP apps search and browse the registry. It needs no account, and every tool is read only.
      </p>
      <CopyText class="mt-5" :text="REGISTRY_MCP_URL" label="server URL" />
      <ul class="mt-5 space-y-2 text-sm leading-relaxed text-muted">
        <li>It returns Skills with their author and their source on GitHub.</li>
        <li>It returns run and install commands as text. You run them. The server runs and installs nothing.</li>
        <li>It does not check whether a Skill is safe. Read a Skill before you run it.</li>
      </ul>
      <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <UButton
          :to="claudeConnectorUrl()"
          external
          label="Add to Claude"
          icon="i-lucide-external-link"
          class="min-h-11 hover:bg-primary-600 active:bg-primary-700"
        />
        <UButton
          to="/developers?setup=mcp"
          label="Setup for each app"
          color="neutral"
          variant="link"
          class="min-h-11 px-0 text-sm"
        />
      </div>
    </header>

    <section aria-labelledby="tools-heading" :class="sectionClass">
      <h2 id="tools-heading" :class="headingClass">
        Tools
      </h2>
      <p :class="bodyClass">
        The text under each tool is the description your app reads.
      </p>
      <ul class="mt-6 list-none space-y-8 p-0">
        <li v-for="tool in mcpTools" :key="tool.name" class="border-t border-default pt-6">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 class="text-base font-medium">
              {{ tool.title }}
            </h3>
            <code class="font-mono text-xs text-muted">{{ tool.name }}</code>
            <span v-if="tool.annotations.readOnlyHint" class="data-label">Read only</span>
          </div>
          <p :class="bodyClass">
            {{ tool.description }}
          </p>
          <CopyText class="mt-3" :text="tool.examplePrompt" :label="`example prompt for ${tool.title}`" />
        </li>
      </ul>
    </section>

    <section aria-labelledby="connect-heading" :class="sectionClass">
      <h2 id="connect-heading" :class="headingClass">
        Connect
      </h2>
      <p :class="bodyClass">
        In Claude, select Add to Claude above. Claude opens the Add custom connector dialog with skilld filled in. Select Continue, keep No sign-in, and select Add. Then select Connect.
      </p>
      <p :class="bodyClass">
        ChatGPT, Codex, Cursor, VS Code, and other MCP apps each have their own steps. <NuxtLink to="/developers?setup=mcp" :class="linkClass">
          Open the setup steps for each app
        </NuxtLink>.
      </p>
    </section>

    <section aria-labelledby="limits-heading" :class="sectionClass">
      <h2 id="limits-heading" :class="headingClass">
        Limits and data
      </h2>
      <ul class="mt-3 space-y-2 text-sm leading-relaxed text-muted">
        <li>Every tool is read only. No tool writes data, and the server sets no cookie.</li>
        <li>Each search or lookup counts against a limit of {{ RATE_LIMIT_PER_MINUTE }} requests a minute per IP address. ChatGPT and Claude call from their own servers, so their users share that allowance.</li>
        <li>Each tool receives only its inputs, such as your search text or a Skill name. It receives no chat history and no files.</li>
      </ul>
      <p :class="bodyClass">
        The <NuxtLink to="/privacy#the-mcp-server" :class="linkClass">
          privacy page
        </NuxtLink> lists what each tool receives. The <NuxtLink to="/terms" :class="linkClass">
          terms
        </NuxtLink> cover the MCP server.
      </p>
    </section>

    <section aria-labelledby="troubleshooting-heading" :class="sectionClass">
      <h2 id="troubleshooting-heading" :class="headingClass">
        Troubleshooting
      </h2>
      <dl class="mt-3 space-y-5 text-sm leading-relaxed">
        <div>
          <dt class="font-medium text-default">
            Origin not allowed (HTTP 403)
          </dt>
          <dd class="mt-1 text-muted">
            The server accepts browser requests from skilld.dev, Claude, and ChatGPT only. Apps that call from a server or from your computer send no Origin and connect as usual. If a browser app you use gets this error, contact support below.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-default">
            Too many requests
          </dt>
          <dd class="mt-1 text-muted">
            The rate limit is spent. Wait 60 seconds, then try again.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-default">
            Claude says you are not connected to skilld yet
          </dt>
          <dd class="mt-1 text-muted">
            Claude adds a connector and connects it in two steps. Open Customize, then Connectors, select skilld, and select Connect.
          </dd>
        </div>
      </dl>
    </section>

    <section id="support" aria-labelledby="support-heading" :class="sectionClass">
      <h2 id="support-heading" :class="headingClass">
        Support
      </h2>
      <p :class="bodyClass">
        Email <a :href="`mailto:${SUPPORT_EMAIL}`" :class="linkClass">{{ SUPPORT_EMAIL }}</a>, or ask in the <a :href="DISCORD_INVITE_URL" target="_blank" rel="noopener" :class="linkClass">Harlan's Open Source Discord</a>.
      </p>
    </section>
  </div>
</template>
