/**
 * Drift detector: every fixture shipped by skilld-protocol must round-trip
 * through its wire schema in this consumer's environment. A breaking schema
 * change in skilld-protocol invalidates a fixture → this test fails before
 * the site deploys anything stale.
 */

import { fixtures } from 'skilld-protocol/test-fixtures'
import {
  AuditEntrySchema,
  ChangeEntrySchema,
  CollectionManifestSchema,
  CollectionSummarySchema,
  DevicePollInputSchema,
  DevicePollResponseSchema,
  DeviceStartInputSchema,
  DeviceStartResponseSchema,
  DigestResponseSchema,
  OauthRefreshInputSchema,
  OauthTokenInputSchema,
  OidcExchangeInputSchema,
  SkillsResolveInputSchema,
  SkillsResolveResponseSchema,
  TokenResponseSchema,
} from 'skilld-protocol/wire'
import { describe, expect, it } from 'vitest'

describe('skilld-protocol fixtures round-trip in site', () => {
  it.each([
    ['audit.entryFail', AuditEntrySchema, fixtures.audit.entryFail],
    ['auth.tokenResponse', TokenResponseSchema, fixtures.auth.tokenResponse],
    ['device.startResponse', DeviceStartResponseSchema, fixtures.device.startResponse],
    ['device.pollAuthorized', DevicePollResponseSchema, fixtures.device.pollAuthorized],
    ['collections.manifest', CollectionManifestSchema, fixtures.collections.manifest],
    ['collections.summary', CollectionSummarySchema, fixtures.collections.summary],
    ['collections.change', ChangeEntrySchema, fixtures.collections.change],
    ['collections.digestResponse', DigestResponseSchema, fixtures.collections.digestResponse],
    ['auth.oauthTokenInput', OauthTokenInputSchema, fixtures.auth.oauthTokenInput],
    ['auth.oauthRefreshInput', OauthRefreshInputSchema, fixtures.auth.oauthRefreshInput],
    ['auth.oidcExchangeInput', OidcExchangeInputSchema, fixtures.auth.oidcExchangeInput],
    ['device.startInput', DeviceStartInputSchema, fixtures.device.startInput],
    ['device.pollInput', DevicePollInputSchema, fixtures.device.pollInput],
    ['skills.resolveInput', SkillsResolveInputSchema, fixtures.skills.resolveInput],
    ['skills.resolveResponse', SkillsResolveResponseSchema, fixtures.skills.resolveResponse],
  ] as const)('%s parses cleanly', (_name, schema, value) => {
    const result = schema.safeParse(value)
    if (!result.success)
      throw new Error(JSON.stringify(result.error.format(), null, 2))
    expect(result.success).toBe(true)
  })
})
