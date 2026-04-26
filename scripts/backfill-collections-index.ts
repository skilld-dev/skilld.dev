/**
 * One-shot backfill of the collections index from current PDS state.
 *
 * Reads curator DIDs from stdin (one per line) or argv, fetches each curator's
 * `dev.skilld.collection` records from their PDS, and emits SQL on stdout.
 * Pipe through wrangler d1 execute.
 *
 * Usage:
 *   # Local
 *   npx wrangler d1 execute skilld-db --local --command 'SELECT did FROM curators' --json \
 *     | jq -r '.[0].results[].did' \
 *     | npx tsx scripts/backfill-collections-index.ts \
 *     | npx wrangler d1 execute skilld-db --local --file=-
 *
 *   # Remote
 *   npx wrangler d1 execute skilld-db --remote --command 'SELECT did FROM curators' --json \
 *     | jq -r '.[0].results[].did' \
 *     | npx tsx scripts/backfill-collections-index.ts \
 *     | npx wrangler d1 execute skilld-db --remote --file=-
 *
 *   # Single DID
 *   npx tsx scripts/backfill-collections-index.ts did:plc:foo did:plc:bar | ...
 *
 * Idempotent: re-runs upsert by URI, won't duplicate.
 *
 * PRIVACY (P0): only `dev.skilld.collection` records are fetched.
 * Save records (`dev.skilld.collection.save`) are NEVER touched.
 */

import { Buffer } from 'node:buffer'
import process from 'node:process'
import { Agent } from '@atproto/api'

interface PlcDoc {
  service?: { id: string, serviceEndpoint: string }[]
}

interface CollectionSkill {
  packageName: string
  reason?: string
  owner?: string
  repo?: string
}

interface CollectionRecord {
  name: string
  slug: string
  description: string
  preamble?: string
  skills: CollectionSkill[]
  stacks: string[]
  postRef?: { uri: string, cid: string }
  createdAt: string
  updatedAt: string
}

const COLLECTION_NSID = 'dev.skilld.collection'

async function resolvePds(did: string): Promise<string> {
  const url = did.startsWith('did:plc:')
    ? `https://plc.directory/${did}`
    : `https://${did.replace('did:web:', '')}/.well-known/did.json`
  const res = await fetch(url)
  if (!res.ok)
    throw new Error(`PLC lookup failed for ${did}: ${res.status}`)
  const doc = await res.json() as PlcDoc
  const pds = doc.service?.find(s => s.id === '#atproto_pds')
  if (!pds?.serviceEndpoint)
    throw new Error(`No PDS in DID document for ${did}`)
  return pds.serviceEndpoint
}

async function readDids(): Promise<string[]> {
  const fromArgs = process.argv.slice(2).filter(a => a.startsWith('did:'))
  if (fromArgs.length)
    return fromArgs

  const chunks: Buffer[] = []
  for await (const chunk of process.stdin)
    chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8').split('\n').map(l => l.trim()).filter(l => l.startsWith('did:'))
}

const sqlEscape = (s: string) => s.replace(/'/g, '\'\'')
const v = (x: string | null) => x === null ? 'NULL' : `'${sqlEscape(x)}'`
const nowSec = Math.floor(Date.now() / 1000)

async function syncDid(did: string): Promise<{ collectionStmts: string[], skillStmts: string[] }> {
  const pds = await resolvePds(did)
  const agent = new Agent(pds)
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: COLLECTION_NSID,
    limit: 100,
  })

  const collectionStmts: string[] = []
  const skillStmts: string[] = []

  for (const rec of res.data.records) {
    const record = rec.value as CollectionRecord
    const uri = rec.uri
    const rkey = uri.split('/').pop()!
    const createdAt = Math.floor(Date.parse(record.createdAt) / 1000)
    const updatedAt = Math.floor(Date.parse(record.updatedAt) / 1000)

    collectionStmts.push(
      `INSERT INTO collections (uri, did, rkey, slug, name, description, preamble, stacks, post_uri, post_cid, created_at, updated_at, indexed_at, deleted_at) VALUES (`
      + `${v(uri)}, ${v(did)}, ${v(rkey)}, ${v(record.slug)}, ${v(record.name)}, ${v(record.description)}, `
      + `${v(record.preamble ?? null)}, ${v(JSON.stringify(record.stacks ?? []))}, `
      + `${v(record.postRef?.uri ?? null)}, ${v(record.postRef?.cid ?? null)}, `
      + `${createdAt}, ${updatedAt}, ${nowSec}, NULL`
      + `) ON CONFLICT(uri) DO UPDATE SET `
      + `slug=excluded.slug, name=excluded.name, description=excluded.description, `
      + `preamble=excluded.preamble, stacks=excluded.stacks, post_uri=excluded.post_uri, `
      + `post_cid=excluded.post_cid, updated_at=excluded.updated_at, indexed_at=excluded.indexed_at, deleted_at=NULL;`,
    )

    skillStmts.push(`DELETE FROM collection_skills WHERE collection_uri = ${v(uri)};`)
    record.skills?.forEach((s, i) => {
      skillStmts.push(
        `INSERT INTO collection_skills (collection_uri, position, package_name, owner, repo, reason) VALUES (`
        + `${v(uri)}, ${i}, ${v(s.packageName)}, ${v(s.owner ?? null)}, ${v(s.repo ?? null)}, ${v(s.reason ?? null)}`
        + `);`,
      )
    })
  }

  return { collectionStmts, skillStmts }
}

const dids = await readDids()
if (!dids.length) {
  console.error('No DIDs provided. Pass on stdin (one per line) or as args.')
  process.exit(1)
}

console.error(`[backfill] Syncing ${dids.length} curator(s)...`)

let total = 0
for (const did of dids) {
  try {
    const { collectionStmts, skillStmts } = await syncDid(did)
    process.stdout.write(`-- ${did} (${collectionStmts.length} collections)\n`)
    for (const stmt of collectionStmts)
      process.stdout.write(`${stmt}\n`)
    for (const stmt of skillStmts)
      process.stdout.write(`${stmt}\n`)
    total += collectionStmts.length
  }
  catch (err) {
    console.error(`[backfill] FAILED ${did}:`, (err as Error).message)
  }
}

console.error(`[backfill] Emitted SQL for ${total} collection record(s).`)
