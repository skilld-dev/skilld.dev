<script setup lang="ts">
const {
  name,
  description = '',
  curatorHandle,
  curatorName = '',
  curatorAvatar = '',
  skillCount = 0,
  skills = [],
  reason = '',
  reasonSkill = '',
} = defineProps<{
  name: string
  description?: string
  curatorHandle: string
  curatorName?: string
  curatorAvatar?: string
  skillCount?: number
  skills?: string[]
  reason?: string
  reasonSkill?: string
}>()

const truncatedReason = computed(() => {
  if (!reason)
    return ''
  const collapsed = reason.replace(/\s+/g, ' ').trim()
  return collapsed.length <= 140 ? collapsed : `${collapsed.slice(0, 139).replace(/\s+\S*$/, '')}…`
})

function getInitials(n: string) {
  return n
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
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
    <div class="px-15 py-14 flex flex-col justify-center gap-8 h-full">
      <OgBrand :size="36" />

      <div class="flex flex-col gap-3">
        <div
          class="text-6xl tracking-tighter font-mono leading-none"
          :style="{ lineClamp: 1, textOverflow: 'ellipsis' }"
        >
          {{ name }}
        </div>

        <div
          v-if="description"
          class="text-3xl"
          :style="{ color: 'oklch(0.62 0.01 60)', lineClamp: 2, textOverflow: 'ellipsis' }"
        >
          {{ description }}
        </div>
      </div>

      <!-- Curator -->
      <div class="flex items-center gap-3">
        <span
          class="flex items-center justify-center rounded-full overflow-hidden shrink-0"
          :style="{ width: '40px', height: '40px', background: 'oklch(0.22 0.012 60)' }"
        >
          <img
            v-if="curatorAvatar"
            :src="curatorAvatar"
            :alt="curatorHandle"
            width="40"
            height="40"
            class="w-full h-full object-cover"
          >
          <span
            v-else
            class="font-medium"
            :style="{ fontSize: '14px', color: 'oklch(0.62 0.01 60)' }"
          >
            {{ getInitials(curatorName || curatorHandle) }}
          </span>
        </span>
        <span class="text-3xl font-mono" :style="{ color: 'oklch(0.62 0.01 60)' }">
          @{{ curatorHandle }}
        </span>
        <span class="text-3xl" :style="{ color: 'oklch(0.62 0.01 60)' }">
          · {{ skillCount }} skill{{ skillCount !== 1 ? 's' : '' }}
        </span>
      </div>

      <!-- Curator note -->
      <div
        v-if="truncatedReason"
        class="flex flex-col gap-2"
        :style="{
          borderLeft: '3px solid oklch(0.555 0.225 17.32)',
          paddingLeft: '16px',
        }"
      >
        <span
          class="text-2xl leading-snug"
          :style="{ color: 'oklch(0.93 0.005 60)', lineClamp: 3, textOverflow: 'ellipsis' }"
        >
          &ldquo;{{ truncatedReason }}&rdquo;
        </span>
        <span
          v-if="reasonSkill"
          class="font-mono text-xl"
          :style="{ color: 'oklch(0.62 0.01 60)' }"
        >
          on {{ reasonSkill }}
        </span>
      </div>

      <!-- Skill badges with rose accent on first badge -->
      <div
        v-else-if="skills.length"
        class="flex flex-wrap gap-2"
      >
        <span
          v-for="(skill, i) in skills.slice(0, 8)"
          :key="skill"
          class="font-mono text-xl px-3 py-1 rounded-md"
          :style="{
            background: i === 0 ? 'oklch(0.555 0.225 17.32 / 0.15)' : 'oklch(0.22 0.012 60)',
            color: i === 0 ? 'oklch(0.75 0.15 17.32)' : 'oklch(0.62 0.01 60)',
            border: i === 0 ? '1px solid oklch(0.555 0.225 17.32 / 0.3)' : '1px solid transparent',
          }"
        >
          {{ skill }}
        </span>
        <span
          v-if="skills.length > 8"
          class="font-mono text-xl px-3 py-1"
          :style="{ color: 'oklch(0.45 0.01 60)' }"
        >
          +{{ skills.length - 8 }}
        </span>
      </div>
    </div>
  </OgLayout>
</template>
