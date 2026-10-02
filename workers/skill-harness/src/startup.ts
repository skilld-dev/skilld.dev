export async function startOutsideLock<T>(lock: (callback: () => Promise<T>) => Promise<T>, claim: () => Promise<T>, launch: (state: T) => Promise<void>): Promise<void> {
  const state = await lock(claim)
  await launch(state)
}
