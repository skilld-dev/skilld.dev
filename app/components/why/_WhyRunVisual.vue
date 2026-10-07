<script setup lang="ts">
import { skillInstallCmd, skillRunCmd } from '#shared/skill-commands'
import WhyPanel from './_WhyPanel.vue'

/**
 * A run in a terminal, then a clean `git status`: the Skill reached the Agent
 * and nothing reached the disk. Install follows as the opt-in. The two chips
 * at the foot are the run and install materials from DESIGN.md, so the
 * picture matches the real chips. Run's hollow dot is the one rose element.
 */
const runCommand = skillRunCmd('anthropics', 'skills', 'pdf')
const installCommand = skillInstallCmd('anthropics', 'skills', 'pdf')
</script>

<template>
  <WhyPanel label="~/my-app">
    <div class="why-run">
      <p class="why-run__line">
        <span class="why-run__prompt" aria-hidden="true">❯</span>
        <InstallCommand :command="runCommand" wrap />
      </p>
      <p class="why-run__note">
        # Your agent reads /pdf for this session.
      </p>
      <p class="why-run__line">
        <span class="why-run__prompt" aria-hidden="true">❯</span>
        <code>git status --short</code>
      </p>
      <p class="why-run__note">
        # No output. The working tree is clean.
      </p>
    </div>
    <div class="why-run why-run--keep">
      <p class="why-run__note why-run__note--flush">
        # To keep it in every session:
      </p>
      <p class="why-run__line">
        <span class="why-run__prompt" aria-hidden="true">❯</span>
        <InstallCommand :command="installCommand" wrap />
      </p>
      <p class="why-run__note">
        # Adds the files and a lockfile entry.
      </p>
    </div>
    <ul class="why-run__chips" aria-label="What each command leaves on disk">
      <li class="why-run__chip why-run__chip--run">
        <span class="why-run__dot" aria-hidden="true" />
        <span class="why-run__verb">run</span>
        <span class="why-run__effect">writes nothing</span>
      </li>
      <li class="why-run__chip">
        <span class="why-run__dot" aria-hidden="true" />
        <span class="why-run__verb">install</span>
        <span class="why-run__effect">adds files</span>
      </li>
    </ul>
  </WhyPanel>
</template>

<style scoped>
.why-run {
  display: grid;
  gap: 0.25rem;
}

.why-run__line {
  display: flex;
  min-width: 0;
  gap: 0.5rem;
  color: var(--ui-text);
}

.why-run__line :deep(.install-command) {
  min-width: 0;
  background: none;
  padding: 0;
}

.why-run__prompt {
  flex: none;
  color: var(--ui-text-dimmed);
}

.why-run__note {
  padding-left: 1.125rem;
  color: var(--ui-text-dimmed);
}

.why-run__note--flush {
  padding-left: 0;
}

.why-run--keep {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--ui-border);
}

.why-run__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  /* Pinned to the foot when a grid stretches the panel. */
  margin-top: auto;
  padding: 1rem 0 0;
  list-style: none;
}

.why-run__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.75rem;
  padding: 0.125rem 0.625rem;
  border: 1px solid var(--ui-border-accented);
  border-radius: var(--ui-radius);
  color: var(--ui-text-muted);
}

.why-run__chip--run {
  border-style: dashed;
  color: var(--ui-text);
}

.why-run__dot {
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--ui-text-dimmed);
}

/* Hollow, because nothing stays. The one rose element in this picture. */
.why-run__chip--run .why-run__dot {
  background: none;
  box-shadow: inset 0 0 0 1.5px var(--brand-dot);
}

.why-run__verb {
  font-weight: 600;
  color: var(--ui-text-highlighted);
}
</style>
