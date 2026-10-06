<script setup lang="ts">
import { NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuRoot, NavigationMenuTrigger } from 'reka-ui'
import { developerConnectItems, makeSkillMenuItem } from '~/utils/developer-menu'

/**
 * The desktop header navigation. Developers is a button, so a keyboard opens
 * the panel without leaving the page; the panel's last link reaches
 * `/developers`. The mobile menu in app.vue lists the same destinations.
 */
const route = useRoute()
const openItem = ref('')

// A link inside the panel closes it itself. This covers navigation that
// starts elsewhere, such as the browser's back button.
watch(() => route.fullPath, () => {
  openItem.value = ''
})
</script>

<template>
  <NavigationMenuRoot
    v-model="openItem"
    aria-label="Main"
    class="hidden lg:block"
  >
    <NavigationMenuList class="flex items-center gap-1.5">
      <NavigationMenuItem>
        <!--
          The braille mark lifts Trending without an emoji. Stone only: the logo
          dot is the header's one rose element. `gap-1.5` spaces sibling spans.
        -->
        <NavigationMenuLink as-child>
          <UButton
            to="/skills/trending"
            color="neutral"
            variant="ghost"
            size="sm"
            class="gap-1.5 whitespace-nowrap"
          >
            <TrendingMark :accent="false" />
            <span>Trending Skills</span>
          </UButton>
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink as-child>
          <UButton
            to="/skills"
            label="Find Skills"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem value="developers">
        <!--
          reka-ui sets the trigger id after mount, so SSR rendered an empty one.
          The fixed id labels the panel and keeps `developers`, the item value reka-ui matches.
        -->
        <NavigationMenuTrigger
          id="header-developers-trigger"
          as-child
        >
          <UButton
            label="Developers"
            trailing-icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            size="sm"
            class="group data-[state=open]:bg-elevated"
            :ui="{ trailingIcon: 'size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180' }"
          />
        </NavigationMenuTrigger>
        <!--
          The top lands 0.5rem under the header. The 1.5rem bridge spans the gap
          below the trigger, so the pointer reaches the panel without closing it.
        -->
        <NavigationMenuContent
          aria-labelledby="header-developers-trigger"
          class="developers-panel absolute right-0 top-[calc(50%+var(--ui-header-height)/2+0.5rem)] w-[42rem] rounded-lg bg-default p-2 shadow-lg ring ring-default before:absolute before:inset-x-0 before:bottom-full before:h-6 before:content-['']"
        >
          <!--
            A bento: the three ways to connect stack as compact rows in the
            first column, and the Make a skill card fills the second.
          -->
          <ul class="grid grid-cols-2 grid-rows-3 gap-1">
            <li
              v-for="(item, index) in developerConnectItems"
              :key="item.to"
              class="developers-card"
              :style="{ '--stagger': index }"
            >
              <NavigationMenuLink as-child>
                <NuxtLink
                  :to="item.to"
                  class="group flex h-full items-center gap-3 rounded-md p-3 transition-colors duration-200 hover:bg-elevated"
                >
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-md border border-default bg-default text-highlighted">
                    <UIcon :name="item.icon" class="size-4" />
                  </span>
                  <span class="flex min-w-0 flex-col">
                    <span class="font-mono text-sm font-medium text-highlighted">{{ item.label }}</span>
                    <span class="mt-0.5 text-[0.8125rem] leading-snug text-muted">{{ item.description }}</span>
                  </span>
                </NuxtLink>
              </NavigationMenuLink>
            </li>
            <li
              class="developers-card col-start-2 row-span-3 row-start-1"
              :style="{ '--stagger': 0 }"
            >
              <NavigationMenuLink as-child>
                <NuxtLink
                  :to="makeSkillMenuItem.to"
                  class="group editorial-band flex h-full flex-col overflow-hidden rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
                >
                  <span
                    class="editorial-atmosphere"
                    data-palette="ember"
                    data-geometry="bloom"
                    data-intensity="ambient"
                    aria-hidden="true"
                  />
                  <!-- The File minimap draws SKILL.md files, as on /make-skill. It sits in the corner, away from the text. -->
                  <span class="developers-minimap absolute -right-2 -top-2 h-24 w-40" aria-hidden="true">
                    <TextureFileMinimap />
                  </span>
                  <span class="editorial-band__content flex h-full flex-col">
                    <span class="flex size-8 items-center justify-center rounded-md border border-default bg-default text-highlighted">
                      <UIcon :name="makeSkillMenuItem.icon" class="size-4" />
                    </span>
                    <span class="mt-3 font-mono text-sm font-medium text-highlighted">{{ makeSkillMenuItem.label }}</span>
                    <span class="mt-1 text-sm leading-snug text-muted">{{ makeSkillMenuItem.description }}</span>
                    <span class="mt-4 flex flex-col gap-2 border-t border-default pt-3">
                      <span
                        v-for="entry in makeSkillMenuItem.routes"
                        :key="entry.label"
                        class="flex items-center gap-2 text-[0.8125rem] text-default"
                      >
                        <UIcon :name="entry.icon" class="size-3.5 shrink-0 text-muted" />
                        {{ entry.label }}
                      </span>
                    </span>
                    <span class="mt-auto inline-flex items-center gap-1.5 pt-4 font-mono text-xs text-default">
                      {{ makeSkillMenuItem.action }}
                      <UIcon name="i-lucide-arrow-right" class="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </NuxtLink>
              </NavigationMenuLink>
            </li>
          </ul>
          <NavigationMenuLink as-child>
            <NuxtLink
              to="/developers"
              class="group mt-2 flex min-h-11 items-center justify-between rounded-md px-3 font-mono text-xs text-muted transition-colors duration-200 hover:bg-elevated hover:text-default"
            >
              All setup guides
              <UIcon name="i-lucide-arrow-right" class="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </NuxtLink>
          </NavigationMenuLink>
        </NavigationMenuContent>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenuRoot>
</template>

<style scoped>
/* DESIGN.md motion: 200ms, a 4px move, 60ms between rows. The panel renders
   through a Teleport and carries no scope attribute, so its rules are global.
   Under reduced motion the cards drop their delay too. */
:global(.developers-panel[data-state='open']) {
  animation: developers-panel-in 200ms ease-out;
}

:global(.developers-panel[data-state='closed']) {
  animation: developers-panel-out 150ms ease-in;
}

.developers-panel[data-state='open'] .developers-card {
  animation: developers-card-in 200ms ease-out backwards;
  animation-delay: calc(var(--stagger, 0) * 60ms);
}

@media (prefers-reduced-motion: reduce) {
  .developers-panel[data-state='open'] .developers-card {
    animation: none;
  }
}

/* Ambient strength vanishes on a card this small in dark mode, so it doubles.
   Keep `.dark` outside `:global()`: Vue would emit a bare `.dark` rule. */
.dark .developers-card .editorial-atmosphere {
  --editorial-atmosphere-opacity: 0.56;
}

/* Fade the minimap out toward the text, so it has no hard edge. */
.developers-minimap {
  mask-image: radial-gradient(closest-side, #000 35%, transparent);
  -webkit-mask-image: radial-gradient(closest-side, #000 35%, transparent);
}

@keyframes developers-panel-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@keyframes developers-panel-out {
  to {
    opacity: 0;
  }
}

@keyframes developers-card-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
</style>
