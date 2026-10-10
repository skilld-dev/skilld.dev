import type { AnalyticsDataPoint } from './analytics'
import { z } from 'zod'

const browserStages = [
  z.object({ stage: z.literal('discover'), entry: z.literal('onboarding'), outcome: z.enum(['viewed', 'imported', 'import-failed', 'continued', 'skipped', 'watch-failed']) }).strict(),
  z.object({ stage: z.literal('email'), entry: z.enum(['onboarding', 'dashboard']), outcome: z.enum(['viewed', 'failed', 'completion-failed']) }).strict(),
  z.object({ stage: z.literal('email'), entry: z.enum(['onboarding', 'dashboard']), outcome: z.literal('saved'), choice: z.enum(['none', 'weekly', 'monthly', 'both']) }).strict(),
  z.object({ stage: z.literal('cli'), entry: z.enum(['device', 'loopback']), outcome: z.enum(['viewed', 'authorized', 'failed']) }).strict(),
] as const

// Fixed enums reject paths, codes, addresses, account IDs, and free text.
export const SignupBrowserEvent = z.union(browserStages)
export type SignupBrowserEvent = z.infer<typeof SignupBrowserEvent>
export type SignupEntry = 'direct' | 'return-page' | 'cli' | 'like-skill' | 'watch-skill' | 'watch-collection'
export type SignupEvent = SignupBrowserEvent
  | { stage: 'oauth', entry: SignupEntry, outcome: 'started' | 'succeeded' | 'failed' }
  | { stage: 'cli', entry: 'device' | 'loopback', outcome: 'connected' }

export function signupEntry(action: string, returnTo: string): SignupEntry {
  if (returnTo.split('?')[0] === '/cli/authorize')
    return 'cli'
  if (action === 'like-skill' || action === 'watch-skill' || action === 'watch-collection')
    return action
  return returnTo ? 'return-page' : 'direct'
}

export function signupEmailChoice(weekly: boolean, monthly: boolean): 'none' | 'weekly' | 'monthly' | 'both' {
  return weekly ? (monthly ? 'both' : 'weekly') : (monthly ? 'monthly' : 'none')
}

/** Double 1 remains command copies; double 2 remains demo events. */
export function signupDataPoint(event: SignupEvent): AnalyticsDataPoint {
  return {
    blobs: [event.stage, '', 'signup', event.entry, '', event.outcome, 'choice' in event ? event.choice : ''],
    doubles: [0, 0, 1],
    indexes: [`signup:${event.stage}`],
  }
}
