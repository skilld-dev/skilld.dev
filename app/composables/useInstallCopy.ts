import type { MaybeRefOrGetter } from 'vue'

interface SkillTarget {
  kind: 'skill'
  owner: string
  name: string
}

interface CollectionTarget {
  kind: 'collection'
  handle: string
  slug: string
}

export type InstallTarget = SkillTarget | CollectionTarget

export type InstallCopyResult
  = | { _tag: 'copied' }
    | { _tag: 'error', message: string }

/**
 * Which agent and mode the copy came from. Omitted by the plain copy button,
 * set by the agent setup picker.
 */
export interface InstallCopyContext {
  agent: string
  mode: 'project' | 'global' | 'once'
}

export function useInstallCopy(
  source: MaybeRefOrGetter<string>,
  surface: string,
  target: MaybeRefOrGetter<InstallTarget | null>,
) {
  const { copy: rawCopy, copied, isSupported } = useClipboard({
    source,
    copiedDuring: 2000,
    legacy: true,
  })

  async function copy(value?: string, context?: InstallCopyContext): Promise<InstallCopyResult> {
    const t = toValue(target)
    if (!t)
      return { _tag: 'error', message: 'Install target unavailable.' }

    if (!isSupported.value)
      return { _tag: 'error', message: 'Could not copy. Select the command and copy it manually.' }

    const copyResult = await rawCopy(value)
      .then((): InstallCopyResult => ({ _tag: 'copied' }))
      .catch((error): InstallCopyResult => {
        console.warn('[install-copy] Failed to copy install command:', error)
        return { _tag: 'error', message: 'Could not copy. Select the command and copy it manually.' }
      })

    if (copyResult._tag === 'error')
      return copyResult

    void $fetch('/api/events/install', {
      method: 'POST',
      body: {
        surface,
        kind: t.kind,
        ...(t.kind === 'skill'
          ? { owner: t.owner, name: t.name }
          : { handle: t.handle, slug: t.slug }),
        ...(context ?? {}),
      },
    }).catch((error) => {
      console.warn('[install-copy] Failed to record install event:', error)
    })

    return copyResult
  }

  return { copy, copied }
}
