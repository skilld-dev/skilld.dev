import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import CompactPageHeader from '../../app/components/CompactPageHeader.vue'

const baseProps = {
  title: 'Community',
  description: 'Curators you can watch.',
  headingId: 'community-heading',
}

describe('compactPageHeader', () => {
  it('renders the title as the page h1 under the id the page labels with', async () => {
    const wrapper = await mountSuspended(CompactPageHeader, { props: baseProps })

    const heading = wrapper.get('h1')
    expect(heading.text()).toBe('Community')
    expect(heading.attributes('id')).toBe('community-heading')
    expect(wrapper.get('header').text()).toContain('Curators you can watch.')

    wrapper.unmount()
  })

  it('renders aside and default slot content, and drops the containers when unused', async () => {
    const bare = await mountSuspended(CompactPageHeader, { props: baseProps })
    expect(bare.find('aside').exists()).toBe(false)
    expect(bare.find('.compact-page-header__controls').exists()).toBe(false)
    bare.unmount()

    const filled = await mountSuspended(CompactPageHeader, {
      props: baseProps,
      slots: {
        aside: () => h('p', 'aside content'),
        default: () => h('button', 'Publish a collection'),
      },
    })

    expect(filled.get('aside').text()).toBe('aside content')
    expect(filled.get('.compact-page-header__controls').text()).toBe('Publish a collection')

    filled.unmount()
  })
})
