<script setup lang="ts">
import { ref } from 'vue'

const sessionOpen = ref(true)
</script>

<template>
  <section class="session-specimen" aria-label="Session boundary brand experiment">
    <div class="session-specimen__art" :class="{ 'is-ended': !sessionOpen }" aria-hidden="true">
      <div class="session-specimen__tracks">
        <span v-for="line in 11" :key="line" />
      </div>
      <div class="session-specimen__aperture">
        <span class="session-specimen__edge session-specimen__edge--left" />
        <span class="session-specimen__edge session-specimen__edge--right" />
        <span class="session-specimen__word">session</span>
      </div>
      <div class="session-specimen__ribbon">
        <span>SKILL.md</span>
        <span class="session-specimen__ribbon-lines" />
      </div>
      <span class="session-specimen__source">source</span>
      <span class="session-specimen__trace">no files written</span>
    </div>
    <div class="session-specimen__caption">
      <div>
        <h3>Knowledge for this session.</h3>
        <p>Run a Skill for the current session. Nothing lands in your repository.</p>
      </div>
      <button type="button" :aria-pressed="!sessionOpen" @click="sessionOpen = !sessionOpen">
        {{ sessionOpen ? 'End session' : 'Run again' }}
        <span aria-hidden="true">{{ sessionOpen ? '→' : '↺' }}</span>
      </button>
    </div>
    <p class="sr-only" aria-live="polite">
      {{ sessionOpen ? 'The Skill passes from its source into the current session.' : 'The session ended. No Skill files remain in the repository.' }}
    </p>
  </section>
</template>

<style scoped>
.session-specimen { color: var(--ui-text); background: var(--ui-bg); }
.session-specimen__art { position: relative; height: 330px; overflow: hidden; border-block: 1px solid var(--ui-border); }
.session-specimen__tracks { position: absolute; inset: 58px -20px; display: flex; flex-direction: column; justify-content: space-between; transform: rotate(-11deg); }
.session-specimen__tracks span { height: 1px; background: var(--ui-border); }
.session-specimen__aperture { position: absolute; inset: 35px 25%; background: var(--ui-bg); }
.session-specimen__edge { position: absolute; top: 0; bottom: 0; width: 22px; border-block: 2px solid var(--ui-text); }
.session-specimen__edge--left { left: 0; border-left: 2px solid var(--ui-text); }
.session-specimen__edge--right { right: 0; border-right: 2px solid var(--ui-text); }
.session-specimen__word { position: absolute; bottom: 22px; left: 0; right: 0; text-align: center; font-family: var(--font-mono); font-size: 14px; color: var(--ui-text-muted); }
.session-specimen__ribbon { position: absolute; left: 8%; top: 121px; width: 55%; height: 76px; display: flex; align-items: center; gap: 18px; padding: 0 24px; background: var(--ui-primary); color: var(--color-white); clip-path: polygon(0 0, 94% 0, 100% 50%, 94% 100%, 0 100%, 5% 50%); transform: rotate(-11deg); transition: transform 900ms cubic-bezier(.22,.8,.22,1), opacity 300ms 450ms; }
.session-specimen__ribbon > span:first-child { font-family: var(--font-mono); font-size: clamp(18px, 3vw, 25px); font-weight: 500; white-space: nowrap; }
.session-specimen__ribbon-lines { width: 100%; height: 24px; background: repeating-linear-gradient(to bottom, currentColor 0 1px, transparent 1px 7px); opacity: .55; }
.session-specimen__source, .session-specimen__trace { position: absolute; font: 14px var(--font-mono); }
.session-specimen__source { left: 5%; top: 40px; color: var(--ui-text-muted); }
.session-specimen__trace { right: 5%; bottom: 26px; color: var(--ui-text-muted); }
.is-ended .session-specimen__ribbon { transform: translateX(190%) rotate(-11deg); opacity: 0; }
.session-specimen__caption { display: flex; align-items: start; gap: 24px; padding: 24px 0; }
.session-specimen__caption > div { flex: 1; }
.session-specimen h3 { margin: 0; font-family: var(--font-sans); font-size: clamp(23px, 4vw, 30px); font-weight: 600; letter-spacing: -.04em; line-height: 1.2; }
.session-specimen p { font-size: 14px; line-height: 1.6; margin: 12px 0 0; color: var(--ui-text-muted); }
.session-specimen button { flex-shrink: 0; display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border: 1px solid var(--ui-border); font: 14px var(--font-mono); color: var(--ui-text); background: var(--ui-bg); cursor: pointer; }
.session-specimen button:hover { border-color: var(--ui-text-muted); }
.session-specimen button:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 4px; }
@media (max-width: 450px) {
  .session-specimen__art { height: 280px; }
  .session-specimen__ribbon { width: 70%; top: 105px; height: 66px; padding-inline: 20px; }
  .session-specimen__caption { flex-direction: column; gap: 16px; }
  .session-specimen__aperture { inset-block: 25px; }
}
@media (prefers-reduced-motion: reduce) {
  .session-specimen__ribbon { transition: none; }
}
</style>
