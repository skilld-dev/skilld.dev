<script setup lang="ts">
useSeoMeta({
  title: 'Brand kit',
  description: 'Explore skilld brand experiments and the GitHub badge.',
  robots: 'noindex,nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-12 sm:px-6">
    <h1 class="text-4xl font-semibold tracking-tight">
      Brand kit
    </h1>
    <p class="mt-4 max-w-xl text-base text-muted">
      Explore the visual stories behind skilld.
    </p>
    <div class="mt-10 divide-y divide-default border-y border-default">
      <NuxtLink to="/brand-kit/experiments" class="block py-6 outline-offset-4">
        <h2 class="text-xl font-semibold">
          Five brand experiments <span aria-hidden="true">↗</span>
        </h2>
        <p class="mt-2 text-base text-muted">
          Session, bloat, freshness, provenance, and portability.
        </p>
      </NuxtLink>
      <NuxtLink to="/brand-kit/github-badge" class="block py-6 outline-offset-4">
        <h2 class="text-xl font-semibold">
          GitHub badge <span aria-hidden="true">↗</span>
        </h2>
        <p class="mt-2 text-base text-muted">
          A small mark that links a README to its Skill or Repository.
        </p>
      </NuxtLink>
    </div>
  </div>
</template>
