<script setup lang="ts">
import { avatarProxyUrl } from '#shared/image-proxy'

const {
  src,
  name,
  size = 'md',
} = defineProps<{
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
}>()

const imageFailed = ref(false)
const initials = computed(() =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?',
)
</script>

<template>
  <span class="collection-avatar" :data-size="size" aria-hidden="true">
    <img
      v-if="src && !imageFailed"
      :src="avatarProxyUrl(src)"
      alt=""
      loading="lazy"
      decoding="async"
      @error="imageFailed = true"
    >
    <span v-else>{{ initials }}</span>
  </span>
</template>

<style scoped>
.collection-avatar {
  display: grid;
  flex: none;
  place-items: center;
  overflow: hidden;
  border: 2px solid var(--ui-bg);
  border-radius: 9999px;
  outline: 1px solid var(--ui-border);
  background: color-mix(in oklab, var(--ui-bg-muted) 82%, var(--ui-color-primary-500));
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--ui-text);
}

.collection-avatar[data-size="sm"] {
  width: 1.75rem;
  height: 1.75rem;
}

.collection-avatar[data-size="md"] {
  width: 2.5rem;
  height: 2.5rem;
}

.collection-avatar[data-size="lg"] {
  width: 3rem;
  height: 3rem;
  font-size: 0.75rem;
}

.collection-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
