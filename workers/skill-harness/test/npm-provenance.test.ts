import { expect, it } from 'vitest'
import { matchesNpmProvenance } from '../src/npm-provenance'

const source = { owner: 'harlan-zw', name: 'package', tag: 'v1.0.0', targetSha: 'a'.repeat(40), packageName: 'package', version: '1.0.0', integrity: `sha512-${btoa(String.fromCharCode(...new Uint8Array(64)))}` }
const statement = {
  predicateType: 'https://slsa.dev/provenance/v1',
  subject: [{ name: 'pkg:npm/package@1.0.0', digest: { sha512: '0'.repeat(128) } }],
  predicate: { buildDefinition: { externalParameters: { workflow: { repository: 'https://github.com/harlan-zw/package', ref: 'refs/tags/v1.0.0' } }, resolvedDependencies: [{ uri: 'git+https://github.com/harlan-zw/package@refs/tags/v1.0.0', digest: { gitCommit: 'a'.repeat(40) } }] } },
}
function bundle(value: unknown) {
  return { attestations: [{ bundle: { dsseEnvelope: { payload: btoa(JSON.stringify(value)) } } }] }
}

it('matches the registry record to the exact package digest, repository, tag, and commit', () => {
  expect(matchesNpmProvenance(bundle(statement), source)).toBe(true)
})
it.each([
  { ...source, targetSha: 'b'.repeat(40) },
  { ...source, owner: 'another-owner' },
  { ...source, version: '2.0.0' },
  { ...source, tag: 'v2.0.0' },
  { ...source, integrity: `sha512-${btoa(String.fromCharCode(...new Uint8Array(64).fill(1)))}` },
])('rejects a different source or package artifact', (expected) => {
  expect(matchesNpmProvenance(bundle(statement), expected)).toBe(false)
})
it.each(['invalid', 'a', '====', '%%%'])('rejects malformed provenance data %s', (payload) => {
  expect(matchesNpmProvenance({ attestations: [{ bundle: { dsseEnvelope: { payload } } }] }, source)).toBe(false)
})
