import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { setTimeout as pause } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { createJevHttpClient } from '@harlan-zw/jev'
import { z } from 'zod'
import { pAll } from '../shared/server/p-all'
import { DESCRIPTION_REVIEW_MODEL, descriptionReviewKey, descriptionReviewQuestions, descriptionReviewSourceSchema, descriptionReviewStatement, parseDescriptionReview } from './lib/description-review'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  'limit': { type: 'string' },
  'concurrency': { type: 'string', default: '8' },
  'max-cost': { type: 'string', default: '2' },
  'requests-per-second': { type: 'string', default: '4' },
} })
const [input, output] = positionals
if (!input || !output)
  throw new Error('Pass the input JSON path and output SQL path.')
const concurrency = z.coerce.number().int().min(1).max(16).parse(values.concurrency)
const requestsPerSecond = z.coerce.number().positive().max(30).parse(values['requests-per-second'])
const accountId = z.string().min(1).parse(process.env.CLOUDFLARE_ACCOUNT_ID)
const apiToken = z.string().min(1).parse(process.env.CLOUDFLARE_API_TOKEN)
const client = createJevHttpClient({ accountId, apiToken, retries: 0, timeoutMs: 30_000 })
const maxCost = z.coerce.number().positive().max(5).parse(values['max-cost'])
const limit = values.limit === undefined ? Infinity : z.coerce.number().int().positive().parse(values.limit)
const sources = z.array(descriptionReviewSourceSchema).parse(JSON.parse(readFileSync(input, 'utf8'))).slice(0, limit)
const journal = `${output}.jsonl`
const completed = new Map<string, { key: string, reviewedAt: string, response: unknown }>()
if (existsSync(journal)) {
  for (const line of readFileSync(journal, 'utf8').split('\n').filter(Boolean)) {
    const record = z.object({ key: z.string(), reviewedAt: z.string(), response: z.unknown() }).parse(JSON.parse(line))
    const parsed = parseDescriptionReview(record.response)
    if (!parsed.success)
      throw new Error(`Invalid cached review: ${record.key}`)
    completed.set(record.key, { ...record, response: parsed.data })
  }
}
const pending = [...new Map(sources.map(row => [descriptionReviewKey(row.description), row])).entries()].filter(([key]) => !completed.has(key))
const sourceKeys = new Map(sources.map(row => [row, descriptionReviewKey(row.description)]))
// UTF-8 bytes are a conservative tokenizer ceiling. Include framing headroom.
const upperCost = pending.reduce((sum, [, row]) => sum + (Buffer.byteLength(JSON.stringify({ state: { description: row.description }, questions: descriptionReviewQuestions })) + 2048) * 0.042 / 1_000_000, 0)
if (upperCost > maxCost)
  throw new Error(`Input cost ceiling $${upperCost.toFixed(3)} exceeds $${maxCost}. Reduce the limit.`)
console.log(JSON.stringify({ sources: sources.length, calls: pending.length, cached: completed.size, inputCostCeilingUSD: upperCost, model: DESCRIPTION_REVIEW_MODEL }))
let done = 0
let failed = 0
const started = Date.now()
let nextRequestAt = started
async function request(description: string) {
  for (let attempt = 0; ; attempt++) {
    const startAt = Math.max(Date.now(), nextRequestAt)
    nextRequestAt = startAt + 1000 / requestsPerSecond
    await pause(startAt - Date.now())
    const result = await client.systemOne({ state: { description }, questions: descriptionReviewQuestions })
    if (result._tag !== 'Err' || result.failure._tag !== 'Http' || result.failure.status !== 429 || attempt === 2)
      return result
    console.error(JSON.stringify({ rateLimited: true, retry: attempt + 1, pauseSeconds: 30 }))
    await pause(30_000)
  }
}
try {
  for (let offset = 0; offset < pending.length; offset += 200) {
    const chunk = pending.slice(offset, offset + 200)
    const results = await pAll(chunk, concurrency, async ([key, row]) => {
      const result = await request(row.description)
      if (result._tag === 'Err')
        throw new Error(`Provider failed: ${result.failure._tag}${result.failure._tag === 'Http' ? ` ${result.failure.status}` : ''}`)
      const parsed = parseDescriptionReview(result.result)
      if (!parsed.success)
        throw new Error(`Invalid provider response: ${key}: ${parsed.error.message}`)
      const record = { key, reviewedAt: new Date().toISOString(), response: parsed.data }
      appendFileSync(journal, `${JSON.stringify(record)}\n`)
      completed.set(key, record)
      if (++done % 100 === 0)
        console.log(JSON.stringify({ done, total: pending.length, elapsedSeconds: (Date.now() - started) / 1000 }))
    })
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        failed++
        const error = result.reason instanceof Error ? result.reason.message : String(result.reason)
        appendFileSync(`${output}.failures.jsonl`, `${JSON.stringify({ key: chunk[index]![0], error, failedAt: new Date().toISOString() })}\n`)
        console.error(JSON.stringify({ failed: chunk[index]![0], error }))
      }
    }
    writeSnapshot()
    if (failed >= 3)
      break
  }
  if (failed)
    process.exitCode = 1
}
finally {
  writeSnapshot()
}
function writeSnapshot() {
  const statements = sources.filter(row => completed.has(sourceKeys.get(row)!)).map((row) => {
    const key = sourceKeys.get(row)!
    const record = completed.get(key)
    if (!record)
      throw new Error(`Missing review: ${key}`)
    const parsed = parseDescriptionReview(record.response)
    if (!parsed.success)
      throw new Error(`Invalid review: ${key}`)
    return descriptionReviewStatement(row, parsed.data, record.reviewedAt)
  })
  writeFileSync(output, `${statements.join('\n')}\n`)
}
const unique = [...new Set(sources.map(row => descriptionReviewKey(row.description)))].filter(key => completed.has(key)).map(key => parseDescriptionReview(completed.get(key)!.response)).filter(result => result.success)
console.log(JSON.stringify({ sources: sources.length, uniqueReviews: unique.length, failed, inputTokens: unique.reduce((sum, result) => sum + result.data.usage.input_tokens, 0), inputCostUSD: unique.reduce((sum, result) => sum + result.data.usage.input_tokens * 0.042 / 1_000_000, 0), elapsedSeconds: (Date.now() - started) / 1000, sql: output }))
