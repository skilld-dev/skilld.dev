/**
 * Read classifications.jsonl and produce a markdown summary for research.
 *
 * Usage: npx tsx scripts/summarize-classifications.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'

const INPUT = '/tmp/skilld-ux/classifications.jsonl'
const OUTPUT = '/tmp/skilld-ux/classification-summary.md'

interface Record {
  key: string
  name: string
  owner: string
  repo: string
  description: string
  kind: 'abstract' | 'package-specific'
  package: string | null
  category: string
  confidence: number
}

function load(): Record[] {
  const raw = readFileSync(INPUT, 'utf8')
  const out: Record[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim())
      continue
    try {
      out.push(JSON.parse(line) as Record)
    }
    catch {
      // skip
    }
  }
  return out
}

function topN<T extends string>(counts: Map<T, number>, n: number): [T, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

function shuffle<T>(arr: T[], seed = 42): T[] {
  // deterministic LCG-based shuffle for reproducibility
  const a = [...arr]
  let s = seed
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x1_0000_0000
  }
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function excerpt(text: string, n = 140): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function main(): void {
  const records = load()
  const abstract = records.filter(r => r.kind === 'abstract')
  const pkg = records.filter(r => r.kind === 'package-specific')

  const pkgCounts = new Map<string, number>()
  for (const r of pkg) {
    const k = r.package ?? '(unknown)'
    pkgCounts.set(k, (pkgCounts.get(k) ?? 0) + 1)
  }

  const catCounts = new Map<string, number>()
  const catExamples = new Map<string, string[]>()
  for (const r of abstract) {
    const k = r.category || 'unknown'
    catCounts.set(k, (catCounts.get(k) ?? 0) + 1)
    const arr = catExamples.get(k) ?? []
    if (arr.length < 4)
      arr.push(r.name)
    catExamples.set(k, arr)
  }

  const sample = shuffle(abstract).slice(0, 20)

  const lines: string[] = []
  lines.push('# Skill abstractness classification — summary\n')
  lines.push(`**Source:** \`/tmp/skilld-ux/top-skills.tsv\` (top 1200 skills by installs)`)
  lines.push(`**Classifier:** Haiku 4.5 via \`claude -p\` CLI`)
  lines.push(`**Records classified:** ${records.length}\n`)
  lines.push('## Overall counts\n')
  lines.push(`| Kind | Count | Share |`)
  lines.push(`| --- | ---: | ---: |`)
  lines.push(`| abstract | ${abstract.length} | ${((abstract.length / records.length) * 100).toFixed(1)}% |`)
  lines.push(`| package-specific | ${pkg.length} | ${((pkg.length / records.length) * 100).toFixed(1)}% |`)
  lines.push('')

  lines.push('## Top 20 packages by skill count (package-specific)\n')
  lines.push('| Package | Skills |')
  lines.push('| --- | ---: |')
  for (const [p, c] of topN(pkgCounts, 20))
    lines.push(`| \`${p}\` | ${c} |`)
  lines.push('')

  lines.push('## Top 30 categories among abstract skills\n')
  lines.push('| Category | Count | Examples |')
  lines.push('| --- | ---: | --- |')
  for (const [c, n] of topN(catCounts, 30)) {
    const ex = (catExamples.get(c) ?? []).map(x => `\`${x}\``).join(', ')
    lines.push(`| ${c} | ${n} | ${ex} |`)
  }
  lines.push('')

  lines.push('## 20 random abstract skills (sanity check)\n')
  for (const r of sample) {
    lines.push(`- **${r.name}** \`${r.owner}/${r.repo}\` — _${r.category}_ (conf ${r.confidence.toFixed(2)})`)
    lines.push(`  ${excerpt(r.description, 200)}`)
  }
  lines.push('')

  lines.push('## Confidence distribution\n')
  const buckets: Record<string, number> = { '<0.5': 0, '0.5-0.7': 0, '0.7-0.9': 0, '>=0.9': 0 }
  for (const r of records) {
    if (r.confidence < 0.5)
      buckets['<0.5']! += 1
    else if (r.confidence < 0.7)
      buckets['0.5-0.7']! += 1
    else if (r.confidence < 0.9)
      buckets['0.7-0.9']! += 1
    else
      buckets['>=0.9']! += 1
  }
  for (const [k, v] of Object.entries(buckets))
    lines.push(`- ${k}: ${v}`)
  lines.push('')

  writeFileSync(OUTPUT, lines.join('\n'))
  process.stderr.write(`Wrote ${OUTPUT}\n`)
  process.stderr.write(`abstract=${abstract.length} package=${pkg.length} total=${records.length}\n`)
}

main()
