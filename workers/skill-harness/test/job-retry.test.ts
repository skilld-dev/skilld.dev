import { expect, it } from 'vitest'
import { followsRetryChain } from '../src/job-retry'

it('accepts a retry after an earlier retry failed before source preparation', async () => {
  const retries = new Map([['original', 'first'], ['first', 'second']])
  expect(await followsRetryChain('original', 'second', async id => retries.get(id))).toBe(true)
  expect(await followsRetryChain('original', 'unrelated', async id => retries.get(id))).toBe(false)
})

it('rejects cyclic retry records', async () => {
  const retries = new Map([['original', 'first'], ['first', 'original']])
  expect(await followsRetryChain('original', 'second', async id => retries.get(id))).toBe(false)
})
