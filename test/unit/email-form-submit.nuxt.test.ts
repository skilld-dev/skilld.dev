import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import Account from '../../layers/identity/app/pages/me/index.vue'
import OnboardingEmail from '../../layers/identity/app/pages/onboarding/email.vue'

const mocks = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), navigate: vi.fn(), session: vi.fn(), signup: vi.fn() }))
const account = ref({
  id: 1,
  login: 'email-review',
  name: 'Email review',
  email: 'review@example.com',
  digest_email: 'review@example.com' as string | null,
  email_opt_in: true,
  weekly_opt_in: true,
  likes_public: false,
  repo_indexing: false,
  timezone: 'UTC',
  stars_synced_at: null,
  onboarded_at: null as number | null,
})

mockNuxtImport('useNuxtRpcQuery', () => (operation: { path: string }) => ({
  data: operation.path === '/api/me' ? account : ref({ items: [] }),
  status: ref('success'),
  error: ref(),
  refresh: vi.fn(),
}))
mockNuxtImport('useFetch', () => (url: unknown) => ({ data: ref(typeof url === 'function' ? '<html><head></head><body>Example email</body></html>' : { items: [] }), status: ref('success'), error: ref(), refresh: vi.fn() }))
mockNuxtImport('useNuxtRpc', () => () => ({ execute: mocks.execute, query: mocks.query }))
mockNuxtImport('useAuth', () => () => ({ fetchSession: mocks.session }))
mockNuxtImport('navigateTo', () => mocks.navigate)
mockNuxtImport('useSignupEvents', () => () => mocks.signup)
mockNuxtImport('useActionFailure', () => () => Object.assign(() => vi.fn(), { clear: vi.fn() }))
mockNuxtImport('useNuxtMutation', () => (options: { mutation: (body?: unknown) => Promise<unknown> }) => ({
  pending: ref(false),
  mutateSafe: async (body?: unknown) => ({ _tag: 'ok', data: await options.mutation(body) }),
}))

function checkboxes(form: DOMWrapper<Element> | VueWrapper) {
  return form.findAll('[role="checkbox"], input[type="checkbox"]:not([aria-hidden="true"])')
}
async function setChecked(checkbox: DOMWrapper<Element>, checked: boolean) {
  if (checkbox.attributes('role') === 'checkbox') {
    if ((checkbox.attributes('aria-checked') === 'true') !== checked)
      await checkbox.trigger('click')
  }
  else {
    await checkbox.setValue(checked)
  }
}

const screens = [
  { name: 'account settings', component: Account, form: '#email-settings-form' },
  { name: 'onboarding', component: OnboardingEmail, form: '#email-onboarding-form' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.execute.mockResolvedValue({ ok: true })
  mocks.query.mockResolvedValue({ ...account.value })
  account.value.onboarded_at = null
  account.value.digest_email = 'review@example.com'
  account.value.email_opt_in = true
  account.value.weekly_opt_in = true
})

it('keeps saved email choices when returning to completed onboarding', async () => {
  account.value.onboarded_at = 1
  account.value.email_opt_in = false
  account.value.weekly_opt_in = false
  const wrapper = await mountSuspended(OnboardingEmail, { route: '/onboarding/email' })
  for (const checkbox of checkboxes(wrapper))
    expect(checkbox.attributes('role') === 'checkbox' ? checkbox.attributes('aria-checked') === 'true' : (checkbox.element as HTMLInputElement).checked).toBe(false)
  wrapper.unmount()
})

it('offers unfinished accounts a path back to email choices', async () => {
  const wrapper = await mountSuspended(Account, { route: '/me' })
  expect(wrapper.get('a[href="/onboarding/email"]').text()).toBe('Choose email updates')
  account.value.onboarded_at = 1
  await flushPromises()
  expect(wrapper.find('a[href="/onboarding/email"]').exists()).toBe(false)
  wrapper.unmount()
})

it('offers new accounts only optional recurring emails', async () => {
  account.value.digest_email = null
  const wrapper = await mountSuspended(OnboardingEmail, { attachTo: document.body, route: '/onboarding/email' })
  const form = wrapper.get('#email-onboarding-form')
  const choices = form.findAll('[role="checkbox"], input[type="checkbox"]:not([aria-hidden="true"])')
  expect(choices).toHaveLength(2)
  ;(form.element as HTMLFormElement).requestSubmit()
  await flushPromises()
  expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/me/email' }), {
    digest_email: 'review@example.com',
    email_opt_in: false,
    weekly_opt_in: false,
  })
  wrapper.unmount()
})

it.each([
  ['weekly', 'Preview the weekly'],
  ['digest', 'Preview the digest'],
  ['welcome', 'Preview the welcome'],
])('opens the %s preview without changing email choices', async (kind, label) => {
  const wrapper = await mountSuspended(OnboardingEmail, { attachTo: document.body, route: '/onboarding/email' })
  await wrapper.findAll('button').find(button => button.text() === label)!.trigger('click')
  await flushPromises()
  expect(document.querySelector('iframe')?.getAttribute('title')).toBe(label)
  expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toBe('<html><head><base target="_blank"></head><body>Example email</body></html>')
  expect(mocks.execute).not.toHaveBeenCalled()
  wrapper.unmount()
})

describe.each(screens)('$name email submission', ({ component, form: selector }) => {
  async function mountForm() {
    const wrapper = await mountSuspended(component, { attachTo: document.body, route: component === Account ? '/me?view=email' : '/onboarding/email' })
    if (component === Account)
      await wrapper.get('button[aria-controls="email-settings-form"]').trigger('click')
    return { wrapper, form: wrapper.get(selector) }
  }

  it('submits an opt-out even when the address is malformed', async () => {
    const { wrapper, form } = await mountForm()
    try {
      await form.get('input[type="email"]').setValue('broken@')
      for (const checkbox of checkboxes(form))
        await setChecked(checkbox, false)

      // Use native submission. A synthetic submit event skips browser validation.
      ;(form.element as HTMLFormElement).requestSubmit()
      await flushPromises()

      expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/me/email' }), {
        digest_email: 'broken@',
        email_opt_in: false,
        weekly_opt_in: false,
      })
      if (component === OnboardingEmail)
        expect(mocks.navigate).toHaveBeenCalledWith('/me?welcome=1')
      expect(mocks.signup).toHaveBeenCalledWith({ stage: 'email', outcome: 'saved', entry: component === Account ? 'dashboard' : 'onboarding', choice: 'none' })
    }
    finally {
      wrapper.unmount()
    }
  })

  it.each([0, 1])('rejects a malformed address while email choice %i stays enabled', async (enabledChoice) => {
    const { wrapper, form } = await mountForm()
    try {
      await form.get('input[type="email"]').setValue('broken@')
      for (const [index, checkbox] of checkboxes(form).entries())
        await setChecked(checkbox, index === enabledChoice)

      ;(form.element as HTMLFormElement).requestSubmit()
      await flushPromises()

      expect(mocks.execute).not.toHaveBeenCalled()
      expect(form.text()).toContain(component === OnboardingEmail ? 'turn off all email choices' : 'turn off both emails')
    }
    finally {
      wrapper.unmount()
    }
  })
})
