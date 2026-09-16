import type { MaybeRefOrGetter } from 'vue'

export type InstallCopyResult
  = | { _tag: 'copied' }
    | { _tag: 'error', message: string }

/**
 * Copies a run or install command. Nothing about the copy leaves the browser.
 */
export function useInstallCopy(source: MaybeRefOrGetter<string>) {
  const { copy: rawCopy, copied, isSupported } = useClipboard({
    source,
    copiedDuring: 2000,
    legacy: true,
  })

  async function copy(value?: string): Promise<InstallCopyResult> {
    if (!(value ?? toValue(source)))
      return { _tag: 'error', message: 'Install command unavailable.' }

    if (!isSupported.value)
      return { _tag: 'error', message: 'Could not copy. Select the command and copy it manually.' }

    return rawCopy(value)
      .then((): InstallCopyResult => ({ _tag: 'copied' }))
      .catch((error): InstallCopyResult => {
        console.warn('[install-copy] Failed to copy install command:', error)
        return { _tag: 'error', message: 'Could not copy. Select the command and copy it manually.' }
      })
  }

  return { copy, copied }
}
