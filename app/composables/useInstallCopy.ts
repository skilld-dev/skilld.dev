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

/**
 * A whole repository, which is what `skilld add owner/repo` installs. The
 * homepage hero copies this shape, and calling it a skill would file the site's
 * most-copied command under a skill name that does not exist.
 */
interface RepoTarget {
  kind: 'repo'
  owner: string
  repo: string
}

export type InstallTarget = SkillTarget | CollectionTarget | RepoTarget

export type InstallCopyResult
  = | { _tag: 'copied' }
    | { _tag: 'error', message: string }

/**
 * Which grammar the copied command speaks. Every surface knows this
 * statically, so telemetry can separate a run copy from an install copy.
 */
export type InstallCopyMode = 'run' | 'install'

export function useInstallCopy(
  source: MaybeRefOrGetter<string>,
  surface: string,
  mode: InstallCopyMode,
  target: MaybeRefOrGetter<InstallTarget | null>,
) {
  const { copy: rawCopy, copied, isSupported } = useClipboard({
    source,
    copiedDuring: 2000,
    legacy: true,
  })

  async function copy(value?: string): Promise<InstallCopyResult> {
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
        mode,
        kind: t.kind,
        ...(t.kind === 'skill'
          ? { owner: t.owner, name: t.name }
          : t.kind === 'repo'
            ? { owner: t.owner, name: t.repo }
            : { handle: t.handle, slug: t.slug }),
      },
    }).catch((error) => {
      console.warn('[install-copy] Failed to record install event:', error)
    })

    return copyResult
  }

  return { copy, copied }
}
