<script setup lang="ts">
import type { FileIconName } from '#shared/file-icons'
import { fileIconSrc } from '#shared/file-icons'

/** A file-type icon from `/_file-icons/`; see shared/file-icons.ts for why it is a file. */
const { name } = defineProps<{ name: FileIconName }>()
</script>

<template>
  <img
    :src="fileIconSrc(name)"
    alt=""
    width="16"
    height="16"
    decoding="async"
  >
</template>
