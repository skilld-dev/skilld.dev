/**
 * Fails when any Vue component stacks a muted label directly above a heading.
 *
 * DESIGN.md bans eyebrow text. The rule is cheap to break by accident, because
 * `.section-label` and `.data-label` are both correct in other positions, so
 * the ban only holds if something checks it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { findEyebrows } from './lib/eyebrow-scan'

const root = resolve(import.meta.dirname, '..')
const ROOTS = ['app', 'layers']
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', 'worktrees', 'dist'])

function collectComponents(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP_DIRS.has(entry))
      return []
    const path = join(dir, entry)
    if (statSync(path).isDirectory())
      return collectComponents(path)
    return entry.endsWith('.vue') ? [path] : []
  })
}

const findings = ROOTS
  .flatMap(dir => collectComponents(join(root, dir)))
  .flatMap(path => findEyebrows(readFileSync(path, 'utf8'))
    .map(finding => ({ ...finding, file: relative(root, path) })))

if (findings.length === 0) {
  console.log(JSON.stringify({ _tag: 'clean', rule: 'no-eyebrow-text' }, null, 2))
}
else {
  for (const finding of findings)
    console.error(`${finding.file}:${finding.line}  label "${finding.text}" sits above <${finding.heading}>`)
  console.error(`\n${findings.length} eyebrow${findings.length === 1 ? '' : 's'} found. DESIGN.md bans a muted label stacked above a heading.`)
  console.error('Delete it, promote it into the heading, or demote it to a data line below.')
  process.exitCode = 1
}
