<script setup lang="ts">
const {
  name = '',
  owner = '',
  repo = 'skills',
  curatorCount = 0,
} = defineProps<{
  name?: string
  owner?: string
  repo?: string
  curatorCount?: number
}>()

const installCmd = computed(() => {
  if (!name || !owner)
    return ''
  return `skilld add ${owner}/${repo === 'skills' ? name : `${repo}/${name}`}`
})
</script>

<template>
  <OgLayout>
    <!-- Rose accent bar -->
    <div
      :style="{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: 'oklch(0.555 0.225 17.32)',
      }"
    />
    <div class="px-15 py-14 flex flex-col justify-center gap-10 h-full">
      <OgBrand :size="36" />

      <div v-if="name" class="flex flex-col max-w-full gap-3">
        <div
          class="tracking-tighter font-mono leading-none"
          :class="name.length > 20 ? 'text-5xl' : 'text-6xl'"
          :style="{ lineClamp: 1, textOverflow: 'ellipsis', wordBreak: 'break-all' }"
        >
          {{ name }}
        </div>
        <div
          v-if="owner"
          class="text-4xl font-mono tracking-tight leading-none"
          :style="{ color: 'oklch(0.62 0.01 60)' }"
        >
          {{ owner }}{{ repo !== 'skills' ? `/${repo}` : '' }}
        </div>
      </div>

      <!-- Install command with rose left border -->
      <div
        v-if="installCmd"
        class="flex items-center"
        :style="{
          borderLeft: '3px solid oklch(0.555 0.225 17.32)',
          paddingLeft: '16px',
        }"
      >
        <span class="font-mono text-3xl" :style="{ color: 'oklch(0.62 0.01 60)' }">
          {{ installCmd }}
        </span>
      </div>

      <div
        v-if="curatorCount > 0"
        class="text-3xl"
        :style="{ color: 'oklch(0.62 0.01 60)' }"
      >
        {{ curatorCount }} curator{{ curatorCount !== 1 ? 's' : '' }} using this skill
      </div>
    </div>
  </OgLayout>
</template>
