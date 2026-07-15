import { describe, expect, it } from 'vitest'
import { isValidAdminAuthorization } from './admin'

describe('isValidAdminAuthorization', () => {
  it('accepts only the matching bearer token', async () => {
    await expect(isValidAdminAuthorization('Bearer correct-secret', 'correct-secret')).resolves.toBe(true)
    await expect(isValidAdminAuthorization('Bearer wrong-secret', 'correct-secret')).resolves.toBe(false)
    await expect(isValidAdminAuthorization('Basic correct-secret', 'correct-secret')).resolves.toBe(false)
  })
})
