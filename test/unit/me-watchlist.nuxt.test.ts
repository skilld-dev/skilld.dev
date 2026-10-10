import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

const oldSyncTime = 1_755_000_000
const newSyncTime = 1_786_000_000

function accountFixture(starsSyncedAt = oldSyncTime) {
  return {
    login: 'harlan',
    name: 'Harlan Wilton',
    avatar: 'https://github.com/harlan-zw.png',
    email: 'harlan@example.com',
    digest_email: 'harlan@example.com',
    email_opt_in: true,
    weekly_opt_in: true,
    timezone: 'Australia/Melbourne',
    stars_synced_at: starsSyncedAt,
  }
}

function likedSkillFixture() {
  return {
    owner: 'antfu',
    repo: 'skills',
    name: 'nuxt',
    slug: 'antfu/skills/nuxt',
    description: 'Build full-stack Vue applications with Nuxt.',
    likedAt: 1_755_000_000,
  }
}

const account = ref<ReturnType<typeof accountFixture> | undefined>(accountFixture())
const accountError = ref<Error>()
const subscriptionsError = ref<Error>()
const retryAccount = vi.fn(async () => {
  account.value = accountFixture()
  accountError.value = undefined
})
const retrySubscriptions = vi.fn()
const subscriptions = ref({ items: [{ owner: 'antfu', repo: 'skills', source: 'like' }] })
const likes = ref<{ items: ReturnType<typeof likedSkillFixture>[] } | undefined>({ items: [likedSkillFixture()] })
const likesError = ref<Error | undefined>()
const likesStatus = ref<'idle' | 'pending' | 'success' | 'error'>('success')

let serverAccount = accountFixture()
let serverSubscriptions = [{ owner: 'antfu', repo: 'skills', source: 'like' }]
let serverLikes = [likedSkillFixture()]
let releaseDelete: (() => void) | undefined
let releaseEmailSave: (() => void) | undefined

const requestFetch = vi.hoisted(() => vi.fn())
const executeRpc = vi.fn()
const queryRpc = vi.fn()

vi.mock('@harlan-zw/nuxt-use-query/rpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harlan-zw/nuxt-use-query/rpc')>()
  return {
    ...actual,
    invalidateNuxtRpc: vi.fn().mockResolvedValue(undefined),
  }
})

mockNuxtImport('$fetch', () => requestFetch)

mockNuxtImport('useNuxtRpcQuery', () => {
  return (operation: { path: string }) => {
    if (operation.path === '/api/me/validation')
      return { data: ref({ checked: 0, pending: 0, items: [] }), error: ref(), status: ref('success'), refresh: vi.fn() }
    if (operation.path === '/api/me')
      return { data: account, error: accountError, status: ref('success'), refresh: retryAccount }
    return {
      data: subscriptions,
      error: subscriptionsError,
      status: ref('success'),
      // `staleTime: static` can return the existing value from a direct refresh.
      refresh: retrySubscriptions,
    }
  }
})

const refreshLikes = vi.fn(async () => {
  likesStatus.value = 'pending'
  likes.value = { items: [...serverLikes] }
  likesError.value = undefined
  likesStatus.value = 'success'
})

mockNuxtImport('useFetch', () => {
  return () => ({
    data: likes,
    error: likesError,
    status: likesStatus,
    refresh: refreshLikes,
  })
})

mockNuxtImport('useNuxtMutation', () => {
  return (options: {
    mutation: (args: unknown) => Promise<unknown>
    invalidates?: string[]
    onSuccess?: (result: unknown, args: unknown, context: undefined) => void | Promise<void>
    onError?: (error: unknown, args: unknown, context: undefined) => void
  }) => {
    const pending = ref(false)
    const error = ref<unknown>(null)
    async function mutateSafe(args?: unknown) {
      pending.value = true
      error.value = null
      return options.mutation(args)
        .then(async (data) => {
          if (options.invalidates?.includes('identity:subscriptions'))
            subscriptions.value = { items: [...serverSubscriptions] }
          if (options.invalidates?.includes('identity:me'))
            account.value = { ...serverAccount }
          await options.onSuccess?.(data, args, undefined)
          return { _tag: 'ok' as const, data }
        })
        .catch((cause: unknown) => {
          error.value = cause
          options.onError?.(cause, args, undefined)
          return { _tag: 'err' as const, error: cause }
        })
        .finally(() => {
          pending.value = false
        })
    }
    return { mutateSafe, pending, isPending: pending, error }
  }
})

mockNuxtImport('useNuxtRpc', () => {
  return () => ({ execute: executeRpc, query: queryRpc })
})

mockNuxtImport('useActionFailure', () => {
  return () => Object.assign(() => vi.fn(), { clear: vi.fn() })
})

async function mountPage(view: 'skills' | 'email' | 'repositories' | 'account' = 'skills') {
  return await mountSuspended(
    await import('../../layers/identity/app/pages/me/index.vue').then(module => module.default),
    { route: view === 'skills' ? '/' : `/?view=${view}` },
  )
}

function buttonWithText(wrapper: Awaited<ReturnType<typeof mountPage>>, text: string) {
  const button = wrapper.findAll('button').find(candidate => candidate.text().includes(text))
  if (!button)
    throw new Error(`Could not find button: ${text}`)
  return button
}

function paragraphWithText(wrapper: Awaited<ReturnType<typeof mountPage>>, text: string) {
  const paragraph = wrapper.findAll('p').find(candidate => candidate.text().includes(text))
  if (!paragraph)
    throw new Error(`Could not find paragraph: ${text}`)
  return paragraph
}

describe('account skill watchlist', () => {
  beforeEach(() => {
    accountError.value = undefined
    subscriptionsError.value = undefined
    retryAccount.mockClear()
    retrySubscriptions.mockClear()
    releaseDelete = undefined
    releaseEmailSave = undefined
    serverAccount = accountFixture()
    serverSubscriptions = [{ owner: 'antfu', repo: 'skills', source: 'like' }]
    serverLikes = [likedSkillFixture()]
    account.value = accountFixture()
    subscriptions.value = { items: [...serverSubscriptions] }
    likes.value = { items: [...serverLikes] }
    likesError.value = undefined
    likesStatus.value = 'success'
    refreshLikes.mockClear()
    requestFetch.mockReset()
    executeRpc.mockReset()
    queryRpc.mockReset()

    queryRpc.mockImplementation(async (operation: { path: string }) => {
      if (operation.path === '/api/me')
        return { ...serverAccount }
      if (operation.path === '/api/me/subscriptions')
        return { items: [...serverSubscriptions] }
      throw new Error(`Unexpected query: ${operation.path}`)
    })

    requestFetch.mockImplementation(async (path: string) => {
      if (path === '/api/me/stars/sync') {
        serverAccount = accountFixture(newSyncTime)
        return {
          ok: true,
          page: 1,
          fetched: 1,
          total: 1,
          matched: 1,
          hasMore: false,
          syncedAt: newSyncTime,
        }
      }
      if (path.startsWith('/api/me/likes/')) {
        if (releaseDelete)
          await new Promise<void>(resolve => releaseDelete = resolve)
        serverLikes = []
        serverSubscriptions = []
        return { ok: true }
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    executeRpc.mockImplementation(async (operation: { path: string }) => {
      if (operation.path === '/api/me/email' && releaseEmailSave)
        await new Promise<void>(resolve => releaseEmailSave = resolve)
      return { ok: true }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('recovers account settings after the initial account load fails', async () => {
    account.value = undefined
    accountError.value = new Error('offline')
    const wrapper = await mountPage('email')
    expect(wrapper.text()).toContain('Could not load your account')
    expect(wrapper.text()).not.toContain('No email set')
    await buttonWithText(wrapper, 'Retry').trigger('click')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Email updates')
    await wrapper.get('button[aria-controls="email-settings-form"]').trigger('click')
    expect((wrapper.get('input[type="email"]').element as HTMLInputElement).value).toBe('harlan@example.com')
  })

  it('shows watched repository failures instead of an empty collection', async () => {
    subscriptionsError.value = new Error('offline')
    const wrapper = await mountPage('repositories')
    expect(wrapper.text()).toContain('Could not load watched Repositories')
    expect(wrapper.text()).not.toContain('Add a skill to start watching its source.')
    await buttonWithText(wrapper, 'Retry').trigger('click')
    expect(retrySubscriptions).toHaveBeenCalled()
  })

  it('switches account views without mixing their controls', async () => {
    const wrapper = await mountPage()
    const router = wrapper.vm.$router

    await router.push('/?view=account')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Account')
    expect(wrapper.text()).toContain('Privacy')
    expect(wrapper.text()).toContain('Delete account')
    expect(wrapper.text()).not.toContain('Weekly email')
    expect(wrapper.text()).not.toContain('Build full-stack Vue applications with Nuxt.')

    await router.push('/?view=email')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Email updates')
    expect(wrapper.text()).toContain('Weekly email')
    expect(wrapper.text()).not.toContain('Delete account')

    await router.push('/?view=unknown')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Your skills')
    expect(wrapper.text()).not.toContain('Privacy')
    wrapper.unmount()
  })

  it('removes the final skill and updates repository coverage', async () => {
    const wrapper = await mountPage()

    await wrapper.get('button[aria-label="Remove nuxt from your skills"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Add your first skill')
    const router = wrapper.vm.$router
    await router.push('/?view=repositories')
    await flushPromises()
    expect(wrapper.text()).toContain('Add a skill to start watching its source.')
    expect(wrapper.text()).not.toContain('antfu/skills')
  })

  it('disables skill removal while the request is pending', async () => {
    releaseDelete = () => {}
    const wrapper = await mountPage()
    const remove = wrapper.get('button[aria-label="Remove nuxt from your skills"]')

    await remove.trigger('click')
    await nextTick()
    const disabledWhilePending = remove.attributes('disabled') !== undefined
    releaseDelete()
    await flushPromises()

    expect(disabledWhilePending).toBe(true)
  })

  it('refreshes the visible account timestamp after syncing GitHub stars', async () => {
    const wrapper = await mountPage('repositories')
    const before = paragraphWithText(wrapper, 'Last GitHub import:').text()

    await buttonWithText(wrapper, 'Import stars again').trigger('click')
    await flushPromises()
    const after = paragraphWithText(wrapper, 'Last GitHub import:').text()

    expect(after).not.toBe(before)
  })

  it('shows a retry state when liked skills fail to load', async () => {
    likes.value = undefined
    likesError.value = new Error('offline')
    likesStatus.value = 'error'

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Could not load your skills')
    expect(wrapper.text()).not.toContain('Add your first skill')
  })

  it('shows separate email choices and disables saving while pending', async () => {
    releaseEmailSave = () => {}
    const wrapper = await mountPage('email')
    expect(wrapper.text()).toContain('Weekly email')
    expect(wrapper.text()).toContain('Monthly digest')
    await wrapper.get('button[aria-controls="email-settings-form"]').trigger('click')
    const save = buttonWithText(wrapper, 'Save email settings')

    await wrapper.get('#email-settings-form').trigger('submit')
    await nextTick()
    const disabledWhilePending = save.attributes('disabled') !== undefined
    releaseEmailSave()
    await flushPromises()

    expect(disabledWhilePending).toBe(true)
  })

  it('saves the weekly email and monthly digest as separate choices', async () => {
    const wrapper = await mountPage('email')
    await wrapper.get('button[aria-controls="email-settings-form"]').trigger('click')
    const labels = wrapper.findAll('label')
    const weekly = labels.find(label => label.text().includes('weekly email'))
    const monthly = labels.find(label => label.text().includes('monthly digest'))
    if (!weekly || !monthly)
      throw new Error('Could not find both email choices')

    await weekly.get('input').setValue(false)
    await monthly.get('input').setValue(false)
    await wrapper.get('#email-settings-form').trigger('submit')
    await flushPromises()

    expect(executeRpc).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/me/email' }),
      {
        digest_email: 'harlan@example.com',
        email_opt_in: false,
        weekly_opt_in: false,
      },
    )
  })
})
