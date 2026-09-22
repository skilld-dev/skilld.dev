import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { extractSkillFilesFromTarball } from '../../layers/artifact-delivery/server/utils/tarball-source'
import { streamOf, tarGzFixture } from '../fixtures/tar-archive'

const topLevel = 'skilld-dev-skills-457fed3'
const skillText = '---\nname: demo\ndescription: Use this Skill for demo work.\n---\n'
const scriptText = '#!/usr/bin/env bash\necho demo\n'
const encoder = new TextEncoder()

describe('tarball Skill extraction', () => {
  it('keeps only the Skill directory and strips the top level directory', async () => {
    const archive = tarGzFixture(topLevel, [
      { path: 'README.md', bytes: encoder.encode('# unrelated\n') },
      { path: 'skills/other/SKILL.md', bytes: encoder.encode('other\n') },
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText) },
      { path: 'skills/demo/references/guide.md', bytes: encoder.encode('guide\n') },
    ])

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: 'skills/demo',
      entries: [
        wanted('SKILL.md', skillText),
        wanted('references/guide.md', 'guide\n'),
      ],
      maxUncompressedBytes: 1024 * 1024,
    })

    expect(result._tag).toBe('extracted')
    if (result._tag !== 'extracted')
      return
    expect(result.files.map(file => file.path)).toEqual(['SKILL.md', 'references/guide.md'])
    expect(new TextDecoder().decode(result.files[0]!.bytes)).toBe(skillText)
  })

  it('reads a Skill at the Repository root', async () => {
    const archive = tarGzFixture(topLevel, [
      { path: 'SKILL.md', bytes: encoder.encode(skillText) },
    ])

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: '.',
      entries: [wanted('SKILL.md', skillText)],
      maxUncompressedBytes: 1024 * 1024,
    })

    expect(result).toMatchObject({ _tag: 'extracted' })
    if (result._tag !== 'extracted')
      return
    expect(result.files.map(file => file.path)).toEqual(['SKILL.md'])
  })

  it('takes the file mode from the tree entry, not the widened tar header', async () => {
    const archive = tarGzFixture(topLevel, [
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText), mode: '0000664' },
      { path: 'skills/demo/run.sh', bytes: encoder.encode(scriptText), mode: '0000775' },
    ])

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: 'skills/demo',
      entries: [
        wanted('SKILL.md', skillText),
        { ...wanted('run.sh', scriptText), mode: 493 as const },
      ],
      maxUncompressedBytes: 1024 * 1024,
    })

    expect(result._tag).toBe('extracted')
    if (result._tag !== 'extracted')
      return
    expect(result.files.map(file => [file.path, file.mode])).toEqual([
      ['SKILL.md', 420],
      ['run.sh', 493],
    ])
  })

  it('refuses an archive missing a file the tree lists, as export-ignore produces', async () => {
    const archive = tarGzFixture(topLevel, [
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText) },
    ])

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: 'skills/demo',
      entries: [
        wanted('SKILL.md', skillText),
        wanted('tests/case.md', 'case\n'),
      ],
      maxUncompressedBytes: 1024 * 1024,
    })

    expect(result).toMatchObject({
      _tag: 'unusable',
      reason: 'missing-files',
      findings: ['tests/case.md'],
    })
  })

  it('refuses a file whose bytes do not match its Git blob digest', async () => {
    const archive = tarGzFixture(topLevel, [
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText) },
      { path: 'skills/demo/notes.md', bytes: encoder.encode('tampered bytes for notes\n') },
    ])

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: 'skills/demo',
      entries: [
        wanted('SKILL.md', skillText),
        wanted('notes.md', 'original bytes of notes!\n'),
      ],
      maxUncompressedBytes: 1024 * 1024,
    })

    expect(result).toMatchObject({
      _tag: 'unusable',
      reason: 'digest-mismatch',
      findings: ['notes.md'],
    })
  })

  it('refuses a file whose size does not match its tree entry', async () => {
    const archive = tarGzFixture(topLevel, [
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText) },
    ])

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: 'skills/demo',
      entries: [{ ...wanted('SKILL.md', skillText), size: skillText.length + 10 }],
      maxUncompressedBytes: 1024 * 1024,
    })

    expect(result).toMatchObject({ _tag: 'unusable', reason: 'size-mismatch' })
  })

  it('ignores directory and symbolic link entries inside the Skill path', async () => {
    const archive = tarGzFixture(topLevel, [
      { path: 'skills/demo/', typeflag: '5' },
      { path: 'skills/demo/link.md', typeflag: '2', linkname: '../../README.md', mode: '0000777' },
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText) },
    ])

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: 'skills/demo',
      entries: [wanted('SKILL.md', skillText)],
      maxUncompressedBytes: 1024 * 1024,
    })

    expect(result._tag).toBe('extracted')
    if (result._tag !== 'extracted')
      return
    expect(result.files.map(file => file.path)).toEqual(['SKILL.md'])
  })

  it('refuses an archive that repeats a Skill path', async () => {
    const archive = tarGzFixture(topLevel, [
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText) },
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText) },
    ])

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: 'skills/demo',
      entries: [wanted('SKILL.md', skillText)],
      maxUncompressedBytes: 1024 * 1024,
    })

    expect(result).toMatchObject({ _tag: 'unusable', reason: 'duplicate-path' })
  })

  it('refuses an archive that passes the uncompressed byte ceiling', async () => {
    // Incompressible filler, so the ceiling is reached on bytes rather than on
    // a gzip ratio. The ceiling stops the download too: measured in workerd on
    // 2026-09-22, a 1.5 GiB archive stopped after 64 MiB, 2.9 s and 390 ms of
    // CPU, against 92.9 s to stream it whole.
    const archive = tarGzFixture(topLevel, [
      { path: 'other/big.bin', bytes: noise(256 * 1024) },
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText) },
    ])

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: 'skills/demo',
      entries: [wanted('SKILL.md', skillText)],
      maxUncompressedBytes: 80 * 1024,
    })

    expect(result).toEqual({ _tag: 'unusable', reason: 'archive-too-large', findings: [] })
  })

  it('refuses an archive whose gzip bytes are corrupt', async () => {
    const archive = tarGzFixture(topLevel, [
      { path: 'skills/demo/SKILL.md', bytes: encoder.encode(skillText) },
    ])
    archive.set([0, 0, 0, 0], 12)

    const result = await extractSkillFilesFromTarball({
      body: streamOf(archive),
      skillPath: 'skills/demo',
      entries: [wanted('SKILL.md', skillText)],
      maxUncompressedBytes: 1024 * 1024,
    })

    expect(result).toMatchObject({ _tag: 'unusable', reason: 'malformed-archive' })
  })
})

function noise(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  let state = 0x2545F491
  for (let index = 0; index < size; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0
    bytes[index] = (state >>> 24) & 0xFF
  }
  return bytes
}

function wanted(path: string, text: string) {
  return {
    path,
    gitBlobSha: gitBlobSha(text),
    size: encoder.encode(text).byteLength,
    mode: 420 as const,
  }
}

function gitBlobSha(value: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0${value}`).digest('hex')
}
