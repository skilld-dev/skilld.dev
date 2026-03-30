<script setup lang="ts">
interface Props {
  /** Plain text (simple mode, like UTooltip) */
  text?: string
  /** Bold title shown above description */
  title?: string
  /** Body text shown below title */
  description?: string
  /** When set, renders label text with a small (?) indicator */
  label?: string
  size?: keyof typeof sizes
  side?: 'top' | 'bottom' | 'left' | 'right'
}

const { side = 'top' } = defineProps<Props>()

const contentProps = computed(() => ({ side }))
</script>

<script lang="ts">
export const sizes = {
  xs: 'max-w-[80px]',
  sm: 'max-w-[160px]',
  md: 'max-w-[250px]',
  lg: 'max-w-[440px]',
  xl: 'max-w-[640px]',
}
</script>

<template>
  <span v-if="label" class="inline-flex items-center gap-1">
    <span>{{ label }}</span>
    <UPopover
      data-ui="UiTooltip"
      mode="hover"
      :content="contentProps"
      class="inline-flex"
    >
      <UIcon name="i-lucide-info" class="size-3 text-muted hover:text-default transition-colors cursor-help" />
      <template #content>
        <div
          class="p-3 text-xs text-left font-mono whitespace-normal leading-normal space-y-1 rounded-lg bg-elevated text-default border border-default pointer-events-none"
          :class="sizes[size || 'md']"
        >
          <div v-if="title" class="font-semibold">
            {{ title }}
          </div>
          <div :class="title ? 'text-muted' : ''">
            <slot name="text">
              {{ description || text }}
            </slot>
          </div>
        </div>
      </template>
    </UPopover>
  </span>
  <UPopover
    v-else
    data-ui="UiTooltip"
    mode="hover"
    :content="contentProps"
    :class="$slots.default ? 'inline-block' : 'inline-flex'"
  >
    <slot />
    <template #content>
      <div
        class="p-3 text-xs text-left font-mono whitespace-normal leading-normal space-y-1 rounded-lg bg-elevated text-default border border-default pointer-events-none"
        :class="sizes[size || 'md']"
      >
        <div v-if="title" class="font-semibold">
          {{ title }}
        </div>
        <div :class="title ? 'text-muted' : ''">
          <slot name="text">
            {{ description || text }}
          </slot>
        </div>
      </div>
    </template>
  </UPopover>
</template>
