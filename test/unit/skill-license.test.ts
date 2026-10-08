import { describe, expect, it, vi } from 'vitest'
import { readRepositoryLicense } from '../../layers/registry/server/utils/skill-license'

const source = { owner: 'heyimjames', repo: 'nikita-bier-consumer-apps', commit: 'c'.repeat(40) }

describe('repository license', () => {
  it('reads a detected license at the exact snapshot commit', async () => {
    const read = vi.fn().mockResolvedValue({ status: 200, data: { license: { spdx_id: 'MIT' } } })
    expect(await readRepositoryLicense(source, {}, read)).toEqual({ _tag: 'known', license: 'MIT' })
    expect(read).toHaveBeenCalledWith(`/repos/heyimjames/nikita-bier-consumer-apps/license?ref=${source.commit}`, {})
  })

  it.each([null, { spdx_id: 'NOASSERTION' }])('keeps undetected terms unknown', async (license) => {
    expect(await readRepositoryLicense(source, {}, vi.fn().mockResolvedValue({ status: 200, data: { license } }))).toEqual({ _tag: 'missing' })
  })

  it.each([503, 403, 0])('does not turn a %s outage into a missing license', async (status) => {
    expect(await readRepositoryLicense(source, {}, vi.fn().mockResolvedValue({ status, data: null }))).toEqual({ _tag: 'unavailable', status })
  })
})
