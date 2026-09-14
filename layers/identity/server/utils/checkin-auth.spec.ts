import { describe, expect, it } from 'vitest'
import { isValidCheckinAuthorization } from './checkin-auth'

describe('isValidCheckinAuthorization', () => {
  it('accepts only the matching bearer token', () => {
    expect(isValidCheckinAuthorization('Bearer checkin-secret', 'checkin-secret')).toBe(true)
  })

  it('rejects wrong, missing, and malformed tokens before any collection', () => {
    expect(isValidCheckinAuthorization('Bearer wrong-secret', 'checkin-secret')).toBe(false)
    expect(isValidCheckinAuthorization(undefined, 'checkin-secret')).toBe(false)
    expect(isValidCheckinAuthorization('checkin-secret', 'checkin-secret')).toBe(false)
    expect(isValidCheckinAuthorization('Basic checkin-secret', 'checkin-secret')).toBe(false)
  })

  it('rejects every token when the configured secret is unset', () => {
    expect(isValidCheckinAuthorization('Bearer checkin-secret', '')).toBe(false)
    expect(isValidCheckinAuthorization('Bearer checkin-secret', undefined)).toBe(false)
  })
})
