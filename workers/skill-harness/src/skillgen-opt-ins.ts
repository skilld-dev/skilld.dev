import { z } from 'zod'

const answerSchema = z.object({ repositories: z.array(z.string()) })

/** skilld.dev answers at most this many repositories per request. */
const BATCH = 100

/**
 * Asks skilld.dev which repositories opted in to Skillgen. Maintainers opt in
 * per repository on their account page, so an App install alone queues
 * nothing. Any failed answer is `Unavailable`, and the caller queues nothing.
 */
export async function readSkillgenOptIns(input: {
  siteUrl: string
  token: string
  repositories: string[]
  fetch: typeof fetch
}): Promise<{ _tag: 'Ok', repositories: Set<string> } | { _tag: 'Unavailable', status: number }> {
  const optedIn = new Set<string>()
  const fetcher = input.fetch
  for (let start = 0; start < input.repositories.length; start += BATCH) {
    const response = await fetcher(new URL('/api/internal/skillgen/opt-ins', input.siteUrl), {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: { 'authorization': `Bearer ${input.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ repositories: input.repositories.slice(start, start + BATCH) }),
    })
    if (!response.ok)
      return { _tag: 'Unavailable', status: response.status }
    const answer = answerSchema.safeParse(await response.json())
    if (!answer.success)
      return { _tag: 'Unavailable', status: response.status }
    for (const name of answer.data.repositories)
      optedIn.add(name.toLowerCase())
  }
  return { _tag: 'Ok', repositories: optedIn }
}
