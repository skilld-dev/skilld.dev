export async function followsRetryChain(previous: string, current: string, readReplacement: (id: string) => Promise<string | undefined>): Promise<boolean> {
  const visited = new Set<string>()
  let id = previous
  while (visited.size < 64 && !visited.has(id)) {
    if (id === current)
      return true
    visited.add(id)
    const next = await readReplacement(id)
    if (!next)
      return false
    id = next
  }
  return false
}
