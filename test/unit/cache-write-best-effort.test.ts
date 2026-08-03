import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { writeCache } from '../../shared/server/cache'

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory)
  return entries.flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory())
      return sourceFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

describe('best-effort cache writes', () => {
  it('resolves when the KV write is rate limited', async () => {
    const setItem = vi.fn(async () => {
      throw new Error('KV PUT failed: 429 Too Many Requests')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(writeCache(
      { setItem } as unknown as Parameters<typeof writeCache>[0],
      'skills:duplicate-candidates:all:noagg',
      [{ owner: 'garrytan' }],
      { ttl: 300 },
    )).resolves.toBeUndefined()

    expect(setItem).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.join(' ')).toContain('skills:duplicate-candidates:all:noagg')
    warn.mockRestore()
  })

  it('passes the value and options through on success', async () => {
    const setItem = vi.fn(async () => {})

    await writeCache(
      { setItem } as unknown as Parameters<typeof writeCache>[0],
      'skills:endorsement-map',
      { a: 1 },
      { ttl: 300 },
    )

    expect(setItem).toHaveBeenCalledWith('skills:endorsement-map', { a: 1 }, { ttl: 300 })
  })

  it('routes every server cache write through the helper', () => {
    const roots = ['layers', 'server'].map(root => join(process.cwd(), root))
    const offenders = roots
      .flatMap(root => sourceFiles(root))
      .filter(path => path.includes(`${'server'}/`))
      .flatMap((path) => {
        const lines = readFileSync(path, 'utf8').split('\n')
        return lines.flatMap((line, index) =>
          /useStorage\(['"]cache['"]\)\.setItem\(/.test(line)
            ? [`${path.replace(`${process.cwd()}/`, '')}:${index + 1}`]
            : [],
        )
      })

    expect(offenders).toEqual([])
  })
})
