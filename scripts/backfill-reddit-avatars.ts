#!/usr/bin/env tsx
/**
 * Backfill author avatars for reddit posts in skill_social_posts.
 * Reddit's user about.json gives icon_img / snoovatar_img.
 *
 * Outputs SQL UPDATE statements to stdout. Apply with wrangler d1 execute.
 */

interface RedditUserAbout {
  data: {
    icon_img?: string
    snoovatar_img?: string
    name: string
  }
}

function sqlEscape(value: string | null): string {
  if (value === null)
    return 'NULL'
  return `'${value.replace(/'/g, '\'\'')}'`
}

async function fetchAvatar(handle: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.reddit.com/user/${handle}/about.json`, {
      headers: { 'user-agent': 'skilld.dev social ingest (+https://skilld.dev)' },
    })
    if (!res.ok)
      return null
    const data = await res.json() as RedditUserAbout
    const url = data.data?.snoovatar_img || data.data?.icon_img
    if (!url)
      return null
    // Reddit URLs come with HTML-encoded amps
    return url.replace(/&amp;/g, '&')
  }
  catch {
    return null
  }
}

const AUTHORS = [
  'According_Brief_9970',
  'geekeek123',
  'Zestyclose-Ad-9003',
  'WatchMySixWillYa',
  'silveroff',
]

async function main() {
  const updates: string[] = []
  for (const handle of AUTHORS) {
    const avatar = await fetchAvatar(handle)
    process.stderr.write(`@${handle} → ${avatar ?? 'no avatar'}\n`)
    if (!avatar)
      continue
    updates.push(`UPDATE skill_social_posts SET author_avatar = ${sqlEscape(avatar)} WHERE platform = 'reddit' AND author_handle = ${sqlEscape(handle)};`)
  }
  process.stdout.write(`-- Backfill ${updates.length} reddit author avatars\n`)
  process.stdout.write(`${updates.join('\n')}\n`)
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err}\n`)
  process.exit(1)
})
