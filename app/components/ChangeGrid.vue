<script setup lang="ts">
import type { ChangeMark, DatedChange, SkillChange } from '#shared/change-grid'
import { changeGrid, GRID_CELLS, GRID_DAYS, GRID_WEEKS, gridCell } from '#shared/change-grid'

/**
 * Thirteen weeks of changes to one Skill, today bottom right.
 *
 * Change days are ink and the newest change is rose. A change with a known
 * version bump wears rings: one for a minor, two for a major, a hollow ring
 * for a first version. A change with no known bump is a plain dot, because
 * the grid never invents one.
 *
 * The line under the grid reads one change. Hover previews the nearest
 * change, a tap or click pins it, Enter steps to the next older change, and
 * the arrow keys move between changes, so touch and keyboard reach every note.
 */
const {
  changes,
  name,
  now,
  fromFirst = false,
} = defineProps<{
  changes: readonly SkillChange[]
  /** The Skill name, for the screen reader label. */
  name: string
  /**
   * Unix seconds for today. Pass the time the data was read, such as a feed's
   * `computedAt`, so the server render and the browser count the same days.
   */
  now: number
  /** True when `changes` starts at the first version of the Skill. */
  fromFirst?: boolean
}>()

const PITCH = 10
const PAD = 2.4
const VIEW_W = GRID_WEEKS * PITCH + PAD * 2
const VIEW_H = GRID_DAYS * PITCH + PAD * 2
const HOVER_REACH = 8
/** Circle radii per mark: the dot (0 for none), then each ring. */
const GLYPH: Record<string, number[]> = {
  plain: [2.3],
  patch: [2.3],
  minor: [1.8, 3.7],
  major: [1.8, 3.7, 5.9],
  first: [0, 3.7],
}

const cells = computed(() => changeGrid({ changes, fromFirst }, now))

const centre = (column: number, row: number) => ({ x: column * PITCH + PITCH / 2, y: row * PITCH + PITCH / 2 })

/** Every change in the grid, newest first, with the centre of its day. */
const entries = computed(() => cells.value.flatMap(cell => cell.changes.map(change => ({ change, ...centre(cell.column, cell.row) }))))

const changeDays = computed(() => new Set(cells.value.map(cell => cell.daysAgo)))
const emptyDays = computed(() => Array.from({ length: GRID_CELLS }, (_, daysAgo) => daysAgo)
  .filter(daysAgo => !changeDays.value.has(daysAgo))
  .map(daysAgo => centre(gridCell(daysAgo)!.column, gridCell(daysAgo)!.row)))

const glyphs = computed(() => cells.value.map((cell) => {
  const [dot, ...rings] = GLYPH[markKey(cell.mark)]!
  return { key: cell.daysAgo, newest: cell.newest, dot: dot!, rings, ...centre(cell.column, cell.row) }
}))

const pinned = ref(0)
const hovered = ref<number | null>(null)
const shown = computed(() => Math.min(hovered.value ?? pinned.value, Math.max(0, entries.value.length - 1)))
const shownEntry = computed(() => entries.value[shown.value])

watch(entries, () => {
  pinned.value = 0
  hovered.value = null
})

function markKey(mark: ChangeMark): string {
  return mark._tag === 'bump' ? mark.bump : 'plain'
}

function when(change: DatedChange): string {
  return change.daysAgo === 0 ? 'today' : `${change.daysAgo}d ago`
}

function versionText(change: DatedChange): string | null {
  if (!change.version)
    return null
  const bump = change.mark._tag === 'bump' && change.mark.bump !== 'first' ? ` ${change.mark.bump}` : ''
  const first = change.mark._tag === 'bump' && change.mark.bump === 'first' ? ' first version' : ''
  return `v${change.version.replace(/^v/, '')}${bump}${first}`
}

const svgRef = ref<SVGSVGElement>()

function nearest(event: PointerEvent | MouseEvent): { index: number, distance: number } {
  const box = svgRef.value?.getBoundingClientRect()
  if (!box?.width)
    return { index: 0, distance: Infinity }
  const x = (event.clientX - box.left) / box.width * VIEW_W - PAD
  const y = (event.clientY - box.top) / box.height * VIEW_H - PAD
  return entries.value.reduce((best, entry, index) => {
    const distance = Math.hypot(entry.x - x, entry.y - y)
    return distance < best.distance ? { index, distance } : best
  }, { index: 0, distance: Infinity })
}

function onPointerMove(event: PointerEvent) {
  // Touch has no hover; a tap pins instead.
  if (event.pointerType !== 'mouse')
    return
  const hit = nearest(event)
  hovered.value = hit.distance <= HOVER_REACH ? hit.index : null
}

function onClick(event: MouseEvent) {
  hovered.value = null
  // A keyboard press arrives as a click with detail 0: step to the next older change, then wrap.
  pinned.value = event.detail === 0
    ? (pinned.value + 1) % entries.value.length
    : nearest(event).index
}

function onKeydown(event: KeyboardEvent) {
  const last = entries.value.length - 1
  const next = {
    ArrowLeft: Math.min(pinned.value + 1, last),
    ArrowDown: Math.min(pinned.value + 1, last),
    ArrowRight: Math.max(pinned.value - 1, 0),
    ArrowUp: Math.max(pinned.value - 1, 0),
    Home: 0,
    End: last,
    Escape: 0,
  }[event.key]
  if (next === undefined)
    return
  event.preventDefault()
  hovered.value = null
  pinned.value = next
}

const count = computed(() => entries.value.length)
const summary = computed(() => count.value === 0
  ? `${name}: no changes in ${GRID_WEEKS} weeks.`
  : `${name}: ${count.value} ${count.value === 1 ? 'change' : 'changes'} in ${GRID_WEEKS} weeks. Press to read the next change. The arrow keys move between changes.`)
</script>

<template>
  <div class="change-grid">
    <component
      :is="count ? 'button' : 'span'"
      :type="count ? 'button' : undefined"
      class="change-grid__pick"
      :role="count ? undefined : 'img'"
      :aria-label="summary"
      @pointermove="onPointerMove"
      @pointerleave="() => { hovered = null }"
      @click="(event: MouseEvent) => { if (count) onClick(event) }"
      @keydown="(event: KeyboardEvent) => { if (count) onKeydown(event) }"
    >
      <svg
        ref="svgRef"
        class="change-grid__svg"
        :viewBox="`${-PAD} ${-PAD} ${VIEW_W} ${VIEW_H}`"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          v-for="(day, index) in emptyDays"
          :key="`d${index}`"
          class="change-grid__day"
          :cx="day.x"
          :cy="day.y"
          r="1.4"
        />
        <g
          v-for="glyph in glyphs"
          :key="glyph.key"
          class="change-grid__change"
          :class="glyph.newest && 'change-grid__change--newest'"
        >
          <circle
            v-if="glyph.dot"
            class="change-grid__dot"
            :cx="glyph.x"
            :cy="glyph.y"
            :r="glyph.dot"
          />
          <circle
            v-for="ring in glyph.rings"
            :key="ring"
            class="change-grid__ring"
            :cx="glyph.x"
            :cy="glyph.y"
            :r="ring"
          />
        </g>
        <rect
          v-if="shownEntry"
          class="change-grid__selected"
          :class="shown > 0 && 'change-grid__selected--on'"
          :x="shownEntry.x - 7.2"
          :y="shownEntry.y - 7.2"
          width="14.4"
          height="14.4"
          rx="2.5"
        />
      </svg>
    </component>
    <p class="change-grid__note" aria-live="polite">
      <template v-if="shownEntry">
        <!-- The spaces are for screen readers; the flex gap does the visual spacing. -->
        <span class="change-grid__when">{{ when(shownEntry.change) }}</span>{{ ' ' }}
        <span v-if="versionText(shownEntry.change)" class="change-grid__version">{{ versionText(shownEntry.change) }}</span>{{ ' ' }}
        <span v-if="shownEntry.change.note">{{ shownEntry.change.note }}</span>
      </template>
      <template v-else>
        No changes in {{ GRID_WEEKS }} weeks
      </template>
    </p>
  </div>
</template>

<style scoped>
.change-grid {
  display: inline-grid;
  gap: 0.375rem;
  min-width: 0;
  max-width: 100%;
}

.change-grid__pick {
  display: block;
  justify-self: start;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

button.change-grid__pick {
  cursor: pointer;
}

.change-grid__svg {
  display: block;
  width: var(--change-grid-width, 8.5rem);
  max-width: 100%;
  height: auto;
  overflow: visible;
}

.change-grid__day {
  fill: var(--ui-border-accented);
}

.change-grid__change {
  color: var(--ui-text);
  opacity: 0.72;
}

.change-grid__change--newest {
  color: var(--brand-dot);
  opacity: 1;
}

.change-grid__dot {
  fill: currentColor;
}

.change-grid__ring {
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
}

.change-grid__selected {
  fill: none;
  stroke: var(--ui-text-muted);
  stroke-width: 0.8;
  opacity: 0;
  transition: opacity 140ms ease-out;
}

.change-grid__selected--on {
  opacity: 1;
}

.change-grid__note {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.375rem;
  margin: 0;
  min-height: 1.45em;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--ui-text);
  overflow-wrap: anywhere;
}

.change-grid__when,
.change-grid__version {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.change-grid__version {
  color: var(--ui-text);
}

@media (prefers-reduced-motion: reduce) {
  .change-grid__selected {
    transition: none;
  }
}
</style>
