<script setup lang="ts">
const {
  label,
  title,
  description,
  palette = 'stone',
  geometry = 'sky',
  headingId,
} = defineProps<{
  label: string
  title: string
  description: string
  palette?: 'rose' | 'ember' | 'stone'
  geometry?: 'sky' | 'wash' | 'bloom'
  headingId?: string
}>()
</script>

<template>
  <header class="editorial-masthead editorial-band">
    <div
      class="editorial-atmosphere"
      :data-palette="palette"
      :data-geometry="geometry"
      data-intensity="subtle"
      aria-hidden="true"
    />
    <div class="editorial-masthead__content editorial-band__content">
      <div v-if="$slots.eyebrow" class="editorial-masthead__eyebrow">
        <slot name="eyebrow" />
      </div>
      <p v-else class="section-label">
        {{ label }}
      </p>

      <div class="editorial-masthead__grid">
        <div class="min-w-0">
          <h1 :id="headingId" class="editorial-masthead__title">
            {{ title }}
          </h1>
          <p class="editorial-masthead__description">
            {{ description }}
          </p>
        </div>

        <div v-if="$slots.aside" class="editorial-masthead__aside">
          <slot name="aside" />
        </div>
      </div>

      <div v-if="$slots.default" class="editorial-masthead__actions">
        <slot />
      </div>
    </div>
  </header>
</template>
