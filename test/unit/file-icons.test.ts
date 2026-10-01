import { describe, expect, it } from 'vitest'
import { fileIconSvg } from '../../shared/file-icons'

const collection = {
  prefix: 'vscode-icons',
  width: 32,
  height: 32,
  icons: {
    'default-file': { body: '<path d="M1 1h4"/>' },
    'file-type-go': { body: '<path d="M2 2h4"/>', width: 254.5, height: 225 },
    'file-type-gnu': { body: '<path d="M3 3h4"/>' },
  },
  aliases: {
    'file-type-makefile': { parent: 'file-type-gnu' },
    'file-type-mirrored': { parent: 'file-type-gnu', hFlip: true },
  },
}

describe('fileIconSvg', () => {
  it('wraps an icon body in an SVG sized by the collection', () => {
    expect(fileIconSvg(collection, 'default-file')).toEqual({
      _tag: 'Ok',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><path d="M1 1h4"/></svg>',
    })
  })

  it('keeps an icon\'s own size', () => {
    expect(fileIconSvg(collection, 'file-type-go')).toMatchObject({ _tag: 'Ok', svg: expect.stringContaining('viewBox="0 0 254.5 225"') })
  })

  it('resolves a plain alias to its parent', () => {
    expect(fileIconSvg(collection, 'file-type-makefile')).toMatchObject({ _tag: 'Ok', svg: expect.stringContaining('<path d="M3 3h4"/>') })
  })

  it('refuses an alias that transforms its parent rather than draw it wrong', () => {
    expect(fileIconSvg(collection, 'file-type-mirrored')).toMatchObject({ _tag: 'Err' })
  })

  it('refuses a name the collection does not have', () => {
    expect(fileIconSvg(collection, 'file-type-nope')).toMatchObject({ _tag: 'Err' })
  })
})
