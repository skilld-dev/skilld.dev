import { describe, expect, it } from 'vitest'
import { isAdminUser, isValidAdminAuthorization } from './admin'

describe('isValidAdminAuthorization', () => {
  it('accepts only the matching bearer token', async () => {
    await expect(isValidAdminAuthorization('Bearer correct-secret', 'correct-secret')).resolves.toBe(true)
    await expect(isValidAdminAuthorization('Bearer wrong-secret', 'correct-secret')).resolves.toBe(false)
    await expect(isValidAdminAuthorization('Basic correct-secret', 'correct-secret')).resolves.toBe(false)
  })
})

describe('isAdminUser', () => {
  it('accepts the admin login even without an email', () => {
    expect(isAdminUser({ email: null, login: 'harlan-zw' })).toBe(true)
    expect(isAdminUser({ email: 'someone@example.com', login: 'harlan-zw' })).toBe(true)
  })

  it('accepts the admin email on any login', () => {
    expect(isAdminUser({ email: 'harlan@harlanzw.com', login: 'renamed-login' })).toBe(true)
  })

  it('rejects everyone else', () => {
    expect(isAdminUser({ email: null, login: 'someone-else' })).toBe(false)
    expect(isAdminUser({ email: 'someone@example.com', login: 'someone-else' })).toBe(false)
  })
})
