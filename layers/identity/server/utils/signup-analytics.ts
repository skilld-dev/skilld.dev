import type { H3Event } from 'h3'
import type { SignupEvent } from '#shared/signup-analytics'
import { signupDataPoint } from '#shared/signup-analytics'

export function recordSignupEvent(
  dataset: Pick<AnalyticsEngineDataset, 'writeDataPoint'> | undefined,
  point: SignupEvent,
  onFailure: (cause: unknown) => void,
): void {
  // Analytics failure must never change sign-in or an account mutation.
  try {
    if (!dataset)
      throw new Error('Signup analytics binding missing')
    dataset.writeDataPoint(signupDataPoint(point))
  }
  catch (cause) {
    onFailure(cause)
  }
}

export function emitSignupEvent(event: H3Event, point: SignupEvent): void {
  recordSignupEvent(event.context.platform?.env?.SKILLD_WEB_ANALYTICS, point, () => {
    console.warn('[signup-analytics] Could not record signup event')
  })
}
