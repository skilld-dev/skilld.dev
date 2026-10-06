<script setup lang="ts">
useSeoMeta({
  title: 'Accessibility',
  description: 'How skilld.dev handles accessibility and where it still falls short.',
})

defineOgImage('Page.takumi', {
  title: 'Accessibility',
  description: 'How skilld.dev handles accessibility.',
}, { alt: 'Accessibility statement for skilld.dev' })
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-16">
    <article>
      <header>
        <h1 class="font-mono text-2xl sm:text-3xl font-medium tracking-tight">
          Accessibility
        </h1>
        <p class="mt-3 text-sm text-muted leading-relaxed">
          We want skilld.dev to work for everyone.
        </p>
      </header>

      <section
        class="mt-10"
        aria-labelledby="approach-heading"
      >
        <h2
          id="approach-heading"
          class="section-label mb-4"
        >
          Our approach
        </h2>
        <p class="text-sm text-muted leading-relaxed">
          Accessibility is part of every UI change. We aim for WCAG 2.1 AA
          across all pages and interactions.
        </p>
      </section>

      <section
        class="mt-10"
        aria-labelledby="measures-heading"
      >
        <h2
          id="measures-heading"
          class="section-label mb-4"
        >
          What we do
        </h2>
        <ul class="space-y-2 text-sm text-muted leading-relaxed">
          <li class="flex items-start gap-2">
            <span
              class="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--ui-text-muted)]"
              aria-hidden="true"
            />
            <span><strong class="text-default">Semantic HTML</strong> with proper landmarks, headings, and document structure</span>
          </li>
          <li class="flex items-start gap-2">
            <span
              class="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--ui-text-muted)]"
              aria-hidden="true"
            />
            <span><strong class="text-default">ARIA attributes</strong> for interactive elements, live regions, and dynamic content</span>
          </li>
          <li class="flex items-start gap-2">
            <span
              class="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--ui-text-muted)]"
              aria-hidden="true"
            />
            <span><strong class="text-default">Keyboard navigation</strong> with skip links, focus indicators, and global shortcuts</span>
          </li>
          <li class="flex items-start gap-2">
            <span
              class="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--ui-text-muted)]"
              aria-hidden="true"
            />
            <span><strong class="text-default">Color contrast</strong> meeting WCAG AA ratios with enhanced high contrast mode support</span>
          </li>
          <li class="flex items-start gap-2">
            <span
              class="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--ui-text-muted)]"
              aria-hidden="true"
            />
            <span><strong class="text-default">Reduced motion</strong> respecting user preferences for animations and transitions</span>
          </li>
          <li class="flex items-start gap-2">
            <span
              class="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--ui-text-muted)]"
              aria-hidden="true"
            />
            <span><strong class="text-default">Automated testing</strong> with axe-core audits to catch regressions</span>
          </li>
        </ul>
      </section>

      <section
        class="mt-10"
        aria-labelledby="limitations-heading"
      >
        <h2
          id="limitations-heading"
          class="section-label mb-4"
        >
          Known limitations
        </h2>
        <p class="text-sm text-muted leading-relaxed">
          We are still building skilld.dev, and some pages may miss our accessibility target.
          If you find one, please tell us.
        </p>
      </section>

      <section
        class="mt-10"
        aria-labelledby="feedback-heading"
      >
        <h2
          id="feedback-heading"
          class="section-label mb-4"
        >
          Feedback
        </h2>
        <p class="text-sm text-muted leading-relaxed">
          Found an accessibility barrier? Please
          <a
            href="https://github.com/skilld-dev/skilld/issues"
            target="_blank"
            rel="noopener noreferrer"
            class="text-default underline underline-offset-2 hover:text-[var(--color-primary-500)]"
          >open an issue on GitHub</a>.
          Include the page and what got in your way.
        </p>
      </section>
    </article>
  </main>
</template>
