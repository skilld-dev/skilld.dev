import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { assertWeeklyClaim, buildWeeklySocial, loadWeeklySocial, parseSocialDestination, publishWeeklySocial, socialSkillSchema, verifySocialDestination, weekOf } from './lib/weekly-social'

/** GitHub's artifact service persists the claim before any public send. */
async function weeklyClaims(name: string): Promise<unknown> {
  const repository = z.string().regex(/^[\w.-]+\/[\w.-]+$/).parse(process.env.GITHUB_REPOSITORY)
  const token = z.string().min(1).parse(process.env.GH_TOKEN)
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`, {
    headers: { 'authorization': `Bearer ${token}`, 'accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok)
    throw new Error(`Weekly claim lookup failed: HTTP ${response.status}`)
  return response.json()
}

async function output(values: Record<string, string>) {
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`)
}

async function run() {
  const mode = z.enum(['prepare', 'publish']).parse(process.argv[2] || 'prepare')
  const destinationName = z.enum(['x', 'discord']).parse(process.argv[3] || 'x')
  const now = new Date()
  const directory = join(process.env.RUNNER_TEMP || process.env.SKILLD_SOCIAL_OUTPUT_DIR || '/tmp', `skilld-weekly-${destinationName}`)
  const path = join(directory, 'post.json')
  const publishing = process.env.SKILLD_WEEKLY_PUBLISH === 'true'
  if (publishing && (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main'))
    throw new Error('Publish through the main-branch weekly social workflow')
  if (mode === 'publish') {
    if (!publishing)
      throw new Error('Publishing is disabled')
    const saved = z.object({ week: z.string(), computedAt: z.number(), skills: z.array(socialSkillSchema) }).parse(JSON.parse(await readFile(path, 'utf8')))
    if (saved.week !== weekOf(now) || now.getTime() / 1000 - saved.computedAt > 3600)
      throw new Error('Prepare a fresh weekly post before publishing')
    assertWeeklyClaim(await weeklyClaims(`skilld-weekly-${destinationName}-${saved.week}`), z.string().regex(/^\d+$/).parse(process.env.GITHUB_RUN_ID))
    const result = await publishWeeklySocial(parseSocialDestination(destinationName, process.env), buildWeeklySocial(saved.skills, now))
    console.log(JSON.stringify(result))
    await writeFile(join(directory, 'receipt.json'), `${JSON.stringify(result, null, 2)}\n`)
    return
  }

  const { skills, computedAt } = await loadWeeklySocial({ now })
  const post = buildWeeklySocial(skills, now)
  const claim = `skilld-weekly-${destinationName}-${post.week}`
  await mkdir(directory, { recursive: true })
  await writeFile(path, `${JSON.stringify({ week: post.week, computedAt, skills }, null, 2)}\n`)
  const preview = post._tag === 'empty' ? 'No trending Skills this week.' : JSON.stringify(post[destinationName], null, 2)
  await writeFile(join(directory, 'preview.json'), `${preview}\n`)
  console.log(preview)
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ${destinationName}: ${post.week}\n\n\`\`\`json\n${preview}\n\`\`\`\n`)

  let eligible = post._tag === 'ready' && publishing
  if (eligible && z.object({ total_count: z.number().int().nonnegative() }).parse(await weeklyClaims(claim)).total_count > 0) {
    eligible = false
    console.log('This destination already has a weekly delivery claim. Inspect its previous run before retrying.')
  }
  if (eligible)
    await verifySocialDestination(parseSocialDestination(destinationName, process.env))
  await output({ eligible: String(eligible), claim, directory })
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Weekly social run failed')
  process.exitCode = 1
})
