<script setup lang="ts">
import type { DemoIdentity } from '~/utils/home-demos'
import { demoPagePath } from '#shared/demo-pages'
import { demoCardSkill } from '~/utils/home-demos'
import DemoActions from './_DemoActions.vue'
import SkillCard from './SkillCard.vue'

const { demo, surface, presentation = 'full' } = defineProps<{
  demo: DemoIdentity
  surface: string
  presentation?: 'full' | 'hero' | 'compact'
}>()
const emit = defineEmits<{ action: [action: { event: 'share' } | { event: 'copy', format: 'agent' | 'terminal' }] }>()
</script>

<template>
  <div class="demo-footer" :class="{ 'demo-footer--compact': presentation === 'compact' }">
    <SkillCard :skill="demoCardSkill(demo)" layout="row" metric="none" :description="false" :actions="[]" :surface />
    <NuxtLink v-if="presentation === 'hero'" :to="demoPagePath(demo)" class="demo-footer__open" :aria-label="`Open the demo of /${demo.name}`">
      Open the demo
      <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
    </NuxtLink>
    <DemoActions v-else :demo :surface @action="emit('action', $event)" />
  </div>
</template>

<style scoped>
.demo-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  margin-block-start: 0.25rem;
  overflow: hidden;
  border-radius: var(--ui-radius);
}
.demo-footer--compact {
  position: sticky;
  inset-block-end: 0;
  z-index: 2;
  border-block-start: 1px solid var(--ui-border);
  background: var(--ui-bg);
  padding-block-end: env(safe-area-inset-bottom, 0px);
}
.demo-footer__open {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-block-size: 2.75rem;
  margin-inline-start: auto;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text);
  text-decoration: underline;
  text-underline-offset: 4px;
}
.demo-footer__open:hover { color: var(--ui-text-highlighted); }
@media (max-width: 39.99rem) {
  .demo-footer :deep(.skill-card--row) { padding-block: 0.5rem; }
  .demo-footer :deep(.skill-card__row-end) { display: none; }
}
</style>
