<script setup lang="ts">
const LEADING_AT_RE = /^@/

const { user, isAuthenticated, isLoading, login, logout } = useAuth()

const open = defineModel<boolean>('open', { default: false })
const handle = ref('')
const error = ref('')
const submitting = ref(false)

function handleConnect() {
  const trimmed = handle.value.trim().toLowerCase().replace(LEADING_AT_RE, '')
  if (!trimmed) {
    error.value = 'Enter your Bluesky handle'
    return
  }
  if (!trimmed.includes('.')) {
    error.value = 'Enter a full handle like yourname.bsky.social'
    return
  }
  error.value = ''
  submitting.value = true
  login(trimmed, window.location.pathname)
}

function handleDisconnect() {
  logout()
  handle.value = ''
}

watch(handle, () => {
  if (error.value)
    error.value = ''
})
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
          <div class="flex items-center gap-3 rounded-lg border border-[var(--ui-border)] p-4">
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
              class="flex size-10 items-center justify-center rounded-full bg-[var(--ui-bg-muted)]"
            >
              <UIcon
                name="i-lucide-user"
                class="size-5 text-[var(--ui-text-muted)]"
                aria-hidden="true"
              />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">
                @{{ user.handle }}
              </p>
              <p class="font-mono text-xs text-[var(--ui-text-muted)] truncate">
                {{ user.did }}
              </p>
            </div>
          </div>
          <div class="mt-4 flex justify-end">
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
            class="mt-2 text-sm text-[var(--ui-text-muted)] leading-relaxed"
          >
            Sign in with your Bluesky account to publish and share your skill collections.
          </p>

          <form
            class="mt-6 space-y-3"
            @submit.prevent="handleConnect"
          >
            <UFormField :error="error">
              <label
                for="bluesky-handle"
                class="sr-only"
              >Bluesky handle</label>
              <UInput
                id="bluesky-handle"
                v-model="handle"
                placeholder="yourname.bsky.social"
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

          <div
            class="mt-4 flex items-center gap-2"
            role="separator"
          >
            <UDivider class="flex-1" />
            <span class="data-label">or</span>
            <UDivider class="flex-1" />
          </div>

          <UButton
            to="https://bsky.app"
            target="_blank"
            label="Create a Bluesky account"
            color="neutral"
            variant="ghost"
            block
            size="sm"
            class="mt-3"
            trailing-icon="i-lucide-external-link"
          />

          <p class="mt-4 text-xs text-[var(--ui-text-muted)] leading-relaxed">
            skilld.dev uses the AT Protocol for authentication. Your data stays on your Personal Data Server.
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
