// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { listedCommands } from '../../scripts/generate-cli-docs'

const root = `Search, run, install, and keep Skills current

Usage: skilld [OPTIONS] <COMMAND>

Commands:
  search      Search for Skills
  like        Like a Skill. skilld.dev also watches its Repository for your digest
  collection  Create a collection, or add and remove its Skills
  help        Print this message or the help of the given subcommand(s)

Options:
      --json     Output stable JSON for Agents and automation
  -h, --help     Print help`

describe('listedCommands', () => {
  it('reads every subcommand and its summary, without clap help', () => {
    expect(listedCommands(root)).toEqual([
      { name: 'search', summary: 'Search for Skills' },
      { name: 'like', summary: 'Like a Skill. skilld.dev also watches its Repository for your digest' },
      { name: 'collection', summary: 'Create a collection, or add and remove its Skills' },
    ])
  })

  it('finds no subcommands in a leaf command', () => {
    expect(listedCommands('Usage: skilld changes [OPTIONS]\n\nOptions:\n      --since <DATE>  Start')).toEqual([])
  })
})
