import { summarizeSignupEvents } from '../../checks/_helpers/signup-analytics'
import { recordSignupEvent } from '../../layers/identity/server/utils/signup-analytics'
import { SignupBrowserEvent, signupDataPoint, signupEmailChoice, signupEntry } from '../../shared/signup-analytics'

it('classifies CLI sign-in without storing its authorization parameters', () => {
  expect(signupEntry('', '/cli/authorize?user_code=SECRET')).toBe('cli')
  expect(signupEntry('like-skill', '/gh/owner/repo/skill')).toBe('like-skill')
  expect(signupEntry('', '/me')).toBe('return-page')
  expect(signupEntry('', '')).toBe('direct')
})

it('keeps signup events out of command and demo totals', () => {
  expect(signupDataPoint({ stage: 'email', outcome: 'saved', entry: 'onboarding', choice: 'none' })).toEqual({
    blobs: ['email', '', 'signup', 'onboarding', '', 'saved', 'none'],
    doubles: [0, 0, 1],
    indexes: ['signup:email'],
  })
})

it.each([
  [false, false, 'none'],
  [true, false, 'weekly'],
  [false, true, 'monthly'],
  [true, true, 'both'],
] as const)('names chosen email types without the address', (weekly, monthly, choice) => {
  expect(signupEmailChoice(weekly, monthly)).toBe(choice)
})

it('rejects identifying fields and browser claims about OAuth', () => {
  expect(SignupBrowserEvent.safeParse({ stage: 'discover', outcome: 'viewed', entry: 'onboarding', login: 'alice' }).success).toBe(false)
  expect(SignupBrowserEvent.safeParse({ stage: 'oauth', outcome: 'succeeded', entry: 'direct' }).success).toBe(false)
  expect(SignupBrowserEvent.safeParse({ stage: 'email', outcome: 'saved', entry: 'onboarding', choice: 'none' }).success).toBe(true)
})

it('reports a missing analytics binding without failing the user action', () => {
  const failed = vi.fn()
  recordSignupEvent(undefined, { stage: 'oauth', outcome: 'started', entry: 'direct' }, failed)
  expect(failed).toHaveBeenCalledWith(expect.any(Error))
})

it('reports a rejected analytics write without failing the user action', () => {
  const failed = vi.fn()
  recordSignupEvent({ writeDataPoint: () => {
    throw new Error('unavailable')
  } }, { stage: 'oauth', outcome: 'started', entry: 'direct' }, failed)
  expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: 'unavailable' }))
})

it('reports sampled attempt counts without treating them as unique users', () => {
  expect(summarizeSignupEvents([{ stage: 'email', outcome: 'failed', entry: 'onboarding', choice: '', events: '4' }])).toEqual({
    unit: 'events',
    stages: [{ stage: 'email', outcome: 'failed', entry: 'onboarding', choice: '', events: 4 }],
  })
})
