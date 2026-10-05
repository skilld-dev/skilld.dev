<script setup lang="ts">
import type { InstallCopyMode, InstallTarget } from '~/composables/useInstallCopy'

/**
 * One printed command with a copy button, in the run chip shape language.
 *
 * Run is a dashed border with a hollow rose dot, because nothing stays.
 * Install is a solid border with a filled dot, because files land. On a run
 * copy the dashes march once: the command passed through and left nothing.
 *
 * Every copy reports to Analytics Engine through `useInstallCopy`. If the
 * clipboard fails, the command text is selected so the keyboard can copy it.
 */
const {
  command,
  mode,
  surface,
  target,
  size = 'md',
  copyLabel,
  describedBy,
} = defineProps<{
  /** From a `shared/skill-commands.ts` builder, never a hand-built string. */
  command: string
  mode: InstallCopyMode
  /** The analytics surface, such as `trending-row`. */
  surface: string
  target: InstallTarget
  size?: 'md' | 'sm'
  copyLabel?: string
  /** The id of the text that says what the command does. */
  describedBy?: string
}>()

const { copy, copied } = useInstallCopy(() => command, surface, () => mode, () => target)
const { prefersReducedMotion } = useMotionA11y()

const commandRef = ref<HTMLElement>()
const copiedCommand = ref('')
const marching = ref(false)
const status = ref('')
const { start: clearStatusLater } = useTimeoutFn(() => {
  status.value = ''
}, 2500, { immediate: false })

const showCheck = computed(() => copied.value && copiedCommand.value === command)
const label = computed(() => copyLabel ?? `Copy ${mode} command`)

function selectCommand() {
  const el = commandRef.value
  const selection = window.getSelection()
  if (!el || !selection)
    return
  selection.selectAllChildren(el)
}

async function march() {
  if (prefersReducedMotion.value)
    return
  // Restart the animation if a second copy lands before the first one ends.
  marching.value = false
  await nextTick()
  requestAnimationFrame(() => {
    marching.value = true
  })
}

async function onCopy() {
  const copiedMode = mode
  const value = command
  const result = await copy(value)
  if (result._tag === 'error') {
    selectCommand()
    status.value = 'Selected. Copy it with your keyboard.'
  }
  else {
    copiedCommand.value = value
    status.value = 'Copied.'
    if (copiedMode === 'run' && value === command)
      void march()
  }
  clearStatusLater()
}
</script>

<template>
  <div
    class="command-chip"
    :class="[
      `command-chip--${mode}`,
      `command-chip--${size}`,
      marching && 'command-chip--march',
    ]"
  >
    <svg class="command-chip__edge" aria-hidden="true" focusable="false">
      <rect
        width="100%"
        height="100%"
        rx="7.5"
        ry="7.5"
        @animationend="() => { marching = false }"
      />
    </svg>
    <span class="command-chip__dot" aria-hidden="true" />
    <span ref="commandRef" class="command-chip__command">
      <InstallCommand :command="command" wrap split-name />
    </span>
    <button
      type="button"
      class="command-chip__copy"
      :aria-label="label"
      :aria-describedby="describedBy"
      @click="onCopy()"
    >
      <svg class="command-chip__rule" aria-hidden="true" focusable="false">
        <line x1="0.5" y1="0" x2="0.5" y2="100%" />
      </svg>
      <UIcon
        :name="showCheck ? 'i-lucide-check' : 'i-lucide-copy'"
        class="size-3.5"
        aria-hidden="true"
      />
    </button>
    <span class="sr-only" aria-live="polite">{{ status }}</span>
  </div>
</template>

<style scoped>
.command-chip {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.45;
}

.command-chip--sm {
  font-size: 0.75rem;
}

/* The border is an SVG rect, so its dashes can march. A CSS dashed border cannot. */
.command-chip__edge {
  position: absolute;
  z-index: 1;
  left: 0.5px;
  top: 0.5px;
  width: calc(100% - 1px);
  height: calc(100% - 1px);
  overflow: visible;
  pointer-events: none;
}

.command-chip__rule {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.command-chip__edge rect,
.command-chip__rule line {
  fill: none;
  stroke: var(--ui-border-accented);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  transition: stroke-dasharray 200ms ease-out;
}

.command-chip--install .command-chip__edge rect,
.command-chip--install .command-chip__rule line {
  stroke-dasharray: 7 0;
}

.command-chip--install .command-chip__rule line {
  stroke: var(--ui-border);
}

.command-chip--march .command-chip__edge rect,
.command-chip--march .command-chip__rule line {
  animation: command-chip-march 600ms linear;
}

@keyframes command-chip-march {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -14;
  }
}

.command-chip__dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: 12px;
  border: 1.5px solid var(--brand-dot);
  border-radius: 999px;
  background-color: transparent;
  transition: background-color 200ms ease-out;
}

.command-chip--sm .command-chip__dot {
  margin-left: 10px;
}

.command-chip--install .command-chip__dot {
  background-color: var(--brand-dot);
}

.command-chip__command {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.5rem 0.5rem 0.5rem 0.5625rem;
}

.command-chip--sm .command-chip__command {
  padding-block: 0.3125rem;
}

.command-chip__copy {
  position: relative;
  flex: none;
  align-self: stretch;
  display: grid;
  place-items: center;
  width: 2.25rem;
  padding: 0;
  border: 0;
  border-radius: 0 calc(var(--ui-radius) - 1px) calc(var(--ui-radius) - 1px) 0;
  background: none;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: color 200ms ease-out, background-color 200ms ease-out;
}

.command-chip--sm .command-chip__copy {
  width: 2rem;
}

@media (hover: hover) {
  .command-chip__copy:hover {
    color: var(--ui-text);
    background: var(--ui-bg-muted);
  }
}

/* Touch needs a 44px target, so the chip grows on a coarse pointer only. */
@media (pointer: coarse) {
  .command-chip {
    min-height: 2.75rem;
  }

  .command-chip__copy,
  .command-chip--sm .command-chip__copy {
    width: 2.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .command-chip__edge rect,
  .command-chip__rule line,
  .command-chip__dot {
    transition: none;
  }

  .command-chip--march .command-chip__edge rect,
  .command-chip--march .command-chip__rule line {
    animation: none;
  }
}
</style>
