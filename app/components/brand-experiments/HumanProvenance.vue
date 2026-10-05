<script setup lang="ts">
import { ref } from 'vue'

const traced = ref(true)
const revision = ref(0)
</script>

<template>
  <section class="provenance-experiment">
    <div class="experiment-heading">
      <h3>Knowledge has an author.</h3>
      <p>A Skill reaches your Agent. The thread leads back to the person who wrote it.</p>
    </div>
    <div :key="revision" class="provenance-stage" :class="{ 'is-traced': traced }" role="img" :aria-label="traced ? 'An illustrative Skill connects through a continuous thread to its human-written source.' : 'An illustrative Skill appears without its source thread.'">
      <div class="thread-path" aria-hidden="true">
        <i class="thread-top" />
        <i class="thread-turn" />
        <i class="thread-bottom" />
        <span class="thread-knot" />
      </div>
      <div class="skill-leaf" aria-hidden="true">
        <span class="leaf-label">Your Agent</span>
        <strong>SKILL.md</strong>
        <div class="written-lines">
          <i /><i /><i /><i />
        </div>
        <span class="leaf-end">Read the Skill</span>
      </div>
      <div class="source-leaf" aria-hidden="true">
        <div class="source-mark">
          ⏶
        </div>
        <span class="leaf-label">Illustrative source</span>
        <strong>Written by a human.</strong>
        <span class="leaf-end">The author keeps the source.</span>
      </div>
      <div class="trace-label" aria-hidden="true">
        Source stays attached.
      </div>
    </div>
    <div class="experiment-controls">
      <UButton color="neutral" variant="outline" :aria-pressed="traced" @click="traced = !traced">
        {{ traced ? 'Hide source thread' : 'Trace the source' }}
      </UButton>
      <UButton color="neutral" variant="ghost" @click="revision++">
        Replay
      </UButton>
    </div>
    <p class="experiment-footnote">
      Illustrative source. The thread represents authorship, not a safety claim.
    </p>
  </section>
</template>

<style scoped>
.provenance-experiment { container-type: inline-size; color: var(--ui-text); }
.experiment-heading h3 { font-size: clamp(1.4rem, 4cqi, 2rem); font-weight: 600; line-height: 1.2; letter-spacing: -.04em; margin: 0 0 12px; }
.experiment-heading p { max-width: 40ch; font-size: 16px; line-height: 1.6; color: var(--ui-text-muted); margin: 0; }
.provenance-stage { position: relative; height: 330px; overflow: hidden; border-block: 1px solid var(--ui-border); margin: 24px 0 16px; }
.skill-leaf { position: absolute; left: 8%; top: 28px; width: 49%; padding: 16px; border: 1px solid var(--ui-border-accented); background: var(--ui-bg); transform: rotate(-3deg); }
.leaf-label, .leaf-end, .trace-label { font-family: var(--font-mono); font-size: 14px; line-height: 1.5; }
.leaf-label { display: block; color: var(--ui-text-muted); margin-bottom: 8px; }
.skill-leaf strong { font-family: var(--font-mono); font-size: 22px; font-weight: 500; }
.written-lines { display: flex; gap: 7px; flex-direction: column; padding: 16px 0; }
.written-lines i { border-top: 2px solid var(--ui-border-accented); width: 90%; }
.written-lines i:nth-child(2) { width: 72%; }
.written-lines i:nth-child(3) { width: 83%; }
.written-lines i:nth-child(4) { width: 44%; }
.leaf-end { display: block; color: var(--ui-text-muted); }
.source-leaf { position: absolute; left: 36%; right: 5%; bottom: 24px; padding: 16px 0 16px 28px; border-top: 1px solid var(--ui-border-accented); background: var(--ui-bg); }
.source-leaf strong { display: block; font-size: clamp(17px, 4cqi, 24px); font-weight: 500; margin-bottom: 8px; letter-spacing: -.03em; }
.source-mark { position: absolute; left: 0; top: 14px; font-size: 22px; color: var(--ui-primary); }
.thread-path { position: absolute; inset: 0; opacity: 0; transition: opacity 200ms ease-out; }
.thread-path i { position: absolute; border-color: var(--ui-primary); }
.thread-top { top: 101px; left: 42%; width: 42%; border-top: 1px solid; }
.thread-turn { top: 101px; right: 16%; height: 149px; width: 35%; border-right: 1px solid; border-bottom: 1px solid; border-bottom-right-radius: 48px; }
.thread-bottom { top: 250px; left: 16%; width: 36%; border-top: 1px solid; }
.thread-knot { position: absolute; top: 246px; left: 16%; width: 9px; height: 9px; border: 1px solid var(--ui-primary); border-radius: 50%; background: var(--ui-bg); }
.trace-label { position: absolute; top: 220px; left: 7%; color: var(--ui-primary); background: var(--ui-bg); padding: 4px; opacity: 0; transition: opacity 200ms ease-out; }
.is-traced .thread-path, .is-traced .trace-label { opacity: 1; }
.is-traced .thread-path { animation: thread-reveal 360ms ease-out; }
.experiment-controls { display: flex; gap: 8px; flex-wrap: wrap; }
.experiment-controls :deep(button) { min-height: 44px; }
.experiment-footnote { font-size: 14px; line-height: 1.6; color: var(--ui-text-muted); max-width: 58ch; margin: 12px 0 0; }
@keyframes thread-reveal { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0); } }
@container (max-width: 400px) { .skill-leaf { left: 5%; width: 62%; padding: 12px; } .source-leaf { left: 23%; right: 4%; padding-left: 24px; } .trace-label { top: auto; bottom: 0; left: 4%; font-size: 14px; } .thread-turn { right: 10%; } .thread-top { width: 48%; } }
@media (prefers-reduced-motion: reduce) { .thread-path, .trace-label { animation: none !important; transition: none; } }
</style>
