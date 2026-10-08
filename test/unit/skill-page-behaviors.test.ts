import { describe, expect, it } from 'vitest'
import { skillPageBehaviors } from '../../layers/registry/server/utils/skill-behaviors'

const source = { owner: 'acme', repo: 'skills', branch: 'main', skillPath: 'skills/setup/SKILL.md' }

describe('skillPageBehaviors', () => {
  it('links each SKILL.md match to its line and each file name match to its file', () => {
    const behaviors = skillPageBehaviors({
      raw: '---\nname: setup\ndescription: Set up.\n---\n\n```sh\nsudo apt-get install jq\n```\n',
      assetPaths: ['scripts/install.sh', 'references/api.md'],
      source,
    })

    expect(behaviors?.map(behavior => [behavior.id, behavior.tier, behavior.locations])).toEqual([
      ['privilege', 'ask', [{ path: 'SKILL.md', line: 7, url: 'https://github.com/acme/skills/blob/main/skills/setup/SKILL.md?plain=1#L7' }]],
      ['shell', 'show', [{ path: 'SKILL.md', line: 6, url: 'https://github.com/acme/skills/blob/main/skills/setup/SKILL.md?plain=1#L6' }]],
      ['scripts', 'show', [{ path: 'scripts/install.sh', line: null, url: 'https://github.com/acme/skills/blob/main/skills/setup/scripts/install.sh' }]],
      ['packages', 'show', [{ path: 'SKILL.md', line: 7, url: 'https://github.com/acme/skills/blob/main/skills/setup/SKILL.md?plain=1#L7' }]],
    ])
  })

  it('links a Skill at the Repository root without a directory prefix', () => {
    const result = skillPageBehaviors({
      raw: null,
      assetPaths: ['run.py'],
      source: { ...source, skillPath: 'SKILL.md' },
    })

    expect(result?.[0]?.locations[0]?.url).toBe('https://github.com/acme/skills/blob/main/run.py')
  })

  it('leaves locations unlinked when the SKILL.md path is unknown', () => {
    const [scripts] = skillPageBehaviors({ raw: null, assetPaths: ['run.py'], source: { ...source, skillPath: null } })

    expect(scripts?.locations[0]?.url).toBeNull()
  })

  // 2026-10-05: the bundled rules failed their own parse, and every Skill page answered 503.
  it('reports unavailable, and keeps the page up, when the rules fail', () => {
    const failing = () => {
      throw new Error('patterns are lowercase')
    }

    expect(skillPageBehaviors({ raw: '---\nname: setup\n---\n', assetPaths: ['run.py'], source }, failing)).toBeNull()
  })
})
