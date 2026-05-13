<script setup lang="ts">
import type { MdxgDocument, MdxgSearchHit } from '../types'
import { useDebounceFn } from '@vueuse/core'
import { computed, nextTick, ref } from 'vue'
import { searchMdxg } from '../utils/mdxg'

const props = defineProps<{
  doc: MdxgDocument
  limit?: number
}>()

const emit = defineEmits<{
  navigate: [index: number, hit: MdxgSearchHit, query: string]
}>()

const query = ref('')
const hits = ref<MdxgSearchHit[]>([])
const cursor = ref(-1)
const input = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLUListElement | null>(null)

const run = useDebounceFn(() => {
  hits.value = searchMdxg(props.doc, query.value, props.limit ?? 20)
  cursor.value = hits.value.length ? 0 : -1
}, 80)

const hasQuery = computed(() => query.value.trim().length > 0)

function onInput() {
  if (!hasQuery.value) {
    hits.value = []
    cursor.value = -1
    return
  }
  run()
}

function focus() {
  input.value?.focus()
}

function activate(i: number) {
  const hit = hits.value[i]
  if (!hit)
    return
  cursor.value = i
  emit('navigate', hit.pageIndex, hit, query.value)
}

async function ensureVisible() {
  await nextTick()
  const list = listEl.value
  if (!list)
    return
  const active = list.querySelector<HTMLElement>('[data-active="true"]')
  active?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(e: KeyboardEvent) {
  if (!hits.value.length)
    return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    cursor.value = (cursor.value + 1) % hits.value.length
    ensureVisible()
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    cursor.value = cursor.value <= 0 ? hits.value.length - 1 : cursor.value - 1
    ensureVisible()
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    if (cursor.value >= 0)
      activate(cursor.value)
  }
}

// Split a snippet around [matchStart, matchEnd] so the match can be marked.
// Keyed on hit identity to avoid re-rendering for unrelated cursor changes.
function snippetParts(hit: MdxgSearchHit) {
  return {
    before: hit.snippet.slice(0, hit.matchStart),
    match: hit.snippet.slice(hit.matchStart, hit.matchEnd),
    after: hit.snippet.slice(hit.matchEnd),
  }
}

defineExpose({ focus })
</script>

<template>
  <div class="mdxg-search">
    <input
      ref="input"
      v-model="query"
      type="search"
      placeholder="Search…"
      aria-label="Search document"
      @input="onInput"
      @keydown="onKeydown"
    >
    <ul v-if="hits.length" ref="listEl" class="mdxg-search-results" role="listbox">
      <li v-for="(hit, i) in hits" :key="i" role="option" :data-active="i === cursor || undefined">
        <button type="button" :class="{ active: i === cursor }" @click="activate(i)">
          <span class="mdxg-search-page">{{ hit.pageTitle }}</span>
          <span class="mdxg-search-snippet">
            <span>{{ snippetParts(hit).before }}</span><mark>{{ snippetParts(hit).match }}</mark><span>{{ snippetParts(hit).after }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else-if="hasQuery" class="mdxg-search-empty">
      No matches
    </p>
  </div>
</template>
