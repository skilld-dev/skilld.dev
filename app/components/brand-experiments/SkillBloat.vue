<script setup lang="ts">
import { ref } from 'vue'

const focused = ref(false)
const fragments = Array.from({ length: 25 }, (_, index) => ({
  index,
  x: (index * 31) % 84 - 8,
  y: (index * 47) % 210 + 28,
  angle: (index * 17) % 70 - 35,
}))
</script>

<template>
  <section class="bloat-specimen" aria-label="Skill bloat brand experiment">
    <div class="bloat-specimen__art" :class="{ 'is-focused': focused }" aria-hidden="true">
      <div class="bloat-specimen__field">
        <span
          v-for="fragment in fragments"
          :key="fragment.index"
          class="bloat-specimen__fragment"
          :style="{ '--x': `${fragment.x}%`, '--y': `${fragment.y}px`, '--angle': `${fragment.angle}deg`, '--delay': `${fragment.index * 9}ms` }"
        ><i /><i /><i /></span>
      </div>
      <div class="bloat-specimen__selection">
        <span class="bloat-specimen__number">01</span>
        <div class="bloat-specimen__ribbon">
          <span>SKILL.md</span><i /><i /><i />
        </div>
      </div>
      <span class="bloat-specimen__annotation">{{ focused ? 'one task · one Skill' : 'what does this task need?' }}</span>
    </div>
    <div class="bloat-specimen__caption">
      <div>
        <h3>One task. One Skill.</h3>
        <p>Give this task one Skill. Install only what earns a place.</p>
      </div>
      <button type="button" :aria-pressed="focused" @click="focused = !focused">
        {{ focused ? 'Show all Skills' : 'Focus one Skill' }}
        <span aria-hidden="true">{{ focused ? '↺' : '→' }}</span>
      </button>
    </div>
    <p class="sr-only" aria-live="polite">
      {{ focused ? 'One Skill is in focus. The other instruction fragments recede.' : 'Many instruction fragments surround one Skill.' }}
    </p>
  </section>
</template>

<style scoped>
.bloat-specimen { color: var(--ui-text); background: var(--ui-bg); }
.bloat-specimen__art { position: relative; height: 330px; overflow: hidden; border-block: 1px solid var(--ui-border); }
.bloat-specimen__field { position: absolute; inset: 0; }
.bloat-specimen__fragment { position: absolute; left: var(--x); top: var(--y); width: 170px; height: 40px; padding: 8px 12px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--ui-border-accented); background: var(--ui-bg); transform: rotate(var(--angle)); transition: opacity 500ms var(--delay), transform 700ms var(--delay); }
.bloat-specimen__fragment i { height: 1px; width: 85%; background: var(--ui-text-muted); opacity: .5; }
.bloat-specimen__fragment i:nth-child(2) { width: 60%; }
.bloat-specimen__selection { position: absolute; left: 18%; right: 18%; top: 74px; display: flex; flex-direction: column; align-items: center; }
.bloat-specimen__number { font: 500 130px/.95 var(--font-sans); letter-spacing: -.09em; color: var(--ui-text); opacity: 0; transform: translateY(18px); transition: opacity 500ms, transform 600ms; }
.bloat-specimen__ribbon { position: relative; width: 100%; height: 60px; padding-inline: 20px; display: flex; align-items: center; gap: 8px; background: var(--ui-primary); color: var(--color-white); transform: rotate(-9deg) translateY(-30px); transition: transform 700ms; }
.bloat-specimen__ribbon span { font: 500 20px var(--font-mono); padding-right: 12px; }
.bloat-specimen__ribbon i { width: 1px; height: 24px; flex: 1; border-block: 1px solid currentColor; opacity: .6; }
.bloat-specimen__annotation { position: absolute; bottom: 24px; left: 24px; right: 24px; font: 12px var(--font-mono); color: var(--ui-text-muted); }
.is-focused .bloat-specimen__fragment { opacity: .08; transform: translateY(20px) rotate(0deg); }
.is-focused .bloat-specimen__number { opacity: 1; transform: translateY(0); }
.is-focused .bloat-specimen__ribbon { transform: rotate(0) translateY(14px); }
.bloat-specimen__caption { display: flex; align-items: start; gap: 24px; padding: 24px 0; }
.bloat-specimen__caption > div { flex: 1; }
.bloat-specimen h3 { margin: 0; font: 600 clamp(23px, 4vw, 30px)/1.2 var(--font-sans); letter-spacing: -.04em; }
.bloat-specimen p { font-size: 14px; line-height: 1.6; margin: 12px 0 0; color: var(--ui-text-muted); }
.bloat-specimen button { flex-shrink: 0; min-height: 44px; display: flex; align-items: center; gap: 12px; padding: 0 12px; border: 1px solid var(--ui-border); font: 12px var(--font-mono); color: var(--ui-text); background: var(--ui-bg); cursor: pointer; }
.bloat-specimen button:hover { border-color: var(--ui-text-muted); }
.bloat-specimen button:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 4px; }
@media (max-width: 450px) {
  .bloat-specimen__art { height: 280px; }
  .bloat-specimen__selection { left: 12%; right: 12%; top: 52px; }
  .bloat-specimen__number { font-size: 112px; }
  .bloat-specimen__caption { flex-direction: column; gap: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .bloat-specimen__fragment, .bloat-specimen__number, .bloat-specimen__ribbon { transition: none; }
}
</style>
