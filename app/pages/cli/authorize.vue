<script setup lang="ts">
const route = useRoute()
const { loggedIn } = useUserSession()

const status = ref<'loading' | 'ready' | 'done' | 'error'>('loading')
const error = ref('')
const lookupUrl = '/api/cli/device/lookup' as string
const authorizeUrl = '/api/cli/authorize' as string
const deviceAuthorizeUrl = '/api/cli/device/authorize' as string
const apiFetch = $fetch as any
const device = ref<{
  user_code: string
  cli_version: string | null
  machine_hint: string | null
  expires_at: number
  status: string
} | null>(null)

const returnTo = computed(() => route.fullPath)
const userCode = computed(() => typeof route.query.user_code === 'string' ? route.query.user_code : '')
const challenge = computed(() => typeof route.query.challenge === 'string' ? route.query.challenge : '')
const state = computed(() => typeof route.query.state === 'string' ? route.query.state : '')
const version = computed(() => typeof route.query.v === 'string' ? route.query.v : undefined)
const port = computed(() => {
  const raw = typeof route.query.port === 'string' ? Number(route.query.port) : 0
  return Number.isInteger(raw) ? raw : 0
})

onMounted(() => {
  void initAuthorize()
})

async function initAuthorize() {
  if (!loggedIn.value) {
    // Use the CLI-specific bounce so the full /cli/authorize?challenge=… URL
    // survives the GitHub OAuth round-trip (stashed in a short-lived cookie).
    window.location.replace(`/auth/cli-prepare?return_to=${encodeURIComponent(returnTo.value)}`)
    return
  }

  if (!loggedIn.value)
    return

  try {
    if (userCode.value) {
      device.value = await apiFetch(lookupUrl, {
        query: { user_code: userCode.value },
      })
      status.value = 'ready'
      return
    }

    if (!challenge.value || !state.value || !port.value) {
      throw new Error('Missing authorization parameters')
    }

    const response = await apiFetch(authorizeUrl, {
      method: 'POST',
      body: {
        challenge: challenge.value,
        port: port.value,
        state: state.value,
        v: version.value,
      },
    })
    window.location.replace(response.redirect)
  }
  catch (err) {
    status.value = 'error'
    error.value = err instanceof Error ? err.message : 'Authorization failed'
  }
}

async function authorizeDevice() {
  if (!device.value)
    return

  status.value = 'loading'
  try {
    await apiFetch(deviceAuthorizeUrl, {
      method: 'POST',
      body: { user_code: device.value.user_code },
    })
    status.value = 'done'
  }
  catch (err) {
    status.value = 'error'
    error.value = err instanceof Error ? err.message : 'Device authorization failed'
  }
}

useSeoMeta({
  title: 'Authorize CLI · skilld',
  robots: 'noindex',
})
</script>

<template>
  <section class="mx-auto max-w-lg px-4 sm:px-6 pt-16 pb-12 md:pt-24">
    <div class="rounded-lg border border-default p-6 sm:p-8">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-terminal" class="mt-1 size-6 text-primary" aria-hidden="true" />
        <div>
          <h1 class="font-mono text-lg font-medium">
            Authorize skilld CLI
          </h1>
          <p class="mt-2 text-sm text-muted leading-relaxed">
            Connect this command-line session to your skilld account.
          </p>
        </div>
      </div>

      <div v-if="status === 'loading'" class="mt-6 flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
        Checking session
      </div>

      <div v-else-if="status === 'ready' && device" class="mt-6 space-y-5">
        <dl class="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt class="text-muted">
            Code
          </dt>
          <dd class="font-mono">
            {{ device.user_code }}
          </dd>
          <dt class="text-muted">
            CLI version
          </dt>
          <dd>{{ device.cli_version || 'unknown' }}</dd>
          <dt class="text-muted">
            Machine
          </dt>
          <dd>{{ device.machine_hint || 'unknown' }}</dd>
          <dt class="text-muted">
            Scope
          </dt>
          <dd class="font-mono">
            cli
          </dd>
        </dl>

        <UButton
          label="Authorize this CLI session"
          icon="i-lucide-check"
          block
          @click="authorizeDevice"
        />
      </div>

      <div v-else-if="status === 'done'" class="mt-6 flex items-center gap-2 text-sm">
        <UIcon name="i-lucide-circle-check" class="size-5 text-success" aria-hidden="true" />
        CLI session authorized.
      </div>

      <UAlert
        v-else-if="status === 'error'"
        class="mt-6"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Authorization failed"
        :description="error"
      />
    </div>
  </section>
</template>
