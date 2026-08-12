import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('layers/marketing/app/pages/skills/[cluster].vue', 'utf8')

describe('cluster page async contract', () => {
  it('resolves its request during SSR so crawlers get the real title', () => {
    // This page previously used `useLazyFetch` to keep a loading skeleton
    // reachable on first paint. `useLazyFetch` does not hold SSR, so the server
    // response carried `data === null`: the fallback title for every category,
    // and `noindex` once the thin-category guard landed. The skeleton was worth
    // less than the ranking, which is the only reason this page exists.
    //
    // The loading state is still reachable: on client-side navigation the
    // request is still pending on mount, so `status` drives it exactly as
    // before. Only the initial server render changed.
    expect(source).toContain('await useFetch<ClusterDetailResponse>')
    expect(source).not.toContain('useLazyFetch<ClusterDetailResponse>')
  })

  it('leaves the global title template to add the site suffix once', () => {
    expect(source).not.toContain('cluster.label} · skilld')
    expect(source).not.toContain(`'Outcome skills · skilld'`)
    expect(source).not.toContain('seoTitle} · skilld')
  })
})
