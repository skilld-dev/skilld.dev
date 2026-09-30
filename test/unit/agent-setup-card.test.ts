import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import AgentSetupCard from '../../layers/identity/app/components/AgentSetupCard.vue'

describe('agentSetupCard', () => {
  beforeEach(() => {
    useCookie('agent_setup_dismissed').value = null
    document.cookie = 'agent_setup_dismissed=; Max-Age=0; path=/'
  })

  it('links to the developers page until it is closed', async () => {
    const wrapper = await mountSuspended(AgentSetupCard)
    expect(wrapper.find('a[href="/developers"]').exists()).toBe(true)

    await wrapper.get('button[aria-label="Close Agent setup"]').trigger('click')

    expect(wrapper.find('[data-testid="agent-setup-card"]').exists()).toBe(false)
    expect(document.cookie).toContain('agent_setup_dismissed=true')
  })

  it('stays closed when the cookie is already set', async () => {
    document.cookie = 'agent_setup_dismissed=true; path=/'
    const wrapper = await mountSuspended(AgentSetupCard)
    expect(wrapper.find('[data-testid="agent-setup-card"]').exists()).toBe(false)
  })
})
