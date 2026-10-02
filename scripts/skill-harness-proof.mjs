import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { setTimeout } from 'node:timers/promises'

async function main() {
  const [endpoint, spec, skillDir, resultPath] = process.argv.slice(2)
  if (!endpoint || !spec || !skillDir || !resultPath || !process.env.SKILL_HARNESS_PROOF_TOKEN)
    throw new Error('Pass endpoint, exact package version, Skill directory, output path, and SKILL_HARNESS_PROOF_TOKEN.')
  const entries = await readdir(skillDir, { recursive: true, withFileTypes: true })
  const currentSkill = await Promise.all(entries.filter(entry => entry.isFile()).map(async (entry) => {
    const path = join(entry.parentPath, entry.name)
    return { path: relative(skillDir, path), content: await readFile(path, 'utf8') }
  }))
  const headers = { 'authorization': `Bearer ${process.env.SKILL_HARNESS_PROOF_TOKEN}`, 'content-type': 'application/json' }
  const started = await fetch(new URL('/proofs', endpoint), {
    method: 'POST',
    headers,
    body: JSON.stringify({ spec, name: skillDir.split('/').filter(Boolean).at(-1), currentSkill }),
  })
  if (!started.ok)
    throw new Error(`Proof start returned ${started.status}: ${await started.text()}`)
  const { id } = await started.json()
  console.log(`Proof ${id} started.`)
  const deadline = Date.now() + 12 * 60 * 1000
  while (Date.now() < deadline) {
    const response = await fetch(new URL(`/proofs/${id}`, endpoint), { headers })
    if (!response.ok)
      throw new Error(`Proof status returned ${response.status}.`)
    const state = await response.json()
    if (state._tag === 'Finished') {
      await mkdir(dirname(resultPath), { recursive: true })
      await writeFile(resultPath, JSON.stringify({ id, spec, state }, null, 2))
      console.log(`${state.result._tag}, ${state.modelCalls} model calls, ${Math.round(state.result.elapsedMs / 1000)} seconds. ${resultPath}`)
      if (state.result._tag === 'Err')
        throw new Error(`${state.result.code}: ${state.result.detail}`)
      return
    }
    console.log(`Running, ${state.modelCalls} model calls.`)
    await setTimeout(10_000)
  }
  throw new Error('The proof status exceeded its deadline.')
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : String(cause))
  process.exitCode = 1
})
