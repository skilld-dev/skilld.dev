import { describe, expect, it } from 'vitest'
import { readsLinkedFiles } from '../../layers/artifact-delivery/server/utils/request-resolution'

describe('the Skilld-Capabilities request header', () => {
  it.each([
    ['linked-files', true],
    ['Linked-Files', true],
    ['streaming, linked-files', true],
    [' linked-files ,other', true],
    ['linked-file', false],
    ['linked-files-v2', false],
    ['', false],
    [undefined, false],
  ])('reads %j as linked files: %s', (header, expected) => {
    expect(readsLinkedFiles(header)).toBe(expected)
  })
})
