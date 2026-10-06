import { expect, it } from 'vitest'
import { readSkillgenOptIns } from '../src/skillgen-opt-ins'

it('reads opt-ins with a fetch function that rejects an object receiver', async () => {
  const fetcher: typeof fetch = async function (this: unknown) {
    if (this !== undefined && this !== globalThis)
      throw new TypeError('Illegal invocation')
    return Response.json({ repositories: ['Maintainer/opted'] })
  }

  const result = await readSkillgenOptIns({
    siteUrl: 'https://skilld.dev',
    token: 'site-token',
    repositories: ['Maintainer/opted'],
    fetch: fetcher,
  })

  expect(result).toEqual({ _tag: 'Ok', repositories: new Set(['maintainer/opted']) })
})
