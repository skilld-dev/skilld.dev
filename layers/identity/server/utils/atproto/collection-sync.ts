/**
 * Sync a curator's `dev.skilld.collection` records into the D1 index.
 *
 * Source of truth: the curator's PDS. This index is a denormalized projection
 * for low-latency feed queries. Idempotent — call as often as needed.
 *
 * PRIVACY (P0): only `dev.skilld.collection` records are read. Save records
 * (`dev.skilld.collection.save`) MUST NEVER enter this index. Enforced
 * mechanically by `scripts/check-saves-isolation.ts`.
 */

/// <reference types="@cloudflare/workers-types" />
import { listCollectionRecords } from './collections'

const rkeyFromUri = (uri: string) => uri.split('/').pop()!

const nowSec = () => Math.floor(Date.now() / 1000)

interface SyncOutcome {
  upserted: number
  tombstoned: number
}

/** Sync all collections for a single curator. */
export async function syncCuratorCollections(db: D1Database, did: string): Promise<SyncOutcome> {
  const records = await listCollectionRecords(did)
  const now = nowSec()

  // Find the previously-known live URIs for this curator so we can soft-delete
  // any that disappeared (collection was deleted on the PDS).
  const existingRes = await db.prepare(
    'SELECT uri FROM collections WHERE did = ? AND deleted_at IS NULL',
  ).bind(did).all<{ uri: string }>()
  const existing = new Set((existingRes.results ?? []).map(r => r.uri))
  const seen = new Set<string>()

  const stmts: D1PreparedStatement[] = []

  for (const { uri, record } of records) {
    seen.add(uri)
    const rkey = rkeyFromUri(uri)
    const createdAt = Math.floor(Date.parse(record.createdAt) / 1000)
    const updatedAt = Math.floor(Date.parse(record.updatedAt) / 1000)

    stmts.push(
      db.prepare(`
        INSERT INTO collections (
          uri, did, rkey, slug, name, description, preamble, stacks,
          post_uri, post_cid, created_at, updated_at, indexed_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(uri) DO UPDATE SET
          slug         = excluded.slug,
          name         = excluded.name,
          description  = excluded.description,
          preamble     = excluded.preamble,
          stacks       = excluded.stacks,
          post_uri     = excluded.post_uri,
          post_cid     = excluded.post_cid,
          updated_at   = excluded.updated_at,
          indexed_at   = excluded.indexed_at,
          deleted_at   = NULL
      `).bind(
        uri,
        did,
        rkey,
        record.slug,
        record.name,
        record.description,
        record.preamble ?? null,
        JSON.stringify(record.stacks),
        record.postRef?.uri ?? null,
        record.postRef?.cid ?? null,
        createdAt,
        updatedAt,
        now,
      ),
      // Replace skill rows wholesale; positions shift on edit.
      db.prepare('DELETE FROM collection_skills WHERE collection_uri = ?').bind(uri),
    )

    if (record.skills.length) {
      const placeholders = record.skills.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
      const binds: (string | number | null)[] = []
      record.skills.forEach((s, i) => {
        binds.push(uri, i, s.packageName, s.owner ?? null, s.repo ?? null, s.reason ?? null)
      })
      stmts.push(
        db.prepare(`
          INSERT INTO collection_skills (collection_uri, position, package_name, owner, repo, reason)
          VALUES ${placeholders}
        `).bind(...binds),
      )
    }
  }

  // Soft-delete any URI we knew about that didn't come back in the listing.
  let tombstoned = 0
  for (const uri of existing) {
    if (!seen.has(uri)) {
      stmts.push(
        db.prepare('UPDATE collections SET deleted_at = ? WHERE uri = ? AND deleted_at IS NULL')
          .bind(now, uri),
      )
      tombstoned++
    }
  }

  if (stmts.length)
    await db.batch(stmts)

  return { upserted: records.length, tombstoned }
}

/** Tombstone every live collection for a curator. Used when a curator is dropped. */
export async function tombstoneCuratorCollections(db: D1Database, did: string): Promise<number> {
  const now = nowSec()
  const res = await db.prepare(
    'UPDATE collections SET deleted_at = ? WHERE did = ? AND deleted_at IS NULL',
  ).bind(now, did).run()
  return res.meta?.changes ?? 0
}
