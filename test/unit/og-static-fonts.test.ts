import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syncOgStaticFonts } from '../../modules/og-static-fonts/sync'

function fixture(files: { server: Record<string, string>, cache: string[], public: string[] }) {
  const root = mkdtempSync(join(tmpdir(), 'og-static-fonts-'))
  const dirs = { serverDir: join(root, 'server'), cacheDir: join(root, 'cache'), publicDir: join(root, 'public') }
  for (const dir of Object.values(dirs))
    mkdirSync(dir, { recursive: true })
  mkdirSync(join(dirs.publicDir, '_og-static-fonts'), { recursive: true })
  for (const [name, code] of Object.entries(files.server))
    writeFileSync(join(dirs.serverDir, name), code)
  for (const name of files.cache)
    writeFileSync(join(dirs.cacheDir, name), 'font')
  for (const name of files.public)
    writeFileSync(join(dirs.publicDir, '_og-static-fonts', name), 'font')
  return dirs
}

const BUNDLE = 'const f=[{family:"Plus Jakarta Sans",src:"/_og-static-fonts/Plus_Jakarta_Sans-400-normal.ttf"},{family:"Inter",src:"/_og-static-fonts/inter-400-latin.ttf"}]'
const INTER_ONLY = 'const f=[{family:"Inter",src:"/_og-static-fonts/inter-400-latin.ttf"}];const css=\'font-family:"IBM Plex Mono"\''

describe('syncOgStaticFonts', () => {
  it('copies fonts downloaded after the public asset copy into the output', () => {
    const dirs = fixture({
      server: { 'index.mjs': BUNDLE },
      cache: ['Plus_Jakarta_Sans-400-normal.ttf'],
      public: ['inter-400-latin.ttf'],
    })

    expect(syncOgStaticFonts({ ...dirs, families: ['Plus Jakarta Sans'] })).toEqual({ _tag: 'Ok', referenced: 2 })
    expect(readdirSync(join(dirs.publicDir, '_og-static-fonts')).sort())
      .toEqual(['Plus_Jakarta_Sans-400-normal.ttf', 'inter-400-latin.ttf'])
  })

  it('reports every referenced font that no source provides', () => {
    const dirs = fixture({
      server: { 'index.mjs': BUNDLE, 'nested.mjs': '"/_og-static-fonts/IBM_Plex_Mono-500-normal.woff"' },
      cache: [],
      public: ['inter-400-latin.ttf'],
    })

    expect(syncOgStaticFonts({ ...dirs, families: [] })).toEqual({
      _tag: 'Err',
      missingFiles: ['IBM_Plex_Mono-500-normal.woff', 'Plus_Jakarta_Sans-400-normal.ttf'],
      missingFamilies: [],
    })
  })

  it('reports a configured family that the renderer fell back from', () => {
    const dirs = fixture({ server: { 'index.mjs': INTER_ONLY }, cache: [], public: ['inter-400-latin.ttf'] })

    expect(syncOgStaticFonts({ ...dirs, cacheDir: join(dirs.cacheDir, 'absent'), families: ['Plus Jakarta Sans', 'IBM Plex Mono'] })).toEqual({
      _tag: 'Err',
      missingFiles: [],
      missingFamilies: ['IBM Plex Mono', 'Plus Jakarta Sans'],
    })
  })
})
