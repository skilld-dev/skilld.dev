#!/usr/bin/env tsx
/**
 * Probe Bluesky public API endpoints from this network.
 * Tests both the AppView and direct PDS routes via the SDK.
 */
import { Agent } from '@atproto/api'

const ENDPOINTS = [
  'https://public.api.bsky.app',
  'https://api.bsky.app',
  'https://bsky.social',
]

const QUERIES = [
  'mattpocock claude skill',
  'obra superpowers',
  'antfu skills',
  'shadcn claude',
]

async function probe(endpoint: string) {
  console.log(`\n=== ${endpoint} ===`)
  const agent = new Agent(endpoint)

  // 1. Try a simple resolveHandle
  try {
    const res = await agent.resolveHandle({ handle: 'mattpocock.com' })
    console.log(`  resolveHandle mattpocock.com → did=${res.data.did}`)
  }
  catch (err) {
    console.log(`  resolveHandle failed: ${(err as Error).message}`)
  }

  // 2. Try getProfile
  try {
    const res = await agent.getProfile({ actor: 'mattpocock.com' })
    console.log(`  getProfile @${res.data.handle} (${res.data.displayName})`)
  }
  catch (err) {
    console.log(`  getProfile failed: ${(err as Error).message}`)
  }

  // 3. Try searchPosts
  for (const q of QUERIES) {
    try {
      const res = await agent.app.bsky.feed.searchPosts({ q, limit: 3 })
      console.log(`  searchPosts "${q}" → ${res.data.posts.length} posts`)
      for (const p of res.data.posts.slice(0, 3)) {
        const text = (p.record as { text: string }).text.replace(/\s+/g, ' ').slice(0, 120)
        console.log(`    @${p.author.handle}: ${text}`)
      }
    }
    catch (err) {
      console.log(`  searchPosts "${q}" failed: ${(err as Error).message}`)
    }
  }
}

async function probeRaw(endpoint: string) {
  console.log(`\n=== RAW ${endpoint} ===`)
  // Try direct fetch with various UA patterns
  const headers = {
    'user-agent': 'atproto-api/0 (skilld.dev)',
    'accept': 'application/json',
  }
  try {
    const res = await fetch(`${endpoint}/xrpc/app.bsky.feed.searchPosts?q=obra&limit=2`, { headers })
    console.log(`  status=${res.status} ct=${res.headers.get('content-type')}`)
    const body = await res.text()
    console.log(`  body[0:200]: ${body.slice(0, 200)}`)
  }
  catch (err) {
    console.log(`  fetch failed: ${(err as Error).message}`)
  }
}

async function main() {
  for (const ep of ENDPOINTS) {
    await probeRaw(ep)
  }
  for (const ep of ENDPOINTS) {
    await probe(ep)
  }
}

main().catch(err => console.error(err))
