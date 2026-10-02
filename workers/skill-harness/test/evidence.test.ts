import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSourceEvidence } from '../runner/evidence'

describe('source evidence', () => {
  it('bundles exact package types and implementation, with paths for further checks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-evidence-'))
    try {
      await mkdir(join(root, 'dist'))
      await writeFile(join(root, 'package.json'), '{"name":"package","version":"1.2.3"}')
      await writeFile(join(root, 'dist/index.d.ts'), 'export const option: boolean')
      await writeFile(join(root, 'dist/index.js'), 'export const option = true')
      await writeFile(join(root, 'dist/index.js.map'), 'excluded map')
      await symlink('/etc/passwd', join(root, 'dist/unsafe.js'))
      const evidence = await createSourceEvidence(root, 2000)
      expect(evidence).toContain('"version":"1.2.3"')
      expect(evidence).toContain('dist/index.d.ts')
      expect(evidence).toContain('export const option = true')
      expect(evidence).not.toContain('excluded map')
      expect(evidence).not.toContain('root:')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps the bundle bounded and identifies omitted evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-evidence-'))
    try {
      await writeFile(join(root, 'package.json'), '{"name":"package"}')
      await writeFile(join(root, 'large.js'), 'x'.repeat(2000))
      const evidence = await createSourceEvidence(root, 500)
      expect(Buffer.byteLength(evidence)).toBeLessThanOrEqual(500)
      expect(evidence).toContain('"name":"package"')
      expect(evidence).toContain('Omitted files')
      expect(evidence).toContain('large.js')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
