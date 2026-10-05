import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import WeeklyEmailPreview from '../../app/components/WeeklyEmailPreview.vue'

const CARD = '<table><tr><td><a href="https://skilld.dev/me">Settings</a></td></tr></table>'

registerEndpoint('/api/digest/demo', () => ({
  card: { light: CARD, dark: CARD },
  rowCount: 3,
}))

describe('weekly email preview', () => {
  it('keeps the preview links out of the tab order', async () => {
    const wrapper = await mountSuspended(WeeklyEmailPreview)
    const frame = wrapper.find('.home-weekly-frame')

    expect(frame.exists()).toBe(true)
    // A negative tabindex on the frame would leave every link inside the
    // email markup focusable, which is the trap the frame exists to avoid.
    expect(frame.attributes('inert')).toBeDefined()
    expect(frame.find('a').exists()).toBe(true)
  })
})
