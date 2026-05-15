/// <reference types="@cloudflare/workers-types" />
/**
 * Read/write for the `skill_generated` D1 table. One row per (owner, name, kind).
 * `sha` pins the payload to a specific SKILL.md content hash so we can detect
 * drift and regenerate when source changes.
 */

export type GeneratedKind = 'faq' | 'tags' | 'embedding' | 'summary' | 'abstractness'

export interface GeneratedRow<T = unknown> {
  owner: string
  repo: string
  name: string
  kind: GeneratedKind
  sha: string
  payload: T
  generatedAt: string
}

interface RawRow {
  owner: string
  repo: string
  name: string
  kind: string
  sha: string
  payload: string
  generated_at: string
}

function rowToGenerated<T>(row: RawRow): GeneratedRow<T> {
  return {
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    kind: row.kind as GeneratedKind,
    sha: row.sha,
    payload: JSON.parse(row.payload) as T,
    generatedAt: row.generated_at,
  }
}

export async function getGenerated<T>(
  db: D1Database,
  key: { owner: string, repo: string, name: string, kind: GeneratedKind },
): Promise<GeneratedRow<T> | null> {
  const row = await db
    .prepare('SELECT * FROM skill_generated WHERE owner = ? AND repo = ? AND name = ? AND kind = ?')
    .bind(key.owner, key.repo, key.name, key.kind)
    .first<RawRow>()
  return row ? rowToGenerated<T>(row) : null
}

export async function getGeneratedBatch<T>(
  db: D1Database,
  keys: { owner: string, repo: string, name: string }[],
  kind: GeneratedKind,
): Promise<Map<string, GeneratedRow<T>>> {
  if (!keys.length)
    return new Map()
  // D1 caps statements at ~100 bound variables. Each key contributes 3
  // (owner, repo, name) plus the leading `kind` param.
  const CHUNK = 30
  const map = new Map<string, GeneratedRow<T>>()
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK)
    const placeholders = chunk.map(() => '(? = owner AND ? = repo AND ? = name)').join(' OR ')
    const params: string[] = []
    for (const k of chunk) params.push(k.owner, k.repo, k.name)
    const res = await db
      .prepare(`SELECT * FROM skill_generated WHERE kind = ? AND (${placeholders})`)
      .bind(kind, ...params)
      .all<RawRow>()
    for (const row of res.results ?? []) {
      map.set(`${row.owner}/${row.repo}/${row.name}`, rowToGenerated<T>(row))
    }
  }
  return map
}

export async function putGenerated<T>(
  db: D1Database,
  row: { owner: string, repo: string, name: string, kind: GeneratedKind, sha: string, payload: T },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner, repo, name, kind) DO UPDATE SET
         sha = excluded.sha,
         payload = excluded.payload,
         generated_at = excluded.generated_at`,
    )
    .bind(
      row.owner,
      row.repo,
      row.name,
      row.kind,
      row.sha,
      JSON.stringify(row.payload),
      new Date().toISOString(),
    )
    .run()
}

/** Simple SHA-1 of a string, used to key regeneration on SKILL.md content. */
export async function sha1(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  const bytes = new Uint8Array(digest)
  let out = ''
  for (let i = 0; i < bytes.length; i++)
    out += bytes[i]!.toString(16).padStart(2, '0')
  return out
}
