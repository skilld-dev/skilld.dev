/**
 * Bounded-concurrency parallel map. Worker-pool pattern: N workers pull from
 * a shared cursor, so slow tasks don't stall fast ones in the same batch.
 * Returns results in original order.
 */
export async function pAll<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = Array.from({ length: items.length })
  let cursor = 0
  const width = Math.max(1, Math.min(concurrency, items.length))
  const workers = Array.from({ length: width }, async () => {
    while (cursor < items.length) {
      const i = cursor
      cursor += 1
      const item = items[i]!
      try {
        const value = await fn(item, i)
        results[i] = { status: 'fulfilled', value }
      }
      catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(workers)
  return results
}
