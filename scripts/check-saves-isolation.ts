/**
 * P0 privacy guard: `dev.skilld.collection.save` records are PRIVATE bookmarks.
 * They must never leak into public surfaces (homepage, network feed, search, etc).
 *
 * This script enforces that mechanically. It scans the codebase for any reference
 * to the save NSID, the save lexicon module, or the save JSON, and fails if any
 * appears outside the allow-list of legitimate save-handling code paths.
 *
 * If you legitimately need to add a new file that handles save records,
 * add its path to ALLOW. Treat that diff as a P0 review.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import process from 'node:process'

const ROOT = new URL('..', import.meta.url).pathname

const ALLOW = [
  // The lexicon definition itself
  'server/utils/atproto/lexicons/save.ts',
  'server/utils/atproto/lexicons/dev.skilld.collection.save.json',
  // Public XRPC lexicon-serving route (returns the schema, not records)
  'server/routes/xrpc/dev.skilld.collection.save.get.ts',
  // The only API surface that may read/write save records
  'server/api/collections/saves',
  // This script
  'scripts/check-saves-isolation.ts',
]

const SCAN = ['server', 'app', 'scripts']
const SKIP_DIR = new Set(['node_modules', '.nuxt', '.output', 'dist', '.cache'])
const EXTS = new Set(['.ts', '.tsx', '.vue', '.js', '.mjs', '.cjs', '.json'])

// Match actual code references, not documentation. A line is treated as a
// comment when it starts with `//`, `*`, `/*`, `#`, `<!--`, or is inside an
// HTML/JSX comment.
const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*|#|<!--|-->)/

const PATTERNS = [
  /\bSAVE_NSID\b/,
  /lexicons\/save(?!s)/, // matches "lexicons/save" but not "lexicons/saves"
  // The NSID literal — only when it appears inside string quotes (real use),
  // not inside JSDoc backticks, prose, or markdown code spans.
  /['"]dev\.skilld\.collection\.save['"]/,
]

function isAllowed(rel: string): boolean {
  return ALLOW.some(p => rel === p || rel.startsWith(`${p}/`))
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (SKIP_DIR.has(entry.name))
      continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    }
    else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf('.'))
      if (EXTS.has(ext))
        yield full
    }
  }
}

const violations: { file: string, line: number, match: string }[] = []

for (const root of SCAN) {
  const dir = join(ROOT, root)
  try {
    await stat(dir)
  }
  catch { continue }

  for await (const file of walk(dir)) {
    const rel = relative(ROOT, file)
    if (isAllowed(rel))
      continue
    const content = await readFile(file, 'utf8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (COMMENT_LINE.test(line))
        continue
      for (const pat of PATTERNS) {
        if (pat.test(line)) {
          violations.push({ file: rel, line: i + 1, match: line.trim() })
          break
        }
      }
    }
  }
}

if (violations.length) {
  console.error('\n[saves-isolation] P0 PRIVACY VIOLATION: save records referenced outside allowed paths.\n')
  console.error('Save records (`dev.skilld.collection.save`) are PRIVATE bookmarks. They must')
  console.error('never appear in public surfaces (homepage, network feed, search, etc).\n')
  for (const v of violations)
    console.error(`  ${v.file}:${v.line}  ${v.match}`)
  console.error(`\n${violations.length} violation(s). Move the code under server/api/collections/saves/, or update ALLOW in scripts/check-saves-isolation.ts after a P0 review.`)
  process.exit(1)
}

console.log('[saves-isolation] OK')
