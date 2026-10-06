import type { ResolvedSource } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactSourceFile } from '../../layers/artifact-delivery/server/utils/github-source'
import { describe, expect, it } from 'vitest'
import {
  checkArtifactSource,
  checksBlockArtifact,
  checksPermitSigning,
} from '../../layers/artifact-delivery/server/utils/checks'

describe('agent Skills specification check', () => {
  it('lets a Skill run when its frontmatter name differs from its folder', async () => {
    // leonxlnx/taste-skill: folder `taste-skill`, frontmatter `design-taste-frontend`.
    const checked = await check('skills/taste-skill', skillFile('---\nname: design-taste-frontend\ndescription: Anti-slop frontend design.\n---\n'))

    expect(checksBlockArtifact(checked.checkResults)).toBe(false)
    expect(checksPermitSigning(checked.checkResults)).toBe(true)
    expect(specResult(checked.checkResults)).toMatchObject({
      outcome: 'warn',
      required: false,
      findings: ['The frontmatter name `design-taste-frontend` does not match the folder `taste-skill`.'],
    })
  })

  it('lets a Skill run when its description is over the specification limit', async () => {
    // jakubantalik/transitions.dev: a description longer than 1,024 characters.
    const description = 'x'.repeat(1_342)
    const checked = await check('skills/transitions-dev', skillFile(`---\nname: transitions-dev\ndescription: ${description}\n---\n`))

    expect(checksPermitSigning(checked.checkResults)).toBe(true)
    expect(specResult(checked.checkResults)).toMatchObject({
      outcome: 'warn',
      findings: ['The description has 1,342 characters. The limit is 1,024.'],
    })
  })

  it('reads a folded block description to its full length', async () => {
    // unclecatvn/agent-skills/flow-diagram writes its description as `>` block lines.
    const line = 'y'.repeat(99)
    const block = Array.from({ length: 11 }).fill(`  ${line}`).join('\n')
    const checked = await check('skills/flow-diagram', skillFile(`---\nname: flow-diagram\ndescription: >-\n${block}\n---\n`))

    expect(specResult(checked.checkResults)).toMatchObject({
      outcome: 'warn',
      findings: ['The description has 1,099 characters. The limit is 1,024.'],
    })
  })

  it('lets a Skill run when its frontmatter has no name', async () => {
    const checked = await check('skills/demo', skillFile('---\ndescription: Use this Skill for demo work.\n---\n'))

    expect(checksPermitSigning(checked.checkResults)).toBe(true)
    expect(specResult(checked.checkResults)).toMatchObject({
      outcome: 'warn',
      findings: ['The frontmatter has no name.'],
    })
  })

  it('passes a Skill that matches the specification', async () => {
    const checked = await check('skills/demo', skillFile('---\r\nname: demo\r\ndescription: Use this Skill for demo work.\r\n---\r\n'))

    expect(specResult(checked.checkResults)).toMatchObject({ outcome: 'pass', required: false })
  })
})

async function check(skillPath: string, file: ArtifactSourceFile) {
  return await checkArtifactSource(source(skillPath), [file])
}

function specResult(results: Awaited<ReturnType<typeof checkArtifactSource>>['checkResults']) {
  return results.find(result => result.name === 'agent-skills-spec')
}

function skillFile(text: string): ArtifactSourceFile {
  return { path: 'SKILL.md', mode: 420, bytes: new TextEncoder().encode(text), gitBlobSha: 'a'.repeat(40) }
}

function source(skillPath: string): ResolvedSource {
  return {
    provider: 'github',
    repositoryId: 1,
    owner: 'acme',
    repository: 'skills',
    visibility: 'public',
    commitSha: '0'.repeat(40),
    treeSha: '1'.repeat(40),
    skillPath,
  }
}
