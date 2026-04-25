<template>
  <section
    class="mx-auto max-w-5xl px-4 sm:px-6 py-12 md:py-16"
    aria-labelledby="how-heading"
  >
    <h2
      id="how-heading"
      class="section-label mb-6"
    >
      How it works
    </h2>

    <ol class="grid grid-cols-1 gap-3 sm:grid-cols-3 list-none p-0">
      <li class="rounded-lg border border-default p-4">
        <span
          class="data-label"
          aria-hidden="true"
        >01</span>
        <p class="mt-2 text-sm font-medium">
          Install skills
        </p>
        <p class="mt-1 text-xs text-muted leading-relaxed">
          Run <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx -y skilld add npm:vue npm:nuxt</code> to install curated skills for your npm packages.
        </p>
      </li>
      <li class="rounded-lg border border-default p-4">
        <span
          class="data-label"
          aria-hidden="true"
        >02</span>
        <p class="mt-2 text-sm font-medium">
          Follow curators
        </p>
        <p class="mt-1 text-xs text-muted leading-relaxed">
          Install a curator's collection with one command. Their skill set becomes your agent's context.
        </p>
      </li>
      <li class="rounded-lg border border-default p-4">
        <span
          class="data-label"
          aria-hidden="true"
        >03</span>
        <p class="mt-2 text-sm font-medium">
          Stay current
        </p>
        <p class="mt-1 text-xs text-muted leading-relaxed">
          Skills update when packages release. Run <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">skilld update</code> to refresh from the registry.
        </p>
      </li>
    </ol>
  </section>
</template>
