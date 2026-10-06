// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ogEvenLines } from '../../app/utils/og-style'

describe('ogEvenLines', () => {
  it('breaks a two line title where the lines come out closest in length', () => {
    expect(ogEvenLines('Design Engineering Essentials', { fontSize: 80, face: 'title', lines: 2 }))
      .toEqual(['Design Engineering', 'Essentials'])
    expect(ogEvenLines('Try any skill before you install it. Your agent can search for its own.', { fontSize: 30, face: 'body', lines: 2 }))
      .toEqual(['Try any skill before you install it.', 'Your agent can search for its own.'])
  })

  it('breaks where the text has a line break', () => {
    expect(ogEvenLines('Agent skills for you\nand your agent', { fontSize: 84, face: 'title', lines: 2 }))
      .toEqual(['Agent skills for you', 'and your agent'])
  })

  it('collapses the line breaks body text brings with it', () => {
    expect(ogEvenLines('Para one about the collection.\r\n\r\nPara two  goes here.', { fontSize: 28, face: 'body', lines: 2 }))
      .toEqual(['Para one about the collection. Para two goes here.'])
  })

  it('leaves text whole when it fits one line', () => {
    expect(ogEvenLines('The skilld CLI', { fontSize: 84, face: 'title', lines: 2 })).toEqual(['The skilld CLI'])
  })

  it('leaves text whole when it needs more lines than the card allows', () => {
    const description = 'The skilld CLI searches, runs, and installs agent skills for Claude Code, Codex, Cursor, and 16 more Agents. One native binary, pinned commits, no telemetry.'

    expect(ogEvenLines(description, { fontSize: 30, face: 'body', lines: 2 })).toEqual([description])
  })

  it('leaves a single word whole, since it has no space to break at', () => {
    const name = 'nuxt-4-minors-migration-guide-for-modules-and-layers'

    expect(ogEvenLines(name, { fontSize: 84, face: 'title', lines: 2 })).toEqual([name])
  })
})
