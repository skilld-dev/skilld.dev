import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SCHEDULE_POLICY } from '../shared/schedule-policy'
import {
  calculateScheduleParity,
  loadCloudflareSchedules,
  parseScheduleParityArgs,
} from './lib/schedule-parity'
import {
  discoverScheduledTasks,
  parseGeneratedCrons,
  parseScheduledTasksDocument,
} from './lib/scheduled-task-source'

const root = resolve(import.meta.dirname, '..')
const mode = parseScheduleParityArgs(process.argv.slice(2))
if (mode._tag === 'invalid')
  throw new Error(mode.reason)

const tasks = discoverScheduledTasks(root)
const expected = [...new Set(tasks.map(task => task.cron))].sort()
const generated = parseGeneratedCrons(
  readFileSync(resolve(root, '.nuxt/cf-jobs/crons.suggested.toml'), 'utf8'),
)
const documented = parseScheduledTasksDocument(readFileSync(resolve(root, 'CRON.md'), 'utf8'), root)
const policy = SCHEDULE_POLICY.filter(entry => entry._tag === 'observed')
  .map(entry => ({ name: entry.taskName, cron: entry.cron }))
  .sort((left, right) => left.name.localeCompare(right.name))
const sourceShape = tasks.map(task => ({ name: task.name, cron: task.cron }))

if (JSON.stringify(sourceShape) !== JSON.stringify(policy))
  throw new Error('Schedule policy does not match scheduled task declarations.')
if (JSON.stringify(tasks) !== JSON.stringify(documented))
  throw new Error('CRON.md does not match scheduled task declarations.')
if (calculateScheduleParity(expected, generated)._tag === 'drift')
  throw new Error('Generated nuxt-cf-jobs triggers do not match scheduled task declarations.')

if (mode._tag === 'local_check') {
  console.log(JSON.stringify({ _tag: 'aligned', tasks: tasks.length, uniqueCrons: expected.length }, null, 2))
}
else {
  const config = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8')) as {
    account_id?: unknown
    name?: unknown
  }
  const deployed = await loadCloudflareSchedules({
    accountId: typeof config.account_id === 'string' ? config.account_id : null,
    scriptName: typeof config.name === 'string' ? config.name : '',
    token: process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN ?? null,
  })
  if (deployed._tag === 'unavailable')
    throw new Error(deployed.diagnostic)
  const parity = calculateScheduleParity(expected, deployed.crons)
  console.log(JSON.stringify(parity, null, 2))
  if (parity._tag === 'drift')
    process.exitCode = 1
}
