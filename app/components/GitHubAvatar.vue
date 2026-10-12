<script setup lang="ts">
import { githubAvatarProxyUrl } from '#shared/image-proxy'

const { owner, size = 32 } = defineProps<{ owner: string, size?: 28 | 32 | 36 }>()
const emit = defineEmits<{ avatarError: [] }>()
const avatar = useTemplateRef<HTMLImageElement>('avatar')
const failed = ref(false)
const initials = computed(() => owner.slice(0, 2).toUpperCase())
const src = computed(() => githubAvatarProxyUrl(owner, size * 2))

function fail() {
  failed.value = true
  emit('avatarError')
}

watch(() => owner, () => {
  failed.value = false
})
onMounted(() => {
  const image = avatar.value
  if (image?.complete && image.naturalWidth === 0)
    fail()
})
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-default bg-muted font-mono text-xs text-muted"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <span v-if="failed">{{ initials }}</span>
    <img
      v-else
      ref="avatar"
      :src
      alt=""
      :width="size"
      :height="size"
      class="size-full object-cover"
      loading="lazy"
      decoding="async"
      @error="fail"
    >
  </span>
</template>
