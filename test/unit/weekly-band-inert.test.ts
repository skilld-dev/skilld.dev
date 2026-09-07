import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import WeeklyBand from '../../app/components/WeeklyBand.vue'

const CARD = '<table><tr><td><a href="https://skilld.dev/me">Settings</a></td></tr></table>'

registerEndpoint('/api/weekly/demo', () => ({
  card: { light: CARD, dark: CARD },
  rowCount: 3,
}))

describe('weekly band email preview', () => {
  it('keeps the preview links out of the tab order', async () => {
    const wrapper = await mountSuspended(WeeklyBand)
    const frame = wrapper.find('.home-weekly-frame')

    expect(frame.exists()).toBe(true)
    // A negative tabindex on the frame would leave every link inside the
    // email markup focusable, which is the trap the frame exists to avoid.
    expect(frame.attributes('inert')).toBeDefined()
    expect(frame.find('a').exists()).toBe(true)
  })
})
