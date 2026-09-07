<script setup lang="ts">
/**
 * The weekly, shown rather than described.
 *
 * The demo is the real email card, server-rendered through the same
 * `renderWeekly` the Monday send uses, so this band cannot claim something the
 * email does not do. It carries the current week's trending rows and no liked
 * section, because an anonymous visitor has no likes and inventing one would
 * put fabricated commits against real people's repositories.
 *
 * Colocated with `_` until 2026-08-22, when it moved here: a component file
 * inside pages/ became an indexable route, so the `_`-prefixed originals
 * now 301 here from the URLs Google already crawled.
 */

import type { WeeklyDemoResponse } from '~~/server/api/weekly/demo.get'

const { isAuthenticated, user } = useAuth()

/**
 * Someone already receiving it is never shown a button asking them to do what
 * they already do. Read from the session user rather than a fresh request: the
 * band is below the fold and not worth a round trip.
 */
const receiving = computed(() => isAuthenticated.value && user.value?.onboarded === true)

// A failed demo costs the band its picture, never its copy or its CTA: `data`
// stays null on error and `hasDemo` gates the whole panel.
const { data: demo } = await useFetch<WeeklyDemoResponse>('/api/weekly/demo', {
  key: 'home-weekly-demo-v1',
})

const hasDemo = computed(() => !!demo.value?.card && (demo.value?.rowCount ?? 0) > 0)

/**
 * The preview follows the page's colour mode.
 *
 * Picked here rather than with a `:global(.dark)` rule in scoped CSS, which
 * this build's PostCSS pipeline drops: the class landed on `<html>` and the
 * selector never matched. Both cards ship in the payload, so switching themes
 * costs no request, and the band sits below the fold where the hydration swap
 * is not visible.
 */
const colorMode = useColorMode()
const card = computed(() =>
  colorMode.value === 'dark' ? demo.value?.card.dark : demo.value?.card.light,
)
</script>

<template>
  <section
    id="weekly"
    class="editorial-band home-weekly-band border-b border-default"
    aria-labelledby="weekly-heading"
  >
    <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
      <div class="home-weekly-grid">
        <div class="min-w-0">
          <h2 id="weekly-heading" class="home-weekly-title max-w-[15ch] font-semibold tracking-tight text-balance">
            Know what changed.
          </h2>
          <p class="mt-4 max-w-md text-base leading-relaxed text-muted text-pretty">
            Changes to the skills you like, plus what devs are talking about, to your inbox every Monday.
          </p>

          <div class="mt-6 flex flex-wrap items-center gap-3">
            <UButton
              to="/weekly/preview"
              external
              label="See this week's"
              trailing-icon="i-lucide-arrow-right"
              class="min-h-11"
            />
            <UButton
              v-if="!receiving"
              to="/login"
              label="Sign in with GitHub"
              icon="i-lucide-github"
              color="neutral"
              variant="outline"
              class="min-h-11"
            />
          </div>

          <p class="mt-4 font-mono text-xs text-muted">
            <template v-if="receiving">
              You get this every Monday. <ULink to="/me" class="underline underline-offset-2">
                Settings
              </ULink>
            </template>
            <template v-else>
              On by default once you sign in. Off in one click.
            </template>
          </p>
        </div>

        <!--
          The card is the real email, so it carries roughly twenty live links.
          Hidden from assistive tech and taken out of the tab order: tabbing
          through an inbox screenshot in the middle of the homepage is a trap,
          and the copy beside it already states what the picture shows.
        -->
        <div v-if="hasDemo" class="home-weekly-demo">
          <p class="data-label">
            In your inbox
          </p>
          <!--
            `inert`, not `tabindex="-1"`. A negative tabindex takes the
            container out of the tab order and leaves every link inside the
            email markup in it, so the trap this frame was built to avoid was
            still there. `aria-hidden` over focusable children is its own
            violation, and `inert` is what makes the pair honest.
          -->
          <div class="home-weekly-frame" aria-hidden="true" inert>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="home-weekly-card" v-html="card" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-weekly-grid {
  display: grid;
  gap: 2rem;
  align-items: start;
}

@media (min-width: 768px) {
  .home-weekly-grid {
    grid-template-columns: 1fr 1fr;
    gap: 2.5rem;
  }
}

.home-weekly-title {
  font-size: clamp(1.75rem, 4vw, 2.25rem);
  line-height: 1.15;
}

.home-weekly-demo {
  min-width: 0;
}

.home-weekly-frame {
  margin-top: 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  padding: 0.75rem;
  background: var(--ui-bg-elevated);
  /* Cropped rather than scaled: a transform blurs the type, and the email is
     the one thing on this band that has to look exactly like itself. */
  max-block-size: 26rem;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, #000 72%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 72%, transparent 100%);
}

.home-weekly-card :deep(table) {
  width: 100% !important;
  max-width: 100% !important;
}
</style>
