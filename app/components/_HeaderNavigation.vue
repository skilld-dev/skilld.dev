<script setup lang="ts">
import { NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuRoot, NavigationMenuTrigger } from 'reka-ui'
import { developerMenuItems } from '~/utils/developer-menu'

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
          class="developers-panel absolute right-0 top-[calc(50%+var(--ui-header-height)/2+0.5rem)] w-[44rem] rounded-lg bg-default p-2 shadow-lg ring ring-default before:absolute before:inset-x-0 before:bottom-full before:h-6 before:content-['']"
        >
          <!-- Six columns: three connect cards fill the top row, two author cards the row below. -->
          <ul class="grid grid-cols-6 gap-2">
            <li
              v-for="item in developerMenuItems"
              :key="item.to"
              class="developers-card"
              :class="item.group === 'connect' ? 'col-span-2' : 'col-span-3'"
              :style="{ '--stagger': item.group === 'connect' ? 0 : 1 }"
            >
              <NavigationMenuLink as-child>
                <NuxtLink
                  :to="item.to"
                  class="group editorial-band flex h-full flex-col overflow-hidden rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
                >
                  <span
                    class="editorial-atmosphere"
                    :data-palette="item.palette"
                    data-geometry="bloom"
                    data-intensity="ambient"
                    aria-hidden="true"
                  />
                  <span class="editorial-band__content flex h-full flex-col">
                    <span class="flex size-8 items-center justify-center rounded-md border border-default bg-default text-highlighted">
                      <UIcon :name="item.icon" class="size-4" />
                    </span>
                    <span class="mt-3 font-mono text-sm font-medium text-highlighted">{{ item.label }}</span>
                    <span class="mt-1 text-sm leading-snug text-muted">{{ item.description }}</span>
                    <span class="mt-auto inline-flex items-center gap-1.5 pt-4 font-mono text-xs text-default">
                      {{ item.action }}
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
