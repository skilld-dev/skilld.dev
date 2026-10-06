import type { ResolvedSource } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactSourceFile } from '../../layers/artifact-delivery/server/utils/github-source'
import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { checkArtifactSource, checksBlockArtifact, createArtifactCheckScanner } from '../../layers/artifact-delivery/server/utils/checks'

// Keys are generated per run, so the repository never holds key material.
const pkcs8 = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const pkcs1 = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }) as string
const sec1 = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'sec1', format: 'pem' }) as string
const ed25519 = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const legacyEncrypted = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'demo' }) as string

describe('credential material check', () => {
  it.each([
    ['a PKCS#8 key', pkcs8],
    ['a PKCS#1 RSA key', pkcs1],
    ['a SEC1 EC key', sec1],
    ['the shortest PKCS#8 key, Ed25519', ed25519],
    ['a legacy encrypted key with PEM headers', legacyEncrypted],
    ['a key inside a JSON service account file', JSON.stringify({ type: 'service_account', private_key: pkcs8 }, null, 2)],
    ['a key indented in a YAML block', `tls:\n  key: |\n${pkcs8.split('\n').map(line => `    ${line}`).join('\n')}`],
  ])('blocks %s', async (_label, text) => {
    const checked = await check(file('config/credentials.txt', text))

    expect(credentialResult(checked)).toMatchObject({
      outcome: 'fail',
      required: true,
      findings: ['config/credentials.txt contains private key material.'],
    })
    expect(checksBlockArtifact(checked)).toBe(true)
  })

  it('finds a key after a placeholder in the same file', async () => {
    const text = `Never commit \`-----BEGIN PRIVATE KEY-----\`.\n\n${pkcs8}`

    expect(credentialResult(await check(file('SKILL.md', text)))).toMatchObject({ outcome: 'fail' })
  })

  // Each case quotes a Skill the 2026-10-07 sweep blocked. None holds a key.
  it.each([
    ['a memory search pattern', 'frida_memory_search(pid, "-----BEGIN RSA PRIVATE KEY-----")'],
    ['a truncated JSON value', '"key": "-----BEGIN RSA PRIVATE KEY-----\\n..."'],
    ['an ellipsis body', '"key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"'],
    ['a bracketed placeholder body', '-----BEGIN RSA PRIVATE KEY-----\n[Base64 encoded private key]\n-----END RSA PRIVATE KEY-----'],
    ['a test fixture body', '"private_key": "-----BEGIN PRIVATE KEY-----\\nTEST-NOT-A-REAL-KEY\\n-----END PRIVATE KEY-----\\n"'],
    ['a detection table', '| Private Keys | `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN OPENSSH PRIVATE KEY-----` |'],
    ['a shell echo', 'sh \'echo "-----BEGIN RSA PRIVATE KEY-----" > /tmp/key.pem\''],
    ['prose about the format', 'CryptoKit uses PKCS#8 for private keys (`-----BEGIN PRIVATE KEY-----`).'],
    ['a key cut short in documentation', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----'],
  ])('passes %s', async (_label, text) => {
    const checked = await check(file('references/guide.md', text))

    expect(credentialResult(checked)).toMatchObject({ outcome: 'pass', required: true })
    expect(checksBlockArtifact(checked)).toBe(false)
  })
})

describe('credential material check over streamed bytes', () => {
  it.each([1, 7, 1000, 65_536])('finds a key split across %i byte chunks', async (chunkSize) => {
    const text = `${'x'.repeat(40_000)}\n${pkcs8}\n${'y'.repeat(40_000)}`

    expect(credentialResult(streamedCheck(file('config/credentials.txt', text), chunkSize)))
      .toEqual(credentialResult(await check(file('config/credentials.txt', text))))
    expect(credentialResult(streamedCheck(file('config/credentials.txt', text), chunkSize))).toMatchObject({ outcome: 'fail' })
  })

  it('reads a file with invalid UTF-8 after a key as binary, as the whole-file check does', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode(pkcs8), 0xFF, 0xFE])
    const binary: ArtifactSourceFile = { path: 'assets/blob.bin', mode: 420, bytes, gitBlobSha: 'a'.repeat(40) }

    expect(credentialResult(streamedCheck(binary, 512))).toMatchObject({ outcome: 'pass' })
    expect(credentialResult(await check(binary))).toMatchObject({ outcome: 'pass' })
  })
})

describe('omitted files check', () => {
  it('passes when the Artifact holds every file', async () => {
    const checked = (await checkArtifactSource(source(), [file('SKILL.md', '---\nname: demo\n---\n')], [])).checkResults

    expect(omittedResult(checked)).toEqual({ name: 'omitted-files', version: '1', outcome: 'pass', required: false })
  })

  it('lists each omitted file with its size and source, and still lets the Skill run', async () => {
    const url = `https://github.com/acme/skills/blob/${'0'.repeat(40)}/skills/demo/assets/track.mp3`
    const checked = (await checkArtifactSource(source(), [file('SKILL.md', '---\nname: demo\n---\n')], [
      { path: 'assets/track.mp3', bytes: 3_936_384, url },
    ])).checkResults

    expect(omittedResult(checked)).toEqual({
      name: 'omitted-files',
      version: '1',
      outcome: 'warn',
      required: false,
      summary: '1 file over the size limits was left out of the Artifact.',
      findings: [`assets/track.mp3: 3,936,384 bytes, ${url}`],
    })
    expect(checksBlockArtifact(checked)).toBe(false)
  })

  it('keeps every finding inside the limits the skilld CLI verifies', async () => {
    const omitted = Array.from({ length: 150 }, (_, index) => ({
      path: `assets/${'a'.repeat(400)}-${index}.png`,
      bytes: 3_000_000,
      url: `https://github.com/acme/skills/blob/main/assets/${'a'.repeat(400)}-${index}.png`,
    }))
    const result = omittedResult((await checkArtifactSource(source(), [file('SKILL.md', '---\nname: demo\n---\n')], omitted)).checkResults)

    expect(result?.summary).toBe('150 files over the size limits were left out of the Artifact. The first 100 are listed.')
    expect(result?.findings).toHaveLength(100)
    expect(result?.findings?.every(finding => finding.length <= 500)).toBe(true)
  })
})

function omittedResult(results: Awaited<ReturnType<typeof check>>) {
  return results.find(result => result.name === 'omitted-files')
}

async function check(extra: ArtifactSourceFile) {
  const skill = file('SKILL.md', '---\nname: demo\ndescription: Demo.\n---\n')
  const files = extra.path === 'SKILL.md' ? [extra] : [skill, extra]
  return (await checkArtifactSource(source(), files)).checkResults
}

function streamedCheck(extra: ArtifactSourceFile, chunkSize: number) {
  const scanner = createArtifactCheckScanner(source())
  for (const entry of [file('SKILL.md', '---\nname: demo\ndescription: Demo.\n---\n'), extra]) {
    scanner.begin({ path: entry.path, mode: entry.mode, size: entry.bytes.byteLength })
    for (let offset = 0; offset < entry.bytes.byteLength; offset += chunkSize)
      scanner.chunk(entry.bytes.subarray(offset, offset + chunkSize))
    scanner.end()
  }
  return scanner.finish([]).checkResults
}

function credentialResult(results: Awaited<ReturnType<typeof check>>) {
  return results.find(result => result.name === 'credential-material')
}

function file(path: string, text: string): ArtifactSourceFile {
  return { path, mode: 420, bytes: new TextEncoder().encode(text), gitBlobSha: 'a'.repeat(40) }
}

function source(): ResolvedSource {
  return {
    provider: 'github',
    repositoryId: 1,
    owner: 'acme',
    repository: 'skills',
    visibility: 'public',
    commitSha: '0'.repeat(40),
    treeSha: '1'.repeat(40),
    skillPath: 'skills/demo',
  }
}
