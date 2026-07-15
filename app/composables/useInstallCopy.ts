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

export function useInstallCopy(
  source: MaybeRefOrGetter<string>,
  surface: string,
  target: MaybeRefOrGetter<InstallTarget>,
) {
  const { copy: rawCopy, copied } = useClipboard({ source, copiedDuring: 2000 })

  async function copy(value?: string) {
    await rawCopy(value)
    const t = toValue(target)
    void $fetch('/api/events/install', {
      method: 'POST',
      body: {
        surface,
        kind: t.kind,
        ...(t.kind === 'skill'
          ? { owner: t.owner, name: t.name }
          : { handle: t.handle, slug: t.slug }),
      },
    }).catch((error) => {
      console.warn('[install-copy] Failed to record install event:', error)
    })
  }

  return { copy, copied }
}
