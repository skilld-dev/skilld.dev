import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('layers/marketing/app/pages/skills/[cluster].vue', 'utf8')

describe('cluster page async contract', () => {
  it('mounts before its request resolves so the local loading state is reachable', () => {
    expect(source).toContain('useLazyFetch<ClusterDetailResponse>')
    expect(source).not.toContain('await useFetch<ClusterDetailResponse>')
  })

  it('leaves the global title template to add the site suffix once', () => {
    expect(source).not.toContain('cluster.label} · skilld')
    expect(source).not.toContain(`'Outcome skills · skilld'`)
  })
})
