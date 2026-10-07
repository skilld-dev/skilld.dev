<script setup lang="ts">
import { githubAvatarProxyUrl } from '#shared/image-proxy'

/**
 * Who builds skilld, then the route to the full comparison. The columns above
 * carry every claim, so this line carries none.
 */
</script>

<template>
  <div class="why-trust">
    <a href="https://github.com/harlan-zw" target="_blank" rel="noopener" class="why-trust__maker">
      <img
        :src="githubAvatarProxyUrl('harlan-zw', 56)"
        alt=""
        width="28"
        height="28"
        loading="lazy"
        decoding="async"
        class="why-trust__avatar"
      >
      <span>Built by <span class="text-highlighted">Harlan Wilton</span></span>
    </a>
    <UButton
      to="/vs/skills-sh"
      label="Compare with skills.sh"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
      class="min-h-11 shrink-0"
    />
  </div>
</template>

<style scoped>
.why-trust {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 2rem;
}

.why-trust__maker {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  transition: color 200ms ease-out;
}

.why-trust__maker:hover {
  color: var(--ui-text);
}

.why-trust__avatar {
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-bg-muted);
}

@media (prefers-reduced-motion: reduce) {
  .why-trust__maker {
    transition: none;
  }
}
</style>
