import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  discoverScheduledTasks,
  renderScheduledTasksDocument,
} from './lib/scheduled-task-source'

const projectRoot = resolve(import.meta.dirname, '..')
const target = resolve(projectRoot, 'CRON.md')
const args = process.argv.slice(2)

if (args.length !== 1 || !['--write', '--check'].includes(args[0]!))
  throw new Error('Usage: tsx scripts/generate-cron-docs.ts --write|--check')

const rendered = renderScheduledTasksDocument(projectRoot, discoverScheduledTasks(projectRoot))
if (args[0] === '--write') {
  writeFileSync(target, rendered)
  console.log('Updated CRON.md from scheduled task declarations.')
}
else {
  const current = readFileSync(target, 'utf8')
  if (current !== rendered)
    throw new Error('CRON.md is stale. Run pnpm cron:docs.')
  console.log('CRON.md matches scheduled task declarations.')
}
