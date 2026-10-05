<script setup lang="ts">
import { ref } from 'vue'

const watching = ref(true)
const revision = ref(0)
</script>

<template>
  <section class="freshness-experiment">
    <div class="experiment-heading">
      <h3>See when knowledge moves.</h3>
      <p>The source changes. Your local copy stays still. Watch makes the difference visible.</p>
    </div>
    <div :key="revision" class="freshness-stage" :class="{ 'is-watching': watching }" role="img" :aria-label="watching ? 'Illustrative source has changed. Watch highlights differences without changing the local copy.' : 'Illustrative source has changed while the local copy stays still.'">
      <div class="sheet sheet-local" aria-hidden="true">
        <span class="sheet-caption">Local copy</span>
        <div class="dot-matrix">
          <i v-for="dot in 120" :key="dot" :class="{ 'ink-dot': dot % 11 < 5 }" />
        </div>
        <span class="sheet-foot">Kept in your project</span>
      </div>
      <div class="sheet sheet-source" aria-hidden="true">
        <span class="sheet-caption">Illustrative source</span>
        <div class="dot-matrix">
          <i v-for="dot in 120" :key="dot" :class="{ 'ink-dot': dot % 11 < 5, 'changed-dot': dot > 48 && dot < 85 }" />
        </div>
        <span class="sheet-foot">Changed at the source</span>
      </div>
      <div class="change-seam" aria-hidden="true">
        <span>Watch for changes</span>
        <i />
      </div>
    </div>
    <div class="experiment-controls">
      <UButton color="neutral" variant="outline" :aria-pressed="watching" @click="watching = !watching">
        {{ watching ? 'Hide differences' : 'Show differences' }}
      </UButton>
      <UButton color="neutral" variant="ghost" @click="revision++">
        Replay
      </UButton>
    </div>
    <p class="experiment-footnote">
      Illustration only. Watching reports changes. It does not update your local copy.
    </p>
  </section>
</template>

<style scoped>
.freshness-experiment { container-type: inline-size; color: var(--ui-text); }
.experiment-heading h3 { font-size: clamp(1.4rem, 4cqi, 2rem); font-weight: 600; line-height: 1.2; letter-spacing: -.04em; margin: 0 0 12px; }
.experiment-heading p { max-width: 40ch; font-size: 16px; line-height: 1.6; color: var(--ui-text-muted); margin: 0; }
.freshness-stage { height: 330px; position: relative; overflow: hidden; margin: 24px 0 16px; border-block: 1px solid var(--ui-border); }
.sheet { position: absolute; width: 48%; height: 226px; border: 1px solid var(--ui-border-accented); background: var(--ui-bg); padding: 16px; display: flex; flex-direction: column; justify-content: space-between; }
.sheet-local { left: 8%; top: 68px; transform: rotate(-7deg); }
.sheet-source { left: 44%; top: 27px; transform: rotate(7deg); animation: source-moves 360ms ease-out both; }
.sheet-caption, .sheet-foot, .change-seam { font-family: var(--font-mono); font-size: 14px; line-height: 1.5; }
.sheet-caption { color: var(--ui-text); }
.sheet-foot { color: var(--ui-text-muted); }
.dot-matrix { display: grid; grid-template-columns: repeat(12, 1fr); gap: 7px; padding-block: 16px; }
.dot-matrix i { width: 4px; height: 4px; border-radius: 50%; background: var(--ui-border-accented); justify-self: center; }
.dot-matrix .ink-dot { background: var(--ui-text-muted); }
.dot-matrix .changed-dot { transform: translateX(3px); }
.is-watching .dot-matrix .changed-dot { background: var(--ui-primary); }
.change-seam { position: absolute; left: 6%; right: 6%; top: 173px; color: var(--ui-primary); opacity: 0; transition: opacity 200ms ease-out; }
.change-seam span { background: var(--ui-bg); padding: 4px 8px; border: 1px solid var(--ui-primary); position: relative; z-index: 1; }
.change-seam i { position: absolute; top: 9px; left: 0; right: 0; border-top: 1px dashed var(--ui-primary); }
.is-watching .change-seam { opacity: 1; }
.experiment-controls { display: flex; gap: 8px; flex-wrap: wrap; }
.experiment-controls :deep(button) { min-height: 44px; }
.experiment-footnote { font-size: 14px; line-height: 1.6; color: var(--ui-text-muted); max-width: 58ch; margin: 12px 0 0; }
@keyframes source-moves { from { transform: rotate(-7deg) translate(-16px, 16px); } to { transform: rotate(7deg); } }
@container (max-width: 400px) { .sheet { padding: 12px; width: 54%; } .sheet-local { left: 3%; } .sheet-source { left: 41%; } .dot-matrix { gap: 6px; } .sheet-foot { font-size: 14px; } }
@media (prefers-reduced-motion: reduce) { .sheet-source { animation: none; } .change-seam { transition: none; } }
</style>
