<script setup lang="ts">
const LEADING_AT_RE = /^@/

const { user, isAuthenticated, isLoading, login, logout } = useAuth()
const { stage, allUnlocked, unlockAll } = useOnboarding()

const open = defineModel<boolean>('open', { default: false })
const username = ref('')
const customHandle = ref('')
const customDomain = ref(false)
const error = ref('')
const submitting = ref(false)

function handleConnect() {
  let resolved: string

  if (customDomain.value) {
    resolved = customHandle.value.trim().toLowerCase().replace(LEADING_AT_RE, '')
    if (!resolved) {
      error.value = 'Enter your handle'
      return
    }
    if (!resolved.includes('.')) {
      error.value = 'Enter a full handle like yourname.example.com'
      return
    }
  }
  else {
    const name = username.value.trim().toLowerCase().replace(LEADING_AT_RE, '')
    if (!name) {
      error.value = 'Enter your username'
      return
    }
    if (name.includes('.')) {
      error.value = 'Just the username, without .bsky.social'
      return
    }
    resolved = `${name}.bsky.social`
  }

  error.value = ''
  submitting.value = true
  login(resolved, window.location.pathname)
}

function handleDisconnect() {
  logout()
  username.value = ''
  customHandle.value = ''
}

watch([username, customHandle], () => {
  if (error.value)
    error.value = ''
})

function toggleCustomDomain() {
  customDomain.value = !customDomain.value
  error.value = ''
}
</script>

<template>
  <UModal
    v-model:open="open"
    :aria-label="isAuthenticated ? 'Account settings' : 'Connect with Bluesky'"
  >
    <template #content>
      <div class="relative p-6 sm:p-8">
        <!-- Connected state -->
        <div v-if="isAuthenticated && user">
          <p class="section-label mb-4">
            Connected
          </p>
          <div class="flex items-center gap-3 rounded-lg border border-default p-4">
            <img
              v-if="user.avatar"
              :src="user.avatar"
              :alt="`Avatar for ${user.handle}`"
              width="40"
              height="40"
              class="size-10 rounded-full"
            >
            <div
              v-else
              class="flex size-10 items-center justify-center rounded-full bg-muted"
            >
              <UIcon
                name="i-lucide-user"
                class="size-5 text-muted"
                aria-hidden="true"
              />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">
                @{{ user.handle }}
              </p>
              <p class="font-mono text-xs text-muted truncate">
                {{ user.did }}
              </p>
            </div>
          </div>
          <div class="mt-4 flex items-center justify-between">
            <button
              v-if="!allUnlocked && stage !== 'curator'"
              class="text-xs text-muted hover:text-default"
              @click="unlockAll"
            >
              Stop showing tips
            </button>
            <span v-else />
            <UButton
              label="Disconnect"
              color="neutral"
              variant="outline"
              size="sm"
              @click="handleDisconnect"
            />
          </div>
        </div>

        <!-- Sign in state -->
        <div v-else>
          <h2
            id="auth-modal-title"
            class="font-mono text-lg font-medium"
          >
            Connect with Bluesky
          </h2>
          <p
            id="auth-modal-description"
            class="mt-2 text-sm text-muted leading-relaxed"
          >
            Sign in with your Bluesky account to publish and share your skills.
          </p>

          <form
            class="mt-6 space-y-3"
            @submit.prevent="handleConnect"
          >
            <UFormField :error="error">
              <label
                for="bluesky-handle"
                class="sr-only"
              >{{ customDomain ? 'Bluesky handle' : 'Bluesky username' }}</label>

              <!-- Simple mode: username + .bsky.social suffix -->
              <UInput
                v-if="!customDomain"
                id="bluesky-handle"
                v-model="username"
                placeholder="yourname"
                icon="i-lucide-at-sign"
                size="lg"
                class="font-mono"
                :disabled="submitting"
                :aria-invalid="!!error"
                :aria-describedby="error ? 'handle-error' : undefined"
              >
                <template #trailing>
                  <span class="text-muted text-sm font-mono select-none">.bsky.social</span>
                </template>
              </UInput>

              <!-- Custom domain mode: full handle -->
              <UInput
                v-else
                id="bluesky-handle"
                v-model="customHandle"
                placeholder="yourname.example.com"
                icon="i-lucide-at-sign"
                size="lg"
                class="font-mono"
                :disabled="submitting"
                :aria-invalid="!!error"
                :aria-describedby="error ? 'handle-error' : undefined"
              />

              <p
                v-if="error"
                id="handle-error"
                role="alert"
                class="sr-only"
              >
                {{ error }}
              </p>
            </UFormField>

            <UButton
              type="submit"
              label="Connect"
              block
              size="lg"
              :loading="submitting"
              :disabled="isLoading"
              trailing-icon="i-lucide-arrow-right"
            />
          </form>

          <div class="mt-3 flex items-center justify-between">
            <button
              class="font-mono text-xs text-muted hover:text-default transition-colors"
              type="button"
              @click="toggleCustomDomain"
            >
              {{ customDomain ? 'Use bsky.social' : 'Custom domain?' }}
            </button>
            <UButton
              to="https://bsky.app"
              target="_blank"
              label="Create account"
              color="neutral"
              variant="link"
              size="xs"
              class="font-mono"
              trailing-icon="i-lucide-external-link"
            />
          </div>

          <p class="mt-4 text-xs text-muted leading-relaxed">
            skilld.dev uses the <a href="https://atproto.com" target="_blank" class="text-default hover:text-primary transition-colors">AT Protocol</a> for authentication. Your data stays on your Personal Data Server.
          </p>
        </div>

        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          class="absolute right-3 top-3"
          aria-label="Close dialog"
          @click="open = false"
        />
      </div>
    </template>
  </UModal>
</template>
