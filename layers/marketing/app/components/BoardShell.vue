<script setup lang="ts">
import TrendingWeeklyCta from './TrendingWeeklyCta.vue'

/**
 * The page shell every ranked board shares: `/skills/trending` and each track.
 *
 * The same shell as /skills: the heading lines up with the results column, a
 * sticky sidebar sits left of the board, and nothing sits right of it, so the
 * board takes every column the sidebar leaves.
 *
 * The rail's foot holds the page's one acquisition CTA, the weekly
 * invitation, and the install chip under it. The board places the narrow
 * screen's copy of the invitation itself; see `BoardRankedList`.
 */
const { headingId, surface, showWeeklyCta, ctaPending } = defineProps<{
  /** The page's `<h1>` id, which names the header and the board. */
  headingId: string
  /** Analytics prefix for the install chip, such as `trending`. */
  surface: string
  /** False for a reader already receiving the weekly, and for an empty or failed board. */
  showWeeklyCta: boolean
  /** The session has not loaded, so the invitation holds its space unseen. */
  ctaPending: boolean
}>()
</script>

<template>
  <div class="overflow-clip">
    <div class="w-full px-4 pb-10 pt-10 sm:px-6 lg:px-8 xl:px-10">
      <header :aria-labelledby="headingId" class="mx-auto mb-7 max-w-7xl lg:ml-56 lg:mr-0">
        <slot name="header" />
        <!-- Narrow screens have no sidebar, so the install sits under the heading. -->
        <div class="mt-5 lg:hidden">
          <div class="board-teach">
            <p class="font-mono text-xs text-muted">
              Teach your agent skilld
            </p>
            <SkilldInstallChip :surface="`${surface}-header`" />
          </div>
        </div>
      </header>

      <div class="board-layout relative grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <div class="board-sidebar">
          <slot name="sidebar" />

          <!--
            The server renders this page signed out for every visitor, so the
            invitation keeps its space but stays invisible until the browser
            knows who is looking; a weekly reader never sees it first.
            `invisible` already hides it from assistive tech and the tab order,
            so it carries no `aria-hidden`, which HTML validation rejects over
            a link.
          -->
          <div class="board-sidebar__foot">
            <div v-if="showWeeklyCta" :class="{ invisible: ctaPending }">
              <TrendingWeeklyCta variant="rail" />
            </div>
            <!-- The weekly button is the rail's one solid rose element, so the install inks its dot while it shows. -->
            <div class="board-teach">
              <p class="font-mono text-xs text-muted">
                Teach your agent skilld
              </p>
              <SkilldInstallChip :surface="`${surface}-sidebar`" :quiet="showWeeklyCta" />
            </div>
          </div>

          <!--
            Below the invitation, so a long list here never pushes the page's
            one acquisition CTA out of the rail's first screen.
          -->
          <slot name="sidebar-end" />
        </div>

        <section class="min-w-0 lg:pt-6" :aria-labelledby="headingId">
          <slot />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The full-bleed rule above the sidebar and the board, as on /skills. */
.board-layout::before {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 50%;
  inline-size: 100vw;
  transform: translateX(-50%);
  border-block-start: 1px solid var(--ui-border);
  content: '';
  pointer-events: none;
}

.board-sidebar {
  min-inline-size: 0;
  padding-top: 1.5rem;
}

.board-sidebar__foot {
  display: none;
}

.board-teach {
  display: grid;
  gap: 0.5rem;
  min-inline-size: 0;
}

/*
 * Wide screens: the sidebar column from /skills, sticky under the site header.
 * The invitation and the install sit under the sidebar's own navigation,
 * where the board's right edge used to be spent on them.
 */
@media (min-width: 64rem) {
  .board-sidebar {
    position: sticky;
    inset-block-start: 4rem;
    display: flex;
    flex-direction: column;
    block-size: calc(100dvh - 4rem);
    overflow-y: auto;
    padding-block-end: 1.5rem;
    padding-inline-end: 1.5rem;
    border-inline-end: 1px solid var(--ui-border);
  }

  .board-sidebar__foot {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    margin-block-start: 2rem;
  }
}
</style>
