<script setup lang="ts">
const { title, description, headingId } = defineProps<{
  title: string
  description: string
  headingId: string
}>()
</script>

<template>
  <header class="compact-page-header">
    <div class="compact-page-header__content">
      <div
        class="compact-page-header__grid"
        :class="{ 'compact-page-header__grid--with-aside': $slots.aside }"
      >
        <div class="min-w-0">
          <h1
            :id="headingId"
            class="compact-page-header__title"
          >
            {{ title }}
          </h1>
          <p class="compact-page-header__description">
            {{ description }}
          </p>
        </div>

        <aside v-if="$slots.aside" class="compact-page-header__aside">
          <slot name="aside" />
        </aside>
      </div>

      <div v-if="$slots.default" class="compact-page-header__controls">
        <slot />
      </div>
    </div>
  </header>
</template>

<style scoped>
.compact-page-header {
  border-bottom: 1px solid var(--ui-border);
}

.compact-page-header__content {
  width: min(100%, 64rem);
  margin-inline: auto;
  padding: 2.5rem 1rem 2rem;
}

.compact-page-header__grid {
  display: grid;
  min-width: 0;
  gap: 1.5rem;
  align-items: end;
}

.compact-page-header__title {
  max-width: 15ch;
  font-size: clamp(2.25rem, 1.85rem + 1.8vw, 3.5rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.02;
  text-wrap: balance;
}

.compact-page-header__description {
  max-width: 42rem;
  margin-top: 1rem;
  color: var(--ui-text-muted);
  font-size: 1rem;
  line-height: 1.65;
  text-wrap: pretty;
}

.compact-page-header__aside {
  min-width: 0;
}

.compact-page-header__controls {
  margin-top: 2rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--ui-border);
}

@media (min-width: 40rem) {
  .compact-page-header__content {
    padding-inline: 1.5rem;
  }
}

@media (min-width: 48rem) {
  .compact-page-header__grid--with-aside {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 3rem;
  }

  .compact-page-header__aside {
    max-width: 26rem;
    justify-self: end;
  }
}
</style>
