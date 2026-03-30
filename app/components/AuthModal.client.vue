<script setup lang="ts">
import { isValidHandle } from '@atproto/syntax'

const { user, isAuthenticated, isLoading, login, logout } = useAuth()
const { stage, allUnlocked, unlockAll } = useOnboarding()

const open = defineModel<boolean>('open', { default: false })
const handleInput = ref('')
const error = ref('')
const submitting = ref(false)

function handleConnect() {
  const value = handleInput.value.trim()
  if (!value)
    return

  if (value.startsWith('https://') || isValidHandle(value) || value.includes('.')) {
    error.value = ''
    submitting.value = true
    login(value, window.location.pathname)
  }
  else {
    error.value = 'Enter a valid AT Protocol handle or PDS URL'
  }
}

function handleBlueskySignIn() {
  submitting.value = true
  login('https://bsky.social', window.location.pathname)
}

function handleCreateAccount() {
  navigateTo('https://bsky.app', { external: true, open: { target: '_blank' } })
}

function handleDisconnect() {
  logout()
  handleInput.value = ''
}

watch(handleInput, (val) => {
  if (error.value)
    error.value = ''
  const normalized = val.trim().toLowerCase().replace(/@/g, '')
  if (normalized !== val)
    handleInput.value = normalized
})
</script>

<template>
  <UModal
    v-model:open="open"
    :aria-label="isAuthenticated ? 'Account settings' : 'Connect with your Atmosphere account'"
  >
    <template #content>
      <div class="relative p-6 sm:p-8">
        <!-- Connected state -->
        <div v-if="isAuthenticated && user">
          <p class="section-label mb-4">
            Connected
          </p>
          <div class="flex items-center gap-3 rounded-lg border border-default p-4">
            <span class="size-3 rounded-full bg-green-500 shrink-0" aria-hidden="true" />
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
              <p class="font-mono text-xs text-muted">
                @{{ user.handle }}
              </p>
            </div>
          </div>

          <div class="mt-4 flex flex-col gap-3">
            <UButton
              :to="`/people/${user.handle}`"
              label="View Profile"
              color="neutral"
              variant="outline"
              block
              @click="open = false"
            />
            <UButton
              label="Disconnect"
              color="neutral"
              variant="ghost"
              block
              @click="handleDisconnect"
            />
          </div>

          <div v-if="!allUnlocked && stage !== 'curator'" class="mt-3 text-center">
            <button
              class="text-xs text-muted hover:text-default transition-colors"
              @click="unlockAll"
            >
              Stop showing tips
            </button>
          </div>
        </div>

        <!-- Sign in state -->
        <div v-else>
          <h2
            id="auth-modal-title"
            class="font-mono text-lg font-medium"
          >
            Connect with your Atmosphere account
          </h2>
          <p
            id="auth-modal-description"
            class="mt-2 text-sm text-muted leading-relaxed"
          >
            Sign in with your Atmosphere account to publish and share your skills.
          </p>

          <form
            class="mt-6 space-y-3"
            @submit.prevent="handleConnect"
          >
            <UFormField :error="error">
              <label
                for="handle-input"
                class="block font-mono text-xs text-muted uppercase tracking-wider mb-1.5"
              >
                Handle or PDS URL
              </label>
              <UInput
                id="handle-input"
                v-model="handleInput"
                placeholder="you.bsky.social or https://pds.example.com"
                icon="i-lucide-at-sign"
                size="lg"
                class="font-mono"
                :disabled="submitting"
                :aria-invalid="!!error"
                :aria-describedby="error ? 'handle-error' : undefined"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
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

            <details class="text-sm">
              <summary class="text-muted hover:text-default transition-colors cursor-pointer">
                What is the Atmosphere?
              </summary>
              <p class="mt-3 text-sm text-muted leading-relaxed">
                skilld.dev is built on the <a href="https://atproto.com" target="_blank" class="text-default hover:text-primary transition-colors">AT Protocol</a>,
                the same open network that powers <a href="https://bsky.app" target="_blank" class="text-default hover:text-primary transition-colors">Bluesky</a>
                and <a href="https://tangled.org" target="_blank" class="text-default hover:text-primary transition-colors">Tangled</a>.
                Your identity and data live on your Personal Data Server, not on skilld.dev.
              </p>
            </details>

            <UButton
              type="submit"
              label="Connect"
              block
              size="lg"
              :loading="submitting"
              :disabled="!handleInput.trim()"
              trailing-icon="i-lucide-arrow-right"
            />
          </form>

          <UButton
            label="Create account"
            color="neutral"
            variant="outline"
            block
            size="lg"
            class="mt-3"
            trailing-icon="i-lucide-external-link"
            @click="handleCreateAccount"
          />

          <div class="relative my-4">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-default" />
            </div>
            <div class="relative flex justify-center text-xs">
              <span class="bg-default px-2 text-muted font-mono">or</span>
            </div>
          </div>

          <UButton
            label="Sign in with Bluesky"
            color="neutral"
            variant="soft"
            block
            size="lg"
            icon="i-simple-icons-bluesky"
            :loading="submitting"
            @click="handleBlueskySignIn"
          />
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
