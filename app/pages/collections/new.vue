<script setup lang="ts">
definePageMeta({ middleware: ['session'] })

const route = useRoute()
const { isAuthenticated, user, loginUrl } = useAuth()

useSeoMeta({
  title: 'New Collection',
  description: 'Bundle the skills you reach for into a collection.',
  robots: 'noindex',
})

const slug = ref(typeof route.query.slug === 'string' ? route.query.slug : '')
const name = ref(typeof route.query.name === 'string' ? route.query.name : '')
const preamble = ref(typeof route.query.preamble === 'string' ? route.query.preamble : '')

interface SkillEntry { owner: string, repo: string, reason: string }
const skills = ref<SkillEntry[]>([])
const skillsParam = computed(() => typeof route.query.skills === 'string' ? route.query.skills : '')

if (skillsParam.value) {
  for (const piece of skillsParam.value.split(',')) {
    const [ownerRepo] = piece.split(/\s+/)
    if (!ownerRepo)
      continue
    const [owner, repo] = ownerRepo.split('/')
    if (owner && repo)
      skills.value.push({ owner, repo, reason: '' })
  }
}

function addSkill() {
  skills.value.push({ owner: '', repo: '', reason: '' })
}
function removeSkill(i: number) {
  skills.value.splice(i, 1)
}

const submitting = ref(false)
const error = ref('')
async function submit() {
  error.value = ''
  submitting.value = true
  const validSkills = skills.value
    .map(s => ({ owner: s.owner.trim(), repo: s.repo.trim(), reason: s.reason.trim() || null }))
    .filter(s => s.owner && s.repo)
  const res = await $fetch<{ ok: boolean, login: string, slug: string }>('/api/collections', {
    method: 'POST',
    body: { slug: slug.value.trim(), name: name.value.trim(), preamble: preamble.value.trim(), skills: validSkills },
  }).catch((e: { data?: { message?: string } }) => {
    error.value = e?.data?.message ?? 'Could not create collection'
    return null
  })
  submitting.value = false
  if (res?.ok)
    await navigateTo(`/@${res.login}/${res.slug}`)
}

const githubLoginHref = computed(() => loginUrl({ returnTo: route.fullPath }))
</script>

<template>
  <section
    class="mx-auto max-w-2xl px-4 sm:px-6 pt-12 pb-16"
    aria-labelledby="new-collection-heading"
  >
    <h1
      id="new-collection-heading"
      class="font-mono text-2xl font-medium tracking-tight"
    >
      Publish a collection
    </h1>
    <p class="mt-2 text-sm text-muted leading-relaxed">
      Put the skills you use for one job in a collection. One command installs the set.
    </p>

    <div
      v-if="!isAuthenticated"
      class="mt-6 rounded-lg border border-default p-6 text-center"
    >
      <UIcon name="i-lucide-github" class="mx-auto size-6 text-muted" aria-hidden="true" />
      <p class="mt-3 text-sm">
        Sign in with GitHub to publish.
      </p>
      <UButton
        :to="githubLoginHref"
        external
        class="mt-4"
        size="sm"
        label="Continue with GitHub"
        icon="i-lucide-github"
      />
    </div>

    <form
      v-else
      class="mt-6 space-y-5"
      @submit.prevent="submit"
    >
      <div>
        <label for="name" class="text-xs uppercase tracking-wide text-muted">Name</label>
        <input
          id="name"
          v-model="name"
          required
          maxlength="120"
          class="mt-1 w-full rounded border border-default bg-default px-3 py-2 font-mono text-sm"
          placeholder="My Stack"
        >
      </div>

      <div>
        <label for="slug" class="text-xs uppercase tracking-wide text-muted">Slug</label>
        <div class="mt-1 flex items-center gap-2">
          <span class="font-mono text-xs text-muted">/@{{ user?.login }}/</span>
          <input
            id="slug"
            v-model="slug"
            required
            pattern="[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?"
            class="flex-1 rounded border border-default bg-default px-3 py-2 font-mono text-sm"
            placeholder="my-stack"
          >
        </div>
      </div>

      <div>
        <label for="preamble" class="text-xs uppercase tracking-wide text-muted">Preamble (optional)</label>
        <textarea
          id="preamble"
          v-model="preamble"
          rows="4"
          maxlength="4000"
          class="mt-1 w-full rounded border border-default bg-default px-3 py-2 text-sm"
          placeholder="A few sentences on what this collection is for."
        />
      </div>

      <div>
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wide text-muted">Skills</span>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            label="Add"
            @click="addSkill"
          />
        </div>
        <ul class="mt-2 space-y-2 list-none p-0">
          <li
            v-for="(s, i) in skills"
            :key="i"
            class="flex items-center gap-2"
          >
            <input
              v-model="s.owner"
              placeholder="owner"
              class="w-32 rounded border border-default bg-default px-2 py-1 font-mono text-xs"
            >
            <span class="font-mono text-xs text-muted">/</span>
            <input
              v-model="s.repo"
              placeholder="repo"
              class="w-40 rounded border border-default bg-default px-2 py-1 font-mono text-xs"
            >
            <input
              v-model="s.reason"
              placeholder="Why this skill? (optional)"
              class="flex-1 rounded border border-default bg-default px-2 py-1 text-xs"
            >
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              aria-label="Remove skill"
              @click="removeSkill(i)"
            />
          </li>
        </ul>
      </div>

      <p
        v-if="error"
        class="text-sm text-error"
        role="alert"
      >
        {{ error }}
      </p>

      <div class="flex justify-end gap-2">
        <UButton
          to="/community"
          color="neutral"
          variant="ghost"
          size="sm"
          label="Cancel"
        />
        <UButton
          :loading="submitting"
          type="submit"
          size="sm"
          label="Publish"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
    </form>
  </section>
</template>
