import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { createJevHttpClient } from '@harlan-zw/jev'
import { getPlatformProxy } from 'wrangler'
import { z } from 'zod'
import { classifyRepositoryPurpose, repositoryPurposeEvidenceSchema, repositoryPurposeQuestions } from '../layers/registry/server/utils/repository-purpose'

const [input, output] = process.argv.slice(2)
if (!input || !output)
  throw new Error('Pass input and output paths.')
const cases = z.array(z.object({
  name: z.string(),
  expected: z.enum(['skill-pack', 'software', 'directory', 'mirror', 'uncertain']),
  evidence: repositoryPurposeEvidenceSchema,
})).parse(JSON.parse(readFileSync(input, 'utf8')))
const binding = process.argv.includes('--binding')
  ? await getPlatformProxy<Cloudflare.Env>({ configPath: 'wrangler.jsonc', persist: false, envFiles: [], remoteBindings: true })
  : null
const client = process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
  ? createJevHttpClient({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_API_TOKEN, timeoutMs: 60_000 })
  : null
if (!binding && !client)
  throw new Error('Set Cloudflare account and token variables, or pass --binding.')
const results = []
try {
  for (const entry of cases) {
    const startedAt = Date.now()
    const result = await classifyRepositoryPurpose(entry.evidence, async (state) => {
      if (binding)
        return binding.env.AI.run('typesafe/jev', { state, questions: repositoryPurposeQuestions })
      if (!client)
        throw new Error('Jev client is missing.')
      const response = await client.systemOne({ state, questions: repositoryPurposeQuestions })
      if (response._tag === 'Err')
        throw new Error(`Jev failed: ${response.failure._tag}${response.failure._tag === 'Http' ? ` ${response.failure.status}: ${response.failure.message}` : ''}`)
      return response.result
    })
    const passed = result._tag === 'classified' && result.purpose === entry.expected
    results.push({ name: entry.name, expected: entry.expected, passed, durationMs: Date.now() - startedAt, result })
    writeFileSync(output, JSON.stringify(results, null, 2))
    console.log(JSON.stringify({ name: entry.name, passed, actual: result._tag === 'classified' ? result.purpose : result.reason }))
  }
}
finally {
  await binding?.dispose()
}
if (results.some(result => !result.passed))
  process.exitCode = 1
